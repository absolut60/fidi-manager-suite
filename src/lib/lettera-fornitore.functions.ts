// FM62 G4/G5: lettera "comunicazione libera" ai fornitori (singola o stampa multipla).
// Stesso motore PDF delle lettere clienti (lettera-pdf.server: creaDocumentoLettera/disegnaLettera),
// destinatario = fornitore, corpo formattato dall'editor (sanificato). Gate: auth_puo_gestire_fornitori().
// Le registrazioni in attivita_fornitore (tipo 'lettera', origine 'invio') si scrivono con service_role.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatDateIt, SEDE_FALLBACK, type DatiSede } from "@/lib/template-email-render";
import { htmlInBlocchiLettera } from "@/lib/lettera-blocchi";
import { letteraFornitoreInput, lettereFornitoriInput, applicaSegnapostoFornitore, applicaSegnapostoTesto } from "@/lib/invio-multiplo-fornitori";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSb = any;
type FornitoreLettera = { id: string; ragione_sociale: string | null; nome: string | null; indirizzo: string | null; cap: string | null; citta: string | null; provincia: string | null };

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
const nomeFile = (base: string) => `${base.replace(/[^\w.\-]+/g, "_").slice(0, 80)}-${formatDateIt(new Date()).replace(/\//g, "-")}.pdf`;

async function contesto(supabase: ClienteSb, userId: string) {
  const { data: puo, error } = await supabase.rpc("auth_puo_gestire_fornitori" as never);
  if (error || puo !== true) throw new Error("Non autorizzato");
  const { data: prof } = await supabase.from("profili").select("nome, cognome, store_id").eq("id", userId).maybeSingle();
  const nomeOperatore = `${prof?.nome ?? ""} ${prof?.cognome ?? ""}`.trim() || "MADE DISTRIBUZIONE S.p.A.";
  let sede: DatiSede = SEDE_FALLBACK;
  let sedeExtra = { email: null as string | null, pec: null as string | null, ragSociale: null as string | null };
  if (prof?.store_id) {
    const { data: s } = await supabase.from("stores").select("nome, insegna, indirizzo, cap, citta, provincia, telefono, email_sede, pec_sede, ragione_sociale_sede").eq("id", prof.store_id).maybeSingle();
    if (s) {
      sede = { nome: s.nome ?? null, insegna: s.insegna ?? null, indirizzo: s.indirizzo ?? null, cap: s.cap ?? null, citta: s.citta ?? null, provincia: s.provincia ?? null, telefono: s.telefono ?? null };
      sedeExtra = { email: s.email_sede ?? null, pec: s.pec_sede ?? null, ragSociale: s.ragione_sociale_sede ?? null };
    }
  }
  return { nomeOperatore, sede, sedeExtra };
}

async function leggiFornitori(supabase: ClienteSb, ids: string[]): Promise<FornitoreLettera[]> {
  const out: FornitoreLettera[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("fornitori").select("id, ragione_sociale, nome, indirizzo, cap, citta, provincia").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`Lettura fornitori fallita: ${error.message}`);
    out.push(...((data ?? []) as FornitoreLettera[]));
  }
  const ordine = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (ordine.get(a.id) ?? 0) - (ordine.get(b.id) ?? 0));
}

async function disegna(ctxPdf: Awaited<ReturnType<typeof import("@/lib/lettera-pdf.server")["creaDocumentoLettera"]>>, f: FornitoreLettera, oggetto: string, html: string, c: Awaited<ReturnType<typeof contesto>>) {
  const { disegnaLettera } = await import("@/lib/lettera-pdf.server");
  const rag = f.ragione_sociale || f.nome || "Fornitore";
  await disegnaLettera(ctxPdf, {
    destinatario: { ragione_sociale: rag, indirizzo: f.indirizzo, cap: f.cap, citta: f.citta, provincia: f.provincia },
    sede: c.sede, sedeExtra: c.sedeExtra, oggetto: applicaSegnapostoTesto(oggetto, rag),
    corpo: htmlInBlocchiLettera(applicaSegnapostoFornitore(html, rag)), scadute: [], speseUnit: 0, nomeOperatore: c.nomeOperatore,
  });
}

