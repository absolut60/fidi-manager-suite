// FM99 fetta 3: logica di presentazione della pagina Riconciliazione lead → clienti.
// Il motore e i permessi stanno nel database (docs/regole/lead-riconciliazione.md):
// qui solo letture sotto RLS, etichette e validazioni pure.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatData, type LeadRiconciliazioneEsito } from "@/lib/lead-costanti";

export type VistaRiconciliazione = "da-riconciliare" | "riconciliati";

export function validaVistaRiconciliazione(v: unknown): VistaRiconciliazione {
  return v === "riconciliati" ? "riconciliati" : "da-riconciliare";
}

/** Esiti mostrati nella scheda "Riconciliati". */
export const ESITI_RICONCILIATI: LeadRiconciliazioneEsito[] = ["collegato_auto", "collegato_manuale", "annullato"];

/** Solo i collegamenti ancora in essere si possono annullare. */
export function rigaAnnullabile(esito: string): boolean {
  return esito === "collegato_auto" || esito === "collegato_manuale";
}

export type CandidatoRiconciliazione = {
  id: string;
  ragione_sociale: string | null;
  codice_gestionale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
};

export type RigaRiconciliazione = {
  id: string;
  lead_id: string;
  esito: LeadRiconciliazioneEsito;
  cliente_id: string | null;
  chiave: string | null;
  candidati: unknown;
  nome_lead: string | null;
  lead_partita_iva: string | null;
  lead_codice_fiscale: string | null;
  cliente_ragione_sociale: string | null;
  cliente_codice: string | null;
  importazione_id: string | null;
  operatore_id: string | null;
  creato_il: string;
  risolto_da: string | null;
  risolto_il: string | null;
  nota: string | null;
};

export function candidatiRiga(candidati: unknown): CandidatoRiconciliazione[] {
  if (!Array.isArray(candidati)) return [];
  return candidati
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string")
    .map((c) => ({
      id: c["id"] as string,
      ragione_sociale: typeof c["ragione_sociale"] === "string" ? c["ragione_sociale"] : null,
      codice_gestionale: typeof c["codice_gestionale"] === "string" ? c["codice_gestionale"] : null,
      partita_iva: typeof c["partita_iva"] === "string" ? c["partita_iva"] : null,
      codice_fiscale: typeof c["codice_fiscale"] === "string" ? c["codice_fiscale"] : null,
    }));
}

/** "Import clienti del gg/mm/aaaa" se la riga nasce da un import, altrimenti "Controlla ora". */
export function origineRiconciliazione(r: Pick<RigaRiconciliazione, "importazione_id" | "creato_il">): string {
  return r.importazione_id ? `Import clienti del ${formatData(r.creato_il)}` : "Controlla ora";
}

/** Chiave che ha trovato la corrispondenza, con il valore del lead. */
export function corrispondenzaRiconciliazione(
  r: Pick<RigaRiconciliazione, "chiave" | "lead_partita_iva" | "lead_codice_fiscale">,
): string {
  if (r.chiave === "partita_iva") return `P.IVA ${r.lead_partita_iva ?? "—"}`;
  if (r.chiave === "codice_fiscale") return `C.F. ${r.lead_codice_fiscale ?? "—"}`;
  return "—";
}

/** Data dell'ultima variazione della riga (risoluzione o creazione). */
export function dataRiga(r: Pick<RigaRiconciliazione, "risolto_il" | "creato_il">): string {
  return r.risolto_il ?? r.creato_il;
}

export type EsitoControllo = { collegati: number; daRiconciliare: number; testo: string; errori: string[] };

const plurale = (n: number, uno: string, molti: string) => `${n.toLocaleString("it-IT")} ${n === 1 ? uno : molti}`;

/** Testo in parole dell'esito di "Controlla ora". */
export function esitoControlloOra(res: unknown): EsitoControllo {
  const r = (res && typeof res === "object" ? res : {}) as Record<string, unknown>;
  const collegati = typeof r["collegati"] === "number" ? r["collegati"] : 0;
  const daRiconciliare = typeof r["da_riconciliare"] === "number" ? r["da_riconciliare"] : 0;
  const errori = (Array.isArray(r["errori"]) ? r["errori"] : []).map((e) => {
    const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const msg = typeof o["errore"] === "string" ? o["errore"] : typeof o["notifiche"] === "string" ? `notifiche: ${o["notifiche"]}` : JSON.stringify(e);
    return o["lead_id"] ? `Lead ${String(o["lead_id"])}: ${msg}` : msg;
  });
  return {
    collegati,
    daRiconciliare,
    testo: `${plurale(collegati, "lead collegato", "lead collegati")}, ${daRiconciliare.toLocaleString("it-IT")} da riconciliare`,
    errori,
  };
}

/** Prefisso comune: invalidarlo aggiorna pagina e conteggi. */
export const CHIAVE_RICONCILIAZIONE = ["lead-riconciliazione"] as const;

export const conteggioDaRiconciliareQuery = (abilitata: boolean) =>
  queryOptions({
    queryKey: [...CHIAVE_RICONCILIAZIONE, "conteggio-da-riconciliare"],
    enabled: abilitata,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lead_riconciliazioni")
        .select("id", { count: "exact", head: true })
        .eq("esito", "da_riconciliare");
      if (error) throw error;
      return count ?? 0;
    },
  });
