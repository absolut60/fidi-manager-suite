import { supabase } from '@/integrations/supabase/client';
import type { LineaPreventivo } from './linee-preventivo';

export const chiaveCondizioniVendita = (linea: LineaPreventivo) => `condizioni_vendita_${linea}`;
export const descrizioneCondizioniVendita = (etichetta: string) =>
  `Condizioni generali di vendita stampate in coda al preventivo e all'ordine della linea ${etichetta} (FM98). {{validita}} = data di validità del preventivo.`;

/** Una lettura per generazione; la configurazione vuota non aggiunge pagine. */
export async function leggiCondizioniVendita(linea: LineaPreventivo, client = supabase): Promise<string> {
  const { data, error } = await client.from('configurazioni').select('valore')
    .eq('chiave', chiaveCondizioniVendita(linea)).maybeSingle();
  if (error) throw error;
  return data?.valore ?? '';
}

export async function salvaCondizioniVendita(linea: LineaPreventivo, etichetta: string, testo: string, userId: string, client = supabase) {
  const { data, error } = await client.from('configurazioni').upsert({
    chiave: chiaveCondizioniVendita(linea), valore: testo,
    descrizione: descrizioneCondizioniVendita(etichetta),
    updated_by: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'chiave' }).select('chiave').single();
  if (error) throw error;
  if (!data) throw new Error('Condizioni non salvate');
}

export function rendiCondizioniVendita(testo: string, prev: { validita?: string | null }): string {
  const iso = prev.validita?.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const data = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : 'indicata nel preventivo';
  return testo.replaceAll('{{validita}}', data);
}

/** Impaginazione: riga non vuota senza minuscole, max 60 caratteri = titolo
 * in grassetto; riga vuota = separazione paragrafi; ogni altra riga = testo normale.
 * Le lettere Unicode includono le minuscole accentate italiane.
 */
export function titoloCondizioniVendita(riga: string): boolean {
  const testo = riga.trim();
  return testo.length > 0 && testo.length <= 60 && !/\p{Ll}/u.test(testo);
}