/** Lettera a un fornitore: anteprima (salvaInAttivita=false) oppure PDF registrato nelle Attività. */
export const generaLetteraFornitore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const r = letteraFornitoreInput.safeParse(data);
    if (!r.success) throw new Error(r.error.issues.map(i => i.message).join(" · "));
    return r.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await contesto(supabase, userId);
    const [f] = await leggiFornitori(supabase, [data.fornitoreId]);
    if (!f) throw new Error("Fornitore non trovato");
    const { creaDocumentoLettera } = await import("@/lib/lettera-pdf.server");
    const doc = await creaDocumentoLettera();
    await disegna(doc, f, data.oggetto, data.html.html, c);
    const pdfBytes = await doc.pdfDoc.save();
    const fileName = nomeFile(`lettera-${f.ragione_sociale || f.nome || "fornitore"}`);
    let attivitaId: string | null = null;
    if (data.salvaInAttivita) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ins, error } = await supabaseAdmin.from("attivita_fornitore").insert({
        fornitore_id: f.id, tipo: "lettera", origine: "invio", stato: "inviata", chiave_invio: crypto.randomUUID(),
        oggetto: data.oggetto, corpo: data.html.testo, corpo_html: data.html.html, creato_da: userId, data_attivita: new Date().toISOString(),
      }).select("id").single();
      if (error || !ins) throw new Error(`Registrazione della lettera fallita: ${error?.message ?? "errore"}`);
      attivitaId = ins.id;
      const path = `attivita_fornitore/${ins.id}/${crypto.randomUUID()}-${fileName}`;
      const { error: eUp } = await supabaseAdmin.storage.from("allegati").upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
      const eIns = eUp ? null : (await supabaseAdmin.from("allegati").insert({
        entita_tipo: "attivita_fornitore", entita_id: ins.id, cliente_id: null, nome_file: fileName, storage_path: path,
        mime_type: "application/pdf", dimensione_bytes: pdfBytes.byteLength, descrizione: "Lettera generata", caricato_da: userId,
      })).error;
      if (eUp || eIns) {
        if (!eUp) await supabaseAdmin.storage.from("allegati").remove([path]);
        await supabaseAdmin.from("attivita_fornitore").delete().eq("id", ins.id);
        throw new Error(`Salvataggio del PDF fallito: ${(eUp ?? eIns)?.message}. Lettera non registrata.`);
      }
    }
    return { pdfBase64: bytesToB64(pdfBytes), fileName, attivitaId };
  });

/** Stampa multipla: un unico PDF con una lettera per fornitore; una attività 'lettera' per fornitore. */
export const generaLettereFornitori = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const r = lettereFornitoriInput.safeParse(data);
    if (!r.success) throw new Error(r.error.issues.map(i => i.message).join(" · "));
    return r.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await contesto(supabase, userId);
    const fornitori = await leggiFornitori(supabase, data.fornitoriIds);
    if (!fornitori.length) throw new Error("Nessun fornitore trovato");
    const { creaDocumentoLettera } = await import("@/lib/lettera-pdf.server");
    const doc = await creaDocumentoLettera();
    for (const f of fornitori) await disegna(doc, f, data.oggetto, data.html.html, c);
    const pdfBytes = await doc.pdfDoc.save();
    const fileName = nomeFile(`lettere-fornitori-${fornitori.length}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ora = new Date().toISOString();
    const nota = `\n\n— Lettera stampata insieme ad altre ${fornitori.length - 1} (${fileName}).`;
    const { error } = await supabaseAdmin.from("attivita_fornitore").insert(fornitori.map(f => ({
      fornitore_id: f.id, tipo: "lettera", origine: "invio", stato: "inviata", chiave_invio: crypto.randomUUID(),
      oggetto: applicaSegnapostoTesto(data.oggetto, f.ragione_sociale || f.nome),
      corpo: applicaSegnapostoTesto(data.html.testo, f.ragione_sociale || f.nome) + (fornitori.length > 1 ? nota : ""),
      corpo_html: applicaSegnapostoFornitore(data.html.html, f.ragione_sociale || f.nome), creato_da: userId, data_attivita: ora,
    })));
    const avvisi = error ? [`Lettere generate ma non registrate nelle Attività: ${error.message}`] : [];
    return { pdfBase64: bytesToB64(pdfBytes), fileName, lettere: fornitori.length, avvisi };
  });
