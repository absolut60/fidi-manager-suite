// FM55 — Revisione fidi: raggruppamento dei clienti in passaggi (fonte unica).
// Nessun calcolo nuovo: riusa riferimento della richiesta, segnalazioni, protezioni e alert.
import { supabase } from "@/integrations/supabase/client";
import { leggiTutteLeRighe } from "@/lib/leggi-tutte-le-righe";
import { FIDO_CLIENTE_SELECT } from "@/lib/fido-cliente";
import { isRichiestaAttiva, STATI_RICHIESTA_NON_TERMINALI } from "@/lib/fidi";
import {
  fetchFidoTeorico, fetchFidoTeoricoPerRichiesta, fetchExtraFidoProtetti, protezioneAttiva, type FidoTeoricoRow,
} from "@/lib/fido-teorico";
import { segnalazioniAnomalia } from "@/lib/fido-segnalazioni";
import {
  fetchAlertFidiAperti, statoEffettivoAlert, alertLasciabileCosi,
  type AlertFidoRow, type RichiestaClienteAlert,
} from "@/lib/alert-fidi";

export type GruppoRevisione = "in_corso" | "lasciato_cosi" | "da_incassare" | "nuovo" | "da_decidere" | "pronta" | "ok";

export const ETICHETTE_GRUPPO_REVISIONE: Record<GruppoRevisione, string> = {
  in_corso: "Già inviate",
  lasciato_cosi: "Lasciati così",
  da_incassare: "Da incassare",
  nuovo: "Nuovi fidi – decide la direzione",
  da_decidere: "Da decidere",
  pronta: "Proposte pronte",
  ok: "A posto",
};

export interface InputGruppoRevisione {
  richiestaAttiva: boolean;
  alertConfermato: boolean;
  /** Decisione "Lascia così" della revisione ancora valida (lasciatoCosiValido). */
  lasciatoCosiValido?: boolean;
  alertAperto: boolean;
  regola: string | null | undefined;
  fidoGamma: number | null | undefined;
  riferimento: number | null | undefined;
  segnalazioni: readonly string[] | null | undefined;
  extraProtettoValido: boolean;
}

/** Ultima decisione "Lascia così" del cliente (public.revisione_fidi_lasciati). */
export type LasciatoCosi = {
  cliente_id: string;
  fido_gamma: number;
  deciso_da_nome: string | null;
  deciso_il: string;
  valido_fino: string; // aaaa-mm-gg
};

/** Data di oggi aaaa-mm-gg nel fuso Europe/Rome. */
export function oggiIso(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

/**
 * "Lasciato così" vale finché: oggi ≤ valido_fino E fido in Gamma uguale a quello salvato
 * E regola ≠ 'scaduto_non_incassato'. Se una condizione cade il cliente torna nel suo gruppo.
 */
export function lasciatoCosiValido(
  l: Pick<LasciatoCosi, "fido_gamma" | "valido_fino"> | null | undefined,
  stato: { fidoGamma: number | null | undefined; regola: string | null | undefined; oggi?: string },
): boolean {
  if (!l) return false;
  const oggi = stato.oggi ?? oggiIso();
  if (oggi > l.valido_fino) return false;
  if (Number(stato.fidoGamma ?? 0) !== Number(l.fido_gamma ?? 0)) return false;
  if (stato.regola === "scaduto_non_incassato") return false;
  return true;
}

/** Ultima decisione per cliente, letta a blocchi. */
export async function fetchUltimiLasciati(ids: string[]): Promise<Map<string, LasciatoCosi>> {
  const map = new Map<string, LasciatoCosi>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 500) {
    const { data, error } = await (supabase as any)
      .from("revisione_fidi_lasciati")
      .select("cliente_id, fido_gamma, deciso_da_nome, deciso_il, valido_fino")
      .in("cliente_id", uniq.slice(i, i + 500))
      .order("deciso_il", { ascending: false })
      .limit(5000);
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!map.has(r.cliente_id)) map.set(r.cliente_id, { ...r, fido_gamma: Number(r.fido_gamma ?? 0) });
    }
  }
  return map;
}

/** "Lascia così 30 giorni" per qualunque cliente: public.lascia_cosi_revisione (conferma anche l'alert). */
export async function lasciaCosiRevisione(clienteId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("lascia_cosi_revisione", { _cliente_id: clienteId });
  if (error) throw error;
}

/** Gruppo della revisione, in ordine di priorità (regola di Andrea, FM55).
 *  "Da decidere" = anomalie da autorizzare OPPURE alert aperto quando il sistema non propone
 *  nulla di nuovo (riferimento = fido Gamma). Un alert di consumo con proposta più alta del
 *  Gamma, senza anomalie, è una proposta pronta: il sistema alza il fido e l'alert si chiude da solo. */
export function gruppoRevisione(i: InputGruppoRevisione): GruppoRevisione {
  const gamma = Number(i.fidoGamma ?? 0);
  const rif = i.riferimento == null ? null : Number(i.riferimento);
  if (i.richiestaAttiva) return "in_corso";
  if (i.alertConfermato || i.lasciatoCosiValido) return "lasciato_cosi";
  if (i.regola === "scaduto_non_incassato") return "da_incassare";
  if (gamma === 0 && rif != null && rif > 0) return "nuovo";
  // Extra protetto valido = decisione già presa: se il riferimento coincide col Gamma non c'è nulla da fare.
  if (i.extraProtettoValido && rif != null && rif === gamma) return "ok";
  const anomalia = segnalazioniAnomalia(i.segnalazioni).length > 0;
  if (anomalia || (i.alertAperto && rif === gamma)) return "da_decidere";
  if (rif != null && rif !== gamma) return "pronta";
  return "ok";
}

