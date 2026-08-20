// Costanti e helper condivisi del modulo cantieri (CRM commerciale).
export type GeoStato = "da_geocodificare" | "ok" | "fallita" | "manuale";

export const GEO_STATI: GeoStato[] = ["da_geocodificare", "ok", "fallita", "manuale"];

export const GEO_LABEL: Record<GeoStato, string> = {
  da_geocodificare: "Da posizionare",
  ok: "Posizionato",
  fallita: "Geocodifica fallita",
  manuale: "Coordinate manuali",
};

export const GEO_CLASS: Record<GeoStato, string> = {
  da_geocodificare: "bg-muted text-muted-foreground border-border",
  ok: "bg-emerald-600/15 text-emerald-700 border-emerald-600/30",
  fallita: "bg-destructive/15 text-destructive border-destructive/30",
  manuale: "bg-primary/15 text-primary border-primary/30",
};

export const CATEGORIE_CANTIERE = [
  "residenziale",
  "commerciale",
  "industriale",
  "infrastruttura",
  "ristrutturazione",
  "altro",
] as const;
export type CategoriaCantiere = (typeof CATEGORIE_CANTIERE)[number];

export const CATEGORIA_LABEL: Record<string, string> = {
  residenziale: "Residenziale",
  commerciale: "Commerciale",
  industriale: "Industriale",
  infrastruttura: "Infrastruttura",
  ristrutturazione: "Ristrutturazione",
  altro: "Altro",
};

// Colore pin per categoria (usato anche nella legenda della mappa)
export const CATEGORIA_COLORE: Record<string, string> = {
  residenziale: "#3b82f6",
  commerciale: "#0d9488",
  industriale: "#f59e0b",
  infrastruttura: "#8b5cf6",
  ristrutturazione: "#16a34a",
  altro: "#6b7280",
  "": "#6b7280",
};

// Colore del segnaposto dei punti vendita MADE (blu istituzionale)
export const SEDE_COLORE = "#0f4c81";

/** Punto vendita mostrato sulla mappa cantieri. */
export type SedeMappa = {
  id: string;
  nome: string;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  telefono: string | null;
  lat: number | null;
  lng: number | null;
};

export type CantiereRow = {
  id: string;
  nome: string;
  descrizione: string | null;
  cliente_id: string | null;
  lead_id: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  referente: string | null;
  data_inizio: string | null;
  data_fine_prevista: string | null;
  attivo: boolean | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  geocodifica_stato: GeoStato | null;
  geocodifica_messaggio: string | null;
  geocodificato_il: string | null;
  agente_codice: string | null;
  categoria: string | null;
  sede_piu_vicina_id: string | null;
  sede_piu_vicina_km: number | null;
  sede_piu_vicina_min: number | null;
  sede_piu_vicina_calcolata_il: string | null;
  clienti?: { ragione_sociale: string | null; codice_agente: string | null } | null;
  lead?: { ragione_sociale: string | null; nome: string | null; cognome: string | null } | null;
  sede?: { nome: string | null } | null;
};

/** "SEDE DI LISSONE · 12,4 km · 18 min" oppure null se non calcolata. */
export function testoSedeVicina(c: {
  sede?: { nome: string | null } | null;
  sede_piu_vicina_km?: number | null;
  sede_piu_vicina_min?: number | null;
}): string | null {
  if (!c.sede?.nome) return null;
  const parti = [c.sede.nome];
  if (c.sede_piu_vicina_km != null) {
    parti.push(`${c.sede_piu_vicina_km.toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`);
  }
  if (c.sede_piu_vicina_min != null) parti.push(`${Math.round(c.sede_piu_vicina_min)} min`);
  return parti.join(" · ");
}

export function nomeSoggettoCantiere(c: CantiereRow): string {
  if (c.clienti?.ragione_sociale) return c.clienti.ragione_sociale;
  if (c.lead) {
    const n = c.lead.ragione_sociale?.trim() || `${c.lead.nome ?? ""} ${c.lead.cognome ?? ""}`.trim();
    if (n) return n;
  }
  return "—";
}

export function indirizzoCompleto(c: {
  indirizzo?: string | null;
  cap?: string | null;
  citta?: string | null;
  provincia?: string | null;
}): string {
  const riga1 = c.indirizzo?.trim() ?? "";
  const riga2 = [c.cap?.trim(), c.citta?.trim()].filter(Boolean).join(" ");
  const prov = c.provincia?.trim() ? `(${c.provincia.trim()})` : "";
  return [riga1, [riga2, prov].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
