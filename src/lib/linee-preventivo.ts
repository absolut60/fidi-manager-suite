import type { Database } from '@/integrations/supabase/types';

export type LineaPreventivo = Database['public']['Enums']['linea_preventivo'];
export interface ConfigurazioneLineaPreventivo {
  codice: LineaPreventivo;
  etichetta: string;
  attiva: boolean;
  classiBadge: string;
  classiBordo: string;
  /** FM75 F1: comportamenti dei blocchi nel corpo del preventivo. */
  blocchi: ComportamentiBlocchiLinea;
  /** F6: parametri di stampa dei PDF (pdf-export.ts legge solo da qui). */
  stampa: StampaLinea;
}

export interface BandaStampa { titolo: string[]; sottotitolo: string[] }
export interface StampaLinea {
  /** Riga sotto il titolo in testata; null = solo logo. */
  payoff: string | null;
  /** Banda colorata sopra il piede dell'ultima pagina; null = nessuna banda. */
  banda: BandaStampa | null;
  /** true: testata di blocco con rif., quantità base e prezzo per U.M.; false: solo titolo (e subtotali). */
  testataBlocchi: boolean;
}

const STAMPA_SISTEMA: StampaLinea = {
  payoff: 'Distribuzione sistemi a secco  |  cartongesso, profili, isolanti, controsoffitti',
  banda: { titolo: ['IL NUOVO MODO', 'DI COSTRUIRE.'], sottotitolo: ['Tecnologie leggere, risultati solidi', 'il sistema a secco che guarda al futuro.'] },
  testataBlocchi: true,
};
const STAMPA_SHOWROOM: StampaLinea = { payoff: null, banda: null, testataBlocchi: false };

export interface ComportamentiBlocchiLinea {
  /** true: testata completa (rif., quantità base, U.M., prezzo/U.M., incidenze); false: blocco spoglio (descrizione e subtotale). */
  bloccoConMisure: boolean;
  /** true: «Aggiungi blocco» con Kit + Vuoto; false: solo blocco vuoto. */
  bloccoDaKit: boolean;
  /** FM75 F2c: flag Stampabile per riga e anteprima della vista commerciale. */
  righeStampabili: boolean;
  /** FM75 F3c: regime IVA in testata, flag BS per riga e riepilogo IVA (calcolo-iva.ts). */
  regimiIva: boolean;
  /** FM75 F4b: finestra "articolo in definizione" sulla riga manuale e codice fornitore al posto di "MANUALE". */
  articoloInDefinizione: boolean;
  /** true: importo nel riquadro scuro della testata del blocco; false: importo evidenziato solo nel piede del blocco. */
  importoInTestataBlocco: boolean;
  /** true: colonne Gamma della riga (Magg.%, Extra %, ±, Peso); false: al loro posto la colonna Ricarico % (leva FM75). */
  colonneGammaRiga: boolean;
}

const BLOCCHI_COMPLETI: ComportamentiBlocchiLinea = { bloccoConMisure: true, bloccoDaKit: true, righeStampabili: false, regimiIva: false, articoloInDefinizione: false, importoInTestataBlocco: true, colonneGammaRiga: true };