export type RigaRevisione = {
  cliente_id: string;
  cliente: {
    id: string; codice_gestionale: string | null; ragione_sociale: string; store_id: string | null;
    codice_agente: string | null; totale_rischio: number | null; fido_gestionale: number | null;
    stores: { nome: string } | null;
  };
  teorico: FidoTeoricoRow | null;
  fidoGamma: number;
  riferimento: number | null;
  gruppo: GruppoRevisione;
  richiesta: RichiestaClienteAlert | null;
  alertLasciabile: AlertFidoRow | null;
  alertConfermato: AlertFidoRow | null;
};

export type RiepilogoGruppo = { clienti: number; fidoGamma: number; proposto: number };

export function riepilogoRevisione(
  righe: readonly Pick<RigaRevisione, "gruppo" | "fidoGamma" | "riferimento">[],
): Record<GruppoRevisione, RiepilogoGruppo> {
  const out = Object.fromEntries(
    (Object.keys(ETICHETTE_GRUPPO_REVISIONE) as GruppoRevisione[]).map((g) => [g, { clienti: 0, fidoGamma: 0, proposto: 0 }]),
  ) as Record<GruppoRevisione, RiepilogoGruppo>;
  for (const r of righe) {
    const g = out[r.gruppo];
    g.clienti += 1;
    g.fidoGamma += Number(r.fidoGamma ?? 0);
    g.proposto += Number(r.riferimento ?? 0);
  }
  return out;
}

/** Clienti da rivedere = pronta + da_decidere + da_incassare. */
export function daRivedereRevisione(r: Record<GruppoRevisione, RiepilogoGruppo>): number {
  return r.pronta.clienti + r.da_decidere.clienti + r.da_incassare.clienti;
}

async function fetchRichiesteAttive(): Promise<Map<string, RichiestaClienteAlert>> {
  const nonTerm = STATI_RICHIESTA_NON_TERMINALI.join(",");
  const righe = await leggiTutteLeRighe<RichiestaClienteAlert>((da, a) =>
    supabase.from("richieste_fido")
      .select("id, cliente_id, stato, stato_export, tipo, importo_richiesto, created_at, data_processata")
      .or(`stato.in.(${nonTerm}),and(stato.eq.approvata,stato_export.is.null),and(stato.eq.approvata,stato_export.neq.processata)`)
      .order("created_at", { ascending: false }).order("id")
      .range(da, a) as any,
  );
  const map = new Map<string, RichiestaClienteAlert>();
  for (const r of righe) if (r.cliente_id && isRichiestaAttiva(r) && !map.has(r.cliente_id)) map.set(r.cliente_id, r);
  return map;
}

/** Clienti attivi visibili (RLS) con fido in Gamma > 0 o fido proposto > 0, con il loro gruppo. */
export async function fetchRevisioneFidi(userId: string): Promise<RigaRevisione[]> {
  const clienti = await leggiTutteLeRighe<RigaRevisione["cliente"]>((da, a) =>
    supabase.from("clienti")
      .select(`id, codice_gestionale, ragione_sociale, store_id, codice_agente, totale_rischio, ${FIDO_CLIENTE_SELECT}, stores(nome)`)
      .eq("attivo", true).order("id").range(da, a) as any,
  );
  const teorico = await fetchFidoTeorico(clienti.map((c) => c.id));
  const perimetro = clienti.filter((c) => Number(c.fido_gestionale ?? 0) > 0 || Number(teorico.get(c.id)?.fido_proposto ?? 0) > 0);
  const ids = perimetro.map((c) => c.id);
  const [riferimenti, protetti, alert, richieste] = await Promise.all([
    fetchFidoTeoricoPerRichiesta(ids, userId),
    fetchExtraFidoProtetti(ids),
    fetchAlertFidiAperti(),
    fetchRichiesteAttive(),
  ]);
  const alertPerCliente = new Map<string, AlertFidoRow[]>();
  for (const a of alert) alertPerCliente.set(a.cliente_id, [...(alertPerCliente.get(a.cliente_id) ?? []), a]);

  return perimetro.map((c) => {
    const t = teorico.get(c.id) ?? null;
    const al = alertPerCliente.get(c.id) ?? [];
    const confermato = al.find((a) => statoEffettivoAlert(a) === "confermato") ?? null;
    const lasciabile = al.find(alertLasciabileCosi) ?? null;
    const richiesta = richieste.get(c.id) ?? al.find((a) => a.richiesta_attiva)?.richiesta_attiva ?? null;
    const fidoGamma = Number(c.fido_gestionale ?? 0);
    const riferimento = riferimenti.get(c.id) ?? null;
    const gruppo = gruppoRevisione({
      richiestaAttiva: !!richiesta,
      alertConfermato: !!confermato,
      alertAperto: al.some((a) => statoEffettivoAlert(a) === "aperto"),
      regola: t?.regola_applicata,
      fidoGamma, riferimento,
      segnalazioni: t?.segnalazioni,
      extraProtettoValido: protezioneAttiva(protetti.get(c.id)),
    });
    return { cliente_id: c.id, cliente: c, teorico: t, fidoGamma, riferimento, gruppo, richiesta,
      alertLasciabile: lasciabile, alertConfermato: confermato };
  });
}
