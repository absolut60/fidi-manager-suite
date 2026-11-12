// FM62 G5: avvio e stato dell'invio email a più fornitori. L'invio vero lo fa
// solo il job Inngest `fornitori-invio-multiplo` (invio-fornitori.server.ts),
// una email separata per fornitore. Gate: auth_puo_gestire_fornitori().
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "@/lib/inngest/client";
import { byteBase64, MAX_ALLEGATI_FORNITORE_BYTES } from "@/lib/comunicazioni-fornitore";
import { avviaInvioFornitoriInput, pianificaInvioFornitori, MAX_FORNITORI_INVIO } from "@/lib/invio-multiplo-fornitori";

export const EVENTO_INVIO_FORNITORI = "fornitori/invio-multiplo.requested";
type RigaFornitore = { id: string; ragione_sociale: string | null; nome: string | null; email: string | null };

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const sanitizeName = (s: string) => s.replace(/[^\w.\-]+/g, "_").slice(0, 100);

/** Destinatari dei fornitori selezionati: chi riceve e chi viene saltato (senza email). */
export const anteprimaInvioFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fornitoriIds: z.array(z.string().uuid()).min(1).max(MAX_FORNITORI_INVIO) }).parse(d))
  .handler(async ({ data, context }) => {
    const righe: RigaFornitore[] = [];
    for (let i = 0; i < data.fornitoriIds.length; i += 200) {
      const { data: r, error } = await context.supabase.from("fornitori").select("id, ragione_sociale, nome, email").in("id", data.fornitoriIds.slice(i, i + 200));
      if (error) throw new Error(`Lettura fornitori fallita: ${error.message}`);
      righe.push(...((r ?? []) as RigaFornitore[]));
    }
    const { destinatari, saltati } = pianificaInvioFornitori(righe);
    const nome = (f: RigaFornitore) => f.ragione_sociale || f.nome || "Fornitore";
    return {
      destinatari: destinatari.map(f => ({ id: f.id, nome: nome(f), email: f.email })).sort((a, b) => a.nome.localeCompare(b.nome, "it")),
      saltati: saltati.map(f => ({ id: f.id, nome: nome(f) })).sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    };
  });

export const avviaInvioFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const r = avviaInvioFornitoriInput.safeParse(d);
    if (!r.success) throw new Error(r.error.issues.map(i => i.message).join(" · "));
    return r.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: puo, error: eP } = await supabase.rpc("auth_puo_gestire_fornitori" as never);
    if (eP || puo !== true) throw new Error("Non autorizzato");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Anti-doppione: stessa chiave = stesso invio, nessuna nuova coda.
    const { data: gia } = await supabaseAdmin.from("invii_fornitori").select("id, totale, saltati").eq("chiave_invio", data.chiaveInvio).maybeSingle();
    if (gia) return { invioId: gia.id, totale: gia.totale, saltati: gia.saltati, giaAvviato: true };

    const totaleByte = data.nuoviAllegati.reduce((s, a) => s + byteBase64(a.base64), 0);
    if (totaleByte > MAX_ALLEGATI_FORNITORE_BYTES) throw new Error("Gli allegati superano il limite di 10 MB.");

    const righe: RigaFornitore[] = [];
    for (let i = 0; i < data.fornitoriIds.length; i += 200) {
      const { data: r, error } = await supabase.from("fornitori").select("id, ragione_sociale, nome, email").in("id", data.fornitoriIds.slice(i, i + 200));
      if (error) throw new Error(`Lettura fornitori fallita: ${error.message}`);
      righe.push(...((r ?? []) as RigaFornitore[]));
    }
    const { destinatari, saltati } = pianificaInvioFornitori(righe);
    if (!destinatari.length) throw new Error("Nessuno dei fornitori selezionati ha un indirizzo email valido.");

    const invioId = crypto.randomUUID();
    const allegati: { nome: string; path: string; mime: string; bytes: number }[] = [];
    for (const a of data.nuoviAllegati) {
      let bytes: Uint8Array;
      try { bytes = b64ToBytes(a.base64); } catch { throw new Error(`Il file "${a.filename}" non è leggibile.`); }
      const path = `invii_fornitori/${invioId}/${crypto.randomUUID()}-${sanitizeName(a.filename)}`;
      const { error } = await supabaseAdmin.storage.from("allegati").upload(path, bytes, { contentType: a.contentType || "application/octet-stream", upsert: false });
      if (error) {
        if (allegati.length) await supabaseAdmin.storage.from("allegati").remove(allegati.map(x => x.path));
        throw new Error(`Caricamento di "${a.filename}" fallito: ${error.message}`);
      }
      allegati.push({ nome: a.filename, path, mime: a.contentType || "application/octet-stream", bytes: bytes.byteLength });
    }
    const pulisci = async () => { if (allegati.length) await supabaseAdmin.storage.from("allegati").remove(allegati.map(x => x.path)); };

    const { error: eInv } = await supabaseAdmin.from("invii_fornitori").insert({
      id: invioId, chiave_invio: data.chiaveInvio, oggetto: data.oggetto, corpo_html: data.html.html, allegati,
      creato_da: userId, totale: destinatari.length, saltati: saltati.length,
    });
    if (eInv) { await pulisci(); throw new Error(`Registrazione dell'invio fallita: ${eInv.message}`); }

    // Una riga per fornitore, già "in invio": il job la spedisce una sola volta.
    const nomiAllegati = allegati.length ? `\n\n— Allegati: ${allegati.map(a => a.nome).join(", ")}` : "";
    const ora = new Date().toISOString();
    for (let i = 0; i < destinatari.length; i += 200) {
      const { error } = await supabaseAdmin.from("attivita_fornitore").insert(destinatari.slice(i, i + 200).map(f => ({
        fornitore_id: f.id, invio_id: invioId, tipo: "email", origine: "invio", stato: "in_invio", chiave_invio: crypto.randomUUID(),
        oggetto: data.oggetto, corpo: data.html.testo + nomiAllegati, corpo_html: data.html.html, destinatari: [f.email],
        creato_da: userId, data_attivita: ora,
      })));
      if (error) {
        await supabaseAdmin.from("invii_fornitori").delete().eq("id", invioId);
        await pulisci();
        throw new Error(`Preparazione dell'invio fallita: ${error.message}. Nessuna email inviata.`);
      }
    }
    try {
      await sendInngestEvent(EVENTO_INVIO_FORNITORI, { invio_id: invioId });
    } catch (e) {
      await supabaseAdmin.from("attivita_fornitore").delete().eq("invio_id", invioId).eq("stato", "in_invio");
      await supabaseAdmin.from("invii_fornitori").delete().eq("id", invioId);
      await pulisci();
      throw new Error(`Avvio dell'invio non riuscito: ${e instanceof Error ? e.message : String(e)}. Nessuna email inviata.`);
    }
    return { invioId, totale: destinatari.length, saltati: saltati.length, giaAvviato: false };
  });

/** Avanzamento letto dalla tabella (RLS: accesso fornitori). */
export const statoInvioFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invioId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("invii_fornitori")
      .select("id, oggetto, stato, totale, inviati, errori, saltati, creato_il, completato_il").eq("id", data.invioId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Invio non trovato");
    return r;
  });
