// FM62 G3: invio email libera al fornitore, registrata in attivita_fornitore
// (origine='invio'). Gate: auth_puo_gestire_fornitori() con il client utente.
// Nessun legame con recupero crediti / clienti (v. email-recupero.functions.ts).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendEmailViaEdge } from "@/lib/inngest/send-email.server";
import { wrapEmailHtml, SEDE_FALLBACK, formatDateIt } from "@/lib/template-email-render";
import {
  inviaEmailFornitoreInput, eseguiInvioFornitore, testoInHtml, corpoAttivitaInvio, byteBase64,
  MAX_ALLEGATI_FORNITORE_BYTES, type EsitoInvioFornitore,
} from "@/lib/comunicazioni-fornitore";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
const sanitizeName = (s: string) => s.replace(/[^\w.\-]+/g, "_").slice(0, 100);

export const inviaEmailFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const r = inviaEmailFornitoreInput.safeParse(data);
    if (!r.success) throw new Error(r.error.issues.map(i => i.message).join(" · "));
    return r.data;
  })
  .handler(async ({ data, context }): Promise<EsitoInvioFornitore> => {
    const { supabase, userId } = context;
    const { data: puo, error: eP } = await supabase.rpc("auth_puo_gestire_fornitori" as never);
    if (eP || puo !== true) throw new Error("Non autorizzato");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as typeof supabase;

    const leggiEsistente = async () => {
      const { data: r, error } = await admin.from("attivita_fornitore").select("id, stato, errore, fornitore_id").eq("chiave_invio", data.chiaveInvio).maybeSingle();
      if (error) throw new Error(`Lettura invio fallita: ${error.message}`);
      return r;
    };
    // Anti-doppione: stessa chiave → esito della riga esistente, nessun reinvio.
    const gia = await leggiEsistente();
    if (gia) {
      if (gia.fornitore_id !== data.fornitoreId) throw new Error("Chiave di invio non valida.");
      return { attivitaId: gia.id, stato: gia.stato === "inviata" || gia.stato === "errore" ? gia.stato : "in_invio", errore: gia.errore, giaInviata: true, avvisi: [] };
    }

    const { data: forn, error: eF } = await supabase.from("fornitori").select("id").eq("id", data.fornitoreId).maybeSingle();
    if (eF) throw new Error(`Lettura fornitore fallita: ${eF.message}`);
    if (!forn) throw new Error("Fornitore non trovato");

    const { data: prof } = await supabase.from("profili").select("nome, cognome, email").eq("id", userId).maybeSingle();
    const nomeOperatore = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "Operatore";
    const claimEmail = (context.claims as { email?: string } | undefined)?.email ?? null;
    const emailOperatore = prof?.email?.trim() || claimEmail || null;

    // Allegati: prima ogni controllo, poi la riga e l'invio.
    const files: { filename: string; bytes: Uint8Array; contentType: string; nuovo: boolean }[] = [];
    let totale = data.nuoviAllegati.reduce((s, a) => s + byteBase64(a.base64), 0);
    const nomiEsistenti: string[] = [];
    if (data.allegatiIds.length) {
      const { data: righe, error } = await supabase.from("allegati")
        .select("id, nome_file, storage_path, mime_type, dimensione_bytes")
        .in("id", data.allegatiIds).eq("entita_tipo", "fornitore").eq("entita_id", data.fornitoreId);
      if (error) throw new Error(`Lettura allegati fallita: ${error.message}`);
      const trovati = new Map((righe ?? []).map(r => [r.id, r]));
      totale += (righe ?? []).reduce((s, r) => s + Number(r.dimensione_bytes ?? 0), 0);
      if (totale > MAX_ALLEGATI_FORNITORE_BYTES) throw new Error(limiteMsg(totale));
      for (const id of data.allegatiIds) {
        const r = trovati.get(id);
        if (!r) throw new Error("Uno degli allegati scelti non esiste o non appartiene al fornitore.");
        const { data: blob, error: eDl } = await supabase.storage.from("allegati").download(r.storage_path);
        if (eDl || !blob) throw new Error(`Download di "${r.nome_file}" fallito: ${eDl?.message ?? "file assente"}`);
        files.push({ filename: r.nome_file, bytes: new Uint8Array(await blob.arrayBuffer()), contentType: r.mime_type || "application/octet-stream", nuovo: false });
        nomiEsistenti.push(r.nome_file);
      }
    }
    for (const a of data.nuoviAllegati) {
      let bytes: Uint8Array;
      try { bytes = b64ToBytes(a.base64); } catch { throw new Error(`Il file "${a.filename}" non è leggibile.`); }
      files.push({ filename: a.filename, bytes, contentType: a.contentType || "application/octet-stream", nuovo: true });
    }
    totale = files.reduce((s, f) => s + f.bytes.byteLength, 0);
    if (totale > MAX_ALLEGATI_FORNITORE_BYTES) throw new Error(limiteMsg(totale));

    const mittente = { nome: nomeOperatore, email: emailOperatore };
    const html = wrapEmailHtml(testoInHtml(data.testo), SEDE_FALLBACK, mittente, {
      senzaBande: true, piedeRiservatezza: true, destinatarioPiede: "fornitore", sottotitolo: "MADE Distribuzione", useCid: true,
    });

    const esito = await eseguiInvioFornitore({
      inserisci: async () => {
        const { data: ins, error } = await admin.from("attivita_fornitore").insert({
          fornitore_id: data.fornitoreId, tipo: "email", origine: "invio", stato: "in_invio", chiave_invio: data.chiaveInvio,
          oggetto: data.oggetto, corpo: corpoAttivitaInvio(data.testo, nomiEsistenti),
          destinatari: data.a, cc: data.cc, ccn: data.ccn, creato_da: userId, data_attivita: new Date().toISOString(),
        }).select("id").single();
        if (error?.code === "23505") return { duplicato: true as const };
        if (error || !ins) throw new Error(`Registrazione dell'invio fallita: ${error?.message ?? "errore"}. Email non inviata.`);
        return { id: ins.id };
      },
      leggiEsistente,
      invia: () => sendEmailViaEdge({
        to: data.a.join(", "), cc: data.cc, bcc: data.ccn, subject: data.oggetto, html,
        fromName: "MADE Distribuzione", replyTo: emailOperatore ?? undefined, inlineLogo: true,
        attachments: files.map(f => ({ filename: f.filename, content: bytesToB64(f.bytes), contentType: f.contentType })),
      }),
      aggiorna: async (id, v) => {
        const { error } = await admin.from("attivita_fornitore").update(v).eq("id", id);
        if (error) throw new Error(error.message);
      },
    });

    // File caricati al momento → allegati dell'attività (solo se inviati davvero).
    if (!esito.giaInviata && esito.stato === "inviata") {
      const descrizione = `Inviato via email il ${formatDateIt(new Date())}`;
      for (const f of files.filter(x => x.nuovo)) {
        const path = `attivita_fornitore/${esito.attivitaId}/${crypto.randomUUID()}-${sanitizeName(f.filename)}`;
        const { error: eUp } = await supabase.storage.from("allegati").upload(path, f.bytes, { contentType: f.contentType, upsert: false });
        if (eUp) { esito.avvisi.push(`"${f.filename}" non salvato tra gli allegati: ${eUp.message}`); continue; }
        const { error: eIns } = await supabase.from("allegati").insert({
          entita_tipo: "attivita_fornitore", entita_id: esito.attivitaId, cliente_id: null, nome_file: f.filename,
          storage_path: path, mime_type: f.contentType, dimensione_bytes: f.bytes.byteLength, descrizione, caricato_da: userId,
        });
        if (eIns) { await supabase.storage.from("allegati").remove([path]); esito.avvisi.push(`"${f.filename}" non salvato tra gli allegati: ${eIns.message}`); }
      }
    }
    return esito;
  });

function limiteMsg(b: number) {
  return `Gli allegati superano il limite di 10 MB (totale ${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB). Togline qualcuno e riprova.`;
}
