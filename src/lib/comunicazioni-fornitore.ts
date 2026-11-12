// FM62 G3: schemi e logica pura dell'invio email al fornitore (browser-safe,
// nessun import server). Usati da comunicazioni-fornitore.functions.ts, dalla
// finestra InviaEmailFornitoreDialog e dai test.
import { z } from "zod";
import { isEmailValida } from "@/lib/email-validazione";

export const MAX_DESTINATARI_A = 5;
export const MAX_INDIRIZZI_FORNITORE = 10;
export const MAX_ALLEGATI_FORNITORE_BYTES = 10 * 1024 * 1024;

const indirizzi = z.array(z.string().transform(v => v.trim()));

export const inviaEmailFornitoreInput = z.object({
  fornitoreId: z.string().uuid(),
  chiaveInvio: z.string().uuid(),
  a: indirizzi.min(1, "Indica almeno un destinatario.").max(MAX_DESTINATARI_A, `Massimo ${MAX_DESTINATARI_A} destinatari nel campo A.`),
  cc: indirizzi,
  ccn: indirizzi,
  oggetto: z.string().transform(v => v.trim()).pipe(z.string().min(1, "L'oggetto è obbligatorio.").max(200, "Oggetto: massimo 200 caratteri.")),
  testo: z.string().refine(v => v.trim().length > 0, "Il testo è obbligatorio.").refine(v => v.length <= 20000, "Testo: massimo 20.000 caratteri."),
  allegatiIds: z.array(z.string().uuid()).max(20),
  nuoviAllegati: z.array(z.object({ filename: z.string().min(1).max(200), contentType: z.string().max(200), base64: z.string() })).max(20),
}).superRefine((d, ctx) => {
  const tutti = [...d.a, ...d.cc, ...d.ccn];
  for (const e of tutti) if (!isEmailValida(e)) ctx.addIssue({ code: "custom", message: `Indirizzo email non valido: ${e || "(vuoto)"}` });
  if (tutti.length > MAX_INDIRIZZI_FORNITORE) ctx.addIssue({ code: "custom", message: `Massimo ${MAX_INDIRIZZI_FORNITORE} indirizzi in totale tra A, CC e CCN.` });
  const visti = new Set<string>();
  for (const e of tutti.map(x => x.toLowerCase())) {
    if (visti.has(e)) ctx.addIssue({ code: "custom", message: `Indirizzo ripetuto: ${e}` });
    visti.add(e);
  }
});
export type InviaEmailFornitoreInput = z.input<typeof inviaEmailFornitoreInput>;
export type DatiInvioFornitore = z.output<typeof inviaEmailFornitoreInput>;

/** Byte reali di una stringa base64 (senza decodificarla). */
export function byteBase64(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/** Testo semplice → HTML: escape e a capo rispettati. */
export function testoInHtml(testo: string): string {
  const esc = testo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return `<div style="white-space:normal;">${esc.replace(/\r?\n/g, "<br/>")}</div>`;
}

/** Corpo salvato nell'attività: testo + elenco dei file scelti tra gli allegati del fornitore. */
export function corpoAttivitaInvio(testo: string, nomiAllegatiFornitore: string[]): string {
  if (!nomiAllegatiFornitore.length) return testo;
  return `${testo}\n\n— Allegati dalla scheda fornitore: ${nomiAllegatiFornitore.join(", ")}`;
}

export type EsitoInvioFornitore = { attivitaId: string; stato: "in_invio" | "inviata" | "errore"; errore: string | null; giaInviata: boolean; avvisi: string[] };

/**
 * Sequenza anti-"email partita, storico non scritto": 1) riga in_invio con chiave
 * 2) invio 3) aggiornamento esito. Se la chiave esiste già non si reinvia.
 */
export async function eseguiInvioFornitore(dep: {
  inserisci: () => Promise<{ id: string } | { duplicato: true }>;
  leggiEsistente: () => Promise<{ id: string; stato: string; errore: string | null } | null>;
  invia: () => Promise<{ ok: boolean; messageId?: string | null; err?: string | null }>;
  aggiorna: (id: string, v: { stato: "inviata" | "errore"; message_id: string | null; errore: string | null }) => Promise<void>;
}): Promise<EsitoInvioFornitore> {
  const ins = await dep.inserisci();
  if ("duplicato" in ins) {
    const r = await dep.leggiEsistente();
    if (!r) throw new Error("Invio già registrato ma non leggibile: ricarica la pagina.");
    const stato = r.stato === "inviata" || r.stato === "errore" ? r.stato : "in_invio";
    return { attivitaId: r.id, stato, errore: r.errore, giaInviata: true, avvisi: [] };
  }
  let esito: { ok: boolean; messageId?: string | null; err?: string | null };
  try { esito = await dep.invia(); } catch (e) { esito = { ok: false, err: e instanceof Error ? e.message : String(e) }; }
  const v = esito.ok
    ? { stato: "inviata" as const, message_id: esito.messageId ?? null, errore: null }
    : { stato: "errore" as const, message_id: null, errore: messaggioErroreInvio(esito.err) };
  const avvisi: string[] = [];
  try { await dep.aggiorna(ins.id, v); } catch (e) { avvisi.push(`Esito non salvato nello storico: ${e instanceof Error ? e.message : String(e)}`); }
  return { attivitaId: ins.id, stato: v.stato, errore: v.errore, giaInviata: false, avvisi };
}

export function messaggioErroreInvio(err: string | null | undefined): string {
  const t = (err ?? "").trim();
  if (!t) return "Invio non riuscito per un errore sconosciuto.";
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}
