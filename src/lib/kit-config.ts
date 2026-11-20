import { Constants, type Database } from '@/integrations/supabase/types';
import { lineaPreventivo, tutteLeLinee, type LineaPreventivo } from './linee-preventivo';
import type { KitComponenteUpdate } from './kit-api';
import { parseNumeroIt } from './numero-it';

export function lineeKitAbilitate(abilitate: readonly LineaPreventivo[] | null | undefined) {
  return tutteLeLinee().filter(l => abilitate?.includes(l.codice));
}

export function proponiCodiceKit(linea: LineaPreventivo, codici: readonly string[]): string {
  const prefisso = `${lineaPreventivo(linea).kit.prefissoCodice}-`;
  const progressivi = codici.filter(c => c.startsWith(prefisso)).map(c => c.slice(prefisso.length))
    .filter(c => /^\d+$/.test(c)).map(Number).filter(Number.isSafeInteger);
  return `${prefisso}${Math.max(0, ...progressivi) + 1}`;
}

export function etichettaIncidenzaKit(linea: LineaPreventivo, um: string) {
  return lineaPreventivo(linea).kit.etichettaQuantita.replace('{um}', um);
}

/** Solo ponte di inserimento per il vecchio NOT NULL, non una tassonomia per le schermate. */
export function famigliaKitLegacy(codice: string): Database['public']['Enums']['kit_famiglia'] {
  return Constants.public.Enums.kit_famiglia.find(f => f === codice) ?? 'ALTRO';
}

type Gamma = { codice: string; descrizione: string | null; um: string | null };
export function patchArticoloKit(codice: string, gamma: Gamma | null): KitComponenteUpdate {
  return gamma ? {
    articolo_codice: gamma.codice, codice_articolo_fornitore: null,
    descrizione: null, um: null, fornitore_id: null, marca: null, costo: null, listino_fornitore: null,
  } : {
    articolo_codice: null, codice_articolo_fornitore: codice.trim() || null,
  };
}

export function patchManualeKit(p: Database['public']['Tables']['righe_preventivo']['Update']): KitComponenteUpdate {
  return {
    articolo_codice: null, codice_articolo_fornitore: p.codice_articolo_fornitore ?? null,
    descrizione: p.descrizione ?? null, um: p.um ?? null, fornitore_id: p.fornitore_id ?? null,
    marca: p.marca ?? null, costo: p.costo ?? null, listino_fornitore: p.listino_fornitore ?? null,
  };
}

export const ERRORE_CODICE_KIT = 'Codice kit già utilizzato: scegli un codice diverso.';

export function valoriSpecificheKit(specifiche: Database['public']['Tables']['kit']['Row']['specifiche']): Record<string,string> {
  if (!specifiche || typeof specifiche !== 'object' || Array.isArray(specifiche)) return {};
  return Object.fromEntries(Object.entries(specifiche).filter(([,v]) => typeof v==='string' || typeof v==='number')
    .map(([k,v]) => [k,typeof v==='number'?String(v).replace('.',','):String(v)]));
}
export function specificheKitDaValori(linea: LineaPreventivo, valori: Record<string,string>) {
  const out: Record<string,string|number> = {};
  for (const campo of lineaPreventivo(linea).kit.specifiche) {
    const testo = valori[campo.codice]?.trim() ?? '';
    if (!testo) continue;
    if (campo.tipo==='testo') out[campo.codice]=testo;
    else {
      const numero = parseNumeroIt(testo);
      if (numero===null) throw new Error(`${campo.etichetta}: indica un numero valido`);
      out[campo.codice]=numero;
    }
  }
  return out;
}