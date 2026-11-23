import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { LineaPreventivo } from './linee-preventivo';
import { eliminaConEsito } from './esito-eliminazione';

export type NotaLibreria = Database['public']['Tables']['note_preventivo_libreria']['Row'];
/** Gemella di auth_legge_note_preventivo/auth_scrive_note_preventivo (FM98).
 * I controlli TS presentano i comandi; le policy SQL autorizzano ogni operazione.
 * Store manager legge tutte le linee; showroom semplice non inserisce.
 */
export const PERMESSI_NOTE_PREVENTIVO = {
  letturaGlobale: ['amministratore', 'store_manager'],
  letturaLinea: ['preventivi_manage', 'preventivi_write', 'preventivi_read', 'showroom', 'responsabile_showroom'],
  inserimentoLinea: ['preventivi_manage', 'preventivi_write', 'responsabile_showroom'],
  gestioneLinea: ['preventivi_manage', 'responsabile_showroom'],
} as const;
export interface UtenteNote { id: string | null; roles: readonly string[]; linee: readonly LineaPreventivo[] }
const ruolo = (u: UtenteNote, rs: readonly string[]) => u.roles.some(r => rs.includes(r));
export function puoLeggereLibreria(u: UtenteNote, linea: LineaPreventivo): boolean {
  return !!u.id && (ruolo(u, PERMESSI_NOTE_PREVENTIVO.letturaGlobale) || (u.linee.includes(linea) && ruolo(u, PERMESSI_NOTE_PREVENTIVO.letturaLinea)));
}
export function puoInserireLibreria(u: UtenteNote, linea: LineaPreventivo): boolean {
  return !!u.id && (u.roles.includes('amministratore') || (u.linee.includes(linea) && ruolo(u, PERMESSI_NOTE_PREVENTIVO.inserimentoLinea)));
}
export function puoGestireNotaLibreria(u: UtenteNote, nota: Pick<NotaLibreria, 'linea' | 'creato_da'>): boolean {
  return !!u.id && (u.roles.includes('amministratore') || (u.linee.includes(nota.linea) && (nota.creato_da === u.id || ruolo(u, PERMESSI_NOTE_PREVENTIVO.gestioneLinea))));
}
export function aggiungiNotaCliente(attuale: string | null | undefined, testo: string): string {
  return attuale?.trim() ? `${attuale.replace(/\s+$/, '')}\n\n${testo}` : testo;
}
export function campiNotaLibreria(titolo: string, testo: string) {
  const pulito = titolo.trim();
  if (!pulito) throw new Error('Inserisci il titolo della nota');
  if (pulito.length > 120) throw new Error('Il titolo può avere al massimo 120 caratteri');
  if (!testo.trim()) throw new Error('Inserisci il testo della nota');
  return { titolo: pulito, testo };
}
export const chiaveLibreriaNote = (linea: LineaPreventivo, utenteId: string | null) => ['note-preventivo-libreria', linea, utenteId] as const;
export async function leggiLibreriaNote(linea: LineaPreventivo, client: SupabaseClient<Database> = supabase): Promise<NotaLibreria[]> {
  const note: NotaLibreria[] = [];
  for (let da = 0; ; da += 500) {
    const { data, error } = await client.from('note_preventivo_libreria').select('*').eq('linea', linea).order('titolo').order('id').range(da, da + 499);
    if (error) throw error;
    note.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return note;
  }
}
export async function salvaNotaLibreria(linea: LineaPreventivo, nota: { id?: string; titolo: string; testo: string }, utenteId: string, client: SupabaseClient<Database> = supabase): Promise<NotaLibreria> {
  const campi = { ...campiNotaLibreria(nota.titolo, nota.testo), aggiornato_da: utenteId };
  const query = nota.id
    ? client.from('note_preventivo_libreria').update(campi).eq('id', nota.id).eq('linea', linea)
    : client.from('note_preventivo_libreria').insert({ ...campi, linea, creato_da: utenteId });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
export async function eliminaNotaLibreria(id: string, client: SupabaseClient<Database> = supabase) {
  return eliminaConEsito('note_preventivo_libreria', id, undefined, client);
}