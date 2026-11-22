import type { Database } from '@/integrations/supabase/types';
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
    codice_famiglia: p.codice_famiglia ?? null, codice_sottofamiglia: p.codice_sottofamiglia ?? null,
    um2: p.um2 ?? null, fattore_conversione: p.fattore_conversione ?? null,
  };
}

export const ERRORE_CODICE_KIT = 'Codice kit già utilizzato: scegli un codice diverso.';

export function valoriSpecificheKit(specifiche: Database['public']['Tables']['kit']['Row']['specifiche'], linea: LineaPreventivo = 'sistema_made'): Record<string,string> {
  if (!specifiche || typeof specifiche !== 'object' || Array.isArray(specifiche)) return {};
  return Object.fromEntries(lineaPreventivo(linea).kit.specifiche.flatMap(campo => {
    const valore = specifiche[campo.codice];
    return typeof valore === 'string' || typeof valore === 'number' ? [[campo.codice, typeof valore === 'number' ? String(valore).replace('.', ',') : valore]] : [];
  }));
}
export function specificheKitDaValori(linea: LineaPreventivo, valori: Record<string,string>) {
  const out: Record<string,Database['public']['Tables']['kit']['Row']['specifiche'] | undefined> = {};
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