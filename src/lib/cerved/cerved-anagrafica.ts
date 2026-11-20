export type AnagraficaCerved = {
  denominazione: string | null; partita_iva: string | null; codice_fiscale: string | null;
  indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null;
  forma_giuridica: string | null; ateco_2025_codice: string | null; ateco_2025_descrizione: string | null;
  stato_attivita_descrizione: string | null; operativa: boolean | null;
};
export type CampiAnagraficiLead = {
  ragione_sociale: string; partita_iva: string; codice_fiscale: string; indirizzo: string;
  citta: string; cap: string; provincia: string; tipo_soggetto: string;
};
export type RisultatoAnagraficaCerved = {
  trovata: boolean; anagrafica: AnagraficaCerved | null;
  duplicati: { clienti: { id: string; ragione_sociale: string | null }[]; lead: { id: string; nome: string }[] };
};
export const CAMPI_ANAGRAFICI_LABEL: Record<keyof CampiAnagraficiLead, string> = {
  ragione_sociale: "Ragione sociale", partita_iva: "Partita IVA", codice_fiscale: "Codice fiscale",
  indirizzo: "Indirizzo", citta: "Città", cap: "CAP", provincia: "Provincia", tipo_soggetto: "Tipo soggetto",
};
export function anagraficaCampiLead(a: AnagraficaCerved): CampiAnagraficiLead {
  return { ragione_sociale: a.denominazione ?? "", partita_iva: a.partita_iva ?? "",
    codice_fiscale: a.codice_fiscale ?? "", indirizzo: a.indirizzo ?? "", citta: a.comune ?? "",
    cap: a.cap ?? "", provincia: a.provincia ?? "", tipo_soggetto: "azienda" };
}
export function differenzeAnagrafica(attuale: CampiAnagraficiLead, nuovi: CampiAnagraficiLead) {
  return (Object.keys(CAMPI_ANAGRAFICI_LABEL) as (keyof CampiAnagraficiLead)[])
    // Dati assenti nella ricerca non cancellano dati già inseriti.
    .filter(campo => nuovi[campo].trim() !== "" && attuale[campo].trim() !== nuovi[campo].trim())
    .map(campo => ({ campo, attuale: attuale[campo], cerved: nuovi[campo] }));
}
export function compilaVuotiAnagrafica(attuale: CampiAnagraficiLead, nuovi: CampiAnagraficiLead): Partial<CampiAnagraficiLead> {
  return Object.fromEntries(differenzeAnagrafica(attuale, nuovi).filter(d => !d.attuale.trim()).map(d => [d.campo, d.cerved]));
}
export function attivitaCervedNonAttiva(a: AnagraficaCerved): boolean {
  return a.operativa === false || (!!a.stato_attivita_descrizione && a.stato_attivita_descrizione.trim().toLowerCase() !== "attiva");
}
/** Inizio anno civile italiano: 1 gennaio è sempre UTC+1. */
export function inizioAnnoRicercheCerved(ora = new Date()): string {
  const anno = new Intl.DateTimeFormat("it-IT", { year: "numeric", timeZone: "Europe/Rome" }).format(ora);
  return `${anno}-01-01T00:00:00+01:00`;
}