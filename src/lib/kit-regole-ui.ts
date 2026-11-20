import type { Database } from '@/integrations/supabase/types';
import { normalizzaOperandoKit, calcolaKitRegole, type CampiRegolaKit, type ComponenteRegoleKit, type ParametroRegoleKit } from './kit-regole';
import { parseNumeroIt } from './numero-it';

export const CAMPI_REGOLA_KIT = [
  { codice: 'regola_base', etichetta: 'Base' },
  { codice: 'regola_moltiplica', etichetta: 'Moltiplica' },
  { codice: 'regola_dividi_1', etichetta: 'Dividi 1' },
  { codice: 'regola_dividi_2', etichetta: 'Dividi 2' },
  { codice: 'regola_confezione', etichetta: 'Confezione' },
  { codice: 'regola_aggiunta', etichetta: 'Aggiungi' },
] as const;
export type CampoRegolaKit = typeof CAMPI_REGOLA_KIT[number]['codice'];
export type KitParametro = Database['public']['Tables']['kit_parametri']['Row'];
export type SalvataggioParametroKit = Pick<KitParametro, 'codice' | 'etichetta' | 'tipo' | 'valori_ammessi' | 'valore_default' | 'um' | 'note' | 'ordine'>;
type EtichettaParametro = ParametroRegoleKit & { etichetta: string; um?: string | null };
export type RigaMenuKit = { ordine: number; descrizione: string };

export function normalizzaPatchRegoleKit<T extends Partial<CampiRegolaKit>>(patch: T): T {
  const risultato = { ...patch };
  for (const campo of CAMPI_REGOLA_KIT) {
    if (Object.hasOwn(patch, campo.codice)) Object.assign(risultato, { [campo.codice]: normalizzaOperandoKit(patch[campo.codice]) });
  }
  return risultato;
}
export function sceltaOperandoKit(tipo: 'parametro' | 'riga', valore: string | number): string {
  const testo = `${tipo === 'parametro' ? 'PARAM' : 'RIGA'}:${valore}`;
  const normalizzato = normalizzaOperandoKit(testo);
  if (!normalizzato) throw new Error('Scelta non valida.');
  return normalizzato;
}
export function descrizioneOperandoKit(valore: string | null | undefined, parametri: readonly EtichettaParametro[]): string {
  const testo = valore?.trim() ?? '';
  if (testo.startsWith('PARAM:')) {
    const codice = testo.slice(6);
    const p = parametri.find(p => p.codice === codice);
    return p ? `${p.etichetta}${p.um ? ` (${p.um})` : ''}` : `Parametro ${codice}`;
  }
  if (testo.startsWith('RIGA:')) return `Quantità riga ${testo.slice(5)}`;
  return testo.replace('.', ',');
}
export function fraseRegolaKit(regola: Partial<CampiRegolaKit>, parametri: readonly EtichettaParametro[]): string {
  if (!regola.regola_base?.trim()) return 'Vale l’incidenza; se vuota, vale il driver.';
  let frase = descrizioneOperandoKit(regola.regola_base, parametri);
  for (const campo of CAMPI_REGOLA_KIT.slice(1)) {
    const valore = regola[campo.codice]?.trim();
    if (!valore) continue;
    const numero = parseNumeroIt(valore);
    if ((campo.codice === 'regola_aggiunta' && numero === 0) || (campo.codice !== 'regola_aggiunta' && numero === 1)) continue;
    const simbolo = campo.codice === 'regola_moltiplica' ? '×' : campo.codice === 'regola_aggiunta' ? '+' : '÷';
    frase += ` ${simbolo} ${descrizioneOperandoKit(valore, parametri)}`;
  }
  return frase;
}
export function righeUsanoParametroKit(codice: string, righe: readonly (ComponenteRegoleKit & { descrizione?: string | null; articolo?: { descrizione: string | null } | null })[]): RigaMenuKit[] {
  return righe.filter(r => CAMPI_REGOLA_KIT.some(c => r[c.codice]?.trim() === `PARAM:${codice}`))
    .map(r => ({ ordine: r.ordine, descrizione: r.articolo?.descrizione ?? r.descrizione ?? r.articolo_codice ?? r.codice_articolo_fornitore ?? 'Articolo da definire' }));
}
export function validaParametroKit(p: SalvataggioParametroKit): SalvataggioParametroKit {
  const codice = p.codice.trim().toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(codice)) throw new Error('Il codice ammette solo lettere maiuscole, numeri e _.');
  if (!p.etichetta.trim()) throw new Error('L’etichetta è obbligatoria.');
  if (!Number.isFinite(p.valore_default)) throw new Error('Indica un valore predefinito valido.');
  if (p.tipo !== 'numero' && p.tipo !== 'scelta') throw new Error('Scegli Numero oppure Scelta.');
  if (p.tipo === 'scelta' && (!p.valori_ammessi?.length || p.valori_ammessi.some(v => !Number.isFinite(v)) || !p.valori_ammessi.includes(p.valore_default))) {
    throw new Error('Il valore predefinito deve essere uno dei valori ammessi.');
  }
  return { ...p, codice, etichetta: p.etichetta.trim(), valori_ammessi: p.tipo === 'scelta' ? p.valori_ammessi : null };
}
/** Adattatore di sola anteprima: tutta la quantità viene dal motore canonico. */
export function anteprimaQuantitaKit(componenti: readonly ComponenteRegoleKit[], parametri: readonly ParametroRegoleKit[], valori: Readonly<Record<string, string>>) {
  const valoriParametri = Object.fromEntries(Object.entries(valori).map(([k, v]) => [k, parseNumeroIt(v) ?? NaN]));
  return calcolaKitRegole({ componenti, parametri, valoriParametri });
}