/** Tutti i comportamenti per linea passano da questo catalogo, non da confronti nei chiamanti. */
export const LINEE_PREVENTIVO: Record<LineaPreventivo, ConfigurazioneLineaPreventivo> = {
  sistema_made: { codice: 'sistema_made', etichetta: 'Sistema MADE', attiva: true, classiBadge: 'border-pv-azzurro-bordo bg-pv-azzurro text-pv-blu', classiBordo: 'border-l-pv-blu', blocchi: BLOCCHI_COMPLETI, stampa: STAMPA_SISTEMA },
  showroom: { codice: 'showroom', etichetta: 'Showroom', attiva: true, classiBadge: 'border-pv-viola/30 bg-pv-viola-tenue text-pv-viola', classiBordo: 'border-l-pv-viola', blocchi: { bloccoConMisure: false, bloccoDaKit: false, righeStampabili: true, regimiIva: true, articoloInDefinizione: true, importoInTestataBlocco: false, colonneGammaRiga: false }, stampa: STAMPA_SHOWROOM },
  edilizia: { codice: 'edilizia', etichetta: 'Edilizia', attiva: false, classiBadge: 'border-pv-verde/30 bg-pv-verde-tenue text-pv-verde', classiBordo: 'border-l-pv-verde', blocchi: BLOCCHI_COMPLETI, stampa: STAMPA_SISTEMA },
  fotovoltaico: { codice: 'fotovoltaico', etichetta: 'Fotovoltaico', attiva: false, classiBadge: 'border-pv-giallo/30 bg-pv-giallo-tenue text-pv-giallo', classiBordo: 'border-l-pv-giallo', blocchi: BLOCCHI_COMPLETI, stampa: STAMPA_SISTEMA },
};

export function lineaPreventivo(codice: unknown): ConfigurazioneLineaPreventivo {
  return typeof codice === 'string' && Object.hasOwn(LINEE_PREVENTIVO, codice)
    ? LINEE_PREVENTIVO[codice as LineaPreventivo]
    : LINEE_PREVENTIVO.sistema_made;
}

export function lineeAttive(): ConfigurazioneLineaPreventivo[] {
  return Object.values(LINEE_PREVENTIVO).filter(linea => linea.attiva);
}

export const mostraFiltroLinee = lineeAttive().length > 1;
/** Linee che l'utente può usare: abilitate sul profilo ∩ attive, nell'ordine del catalogo. */
export function lineeUtente(abilitate: readonly LineaPreventivo[] | null | undefined): ConfigurazioneLineaPreventivo[] {
  const set = new Set(abilitate ?? []);
  return lineeAttive().filter(linea => set.has(linea.codice));
}

/** Predefinita del profilo se utilizzabile, altrimenti la prima utilizzabile; null se nessuna. */
export function lineaPredefinitaEffettiva(
  abilitate: readonly LineaPreventivo[] | null | undefined,
  predefinita: LineaPreventivo | null | undefined,
): LineaPreventivo | null {
  const usabili = lineeUtente(abilitate);
  return usabili.find(linea => linea.codice === predefinita)?.codice ?? usabili[0]?.codice ?? null;
}

/** Gestione utenti: riallinea la predefinita alle linee abilitate scelte (anche non ancora attive). */
export function riallineaPredefinitaProfilo(
  abilitate: readonly LineaPreventivo[],
  predefinita: LineaPreventivo | null,
): LineaPreventivo | null {
  const ordinate = tutteLeLinee().map(l => l.codice).filter(c => abilitate.includes(c));
  return predefinita && ordinate.includes(predefinita) ? predefinita : ordinate[0] ?? null;
}

export function tutteLeLinee(): ConfigurazioneLineaPreventivo[] {
  return Object.values(LINEE_PREVENTIVO);
}

/** Etichetta per la gestione utenti: segnala le linee non ancora attive. */
export function etichettaLineaGestione(linea: ConfigurazioneLineaPreventivo): string {
  return linea.attiva ? linea.etichetta : `${linea.etichetta} — non ancora attiva`;
}

/** Stato del selettore linea in creazione preventivo. */
export function selettoreLineaCreazione(
  abilitate: readonly LineaPreventivo[] | null | undefined,
  predefinita: LineaPreventivo | null | undefined,
): { linee: ConfigurazioneLineaPreventivo[]; mostra: boolean; iniziale: LineaPreventivo | null; bloccaCreazione: boolean } {
  const linee = lineeUtente(abilitate);
  return { linee, mostra: linee.length > 1, iniziale: lineaPredefinitaEffettiva(abilitate, predefinita), bloccaCreazione: linee.length === 0 };
}
