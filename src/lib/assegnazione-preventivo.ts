import { preventivoModificabile, puoScriverePreventivi } from './permessi-preventivi';

export type AssegnazionePreventivoDati = { assegnato_a: string | null; assegnati_copia: string[] };
export type UtenteAssegnabile = { id: string; nome: string | null; cognome: string | null };
export const nomeUtenteAssegnabile = (p: UtenteAssegnabile) => [p.nome, p.cognome].filter(Boolean).join(' ').trim() || 'Utente senza nome';
export function nomeAssegnato(id: string | null, utenti: UtenteAssegnabile[]) {
  if (!id) return 'Nessuno';
  const p = utenti.find(u => u.id === id);
  return p ? nomeUtenteAssegnabile(p) : 'Utente non disponibile';
}
export const assegnazioneModificabile = (prev: { stato: string; tipo: string }, roles: readonly string[]) =>
  preventivoModificabile(prev, puoScriverePreventivi(roles));
/** L'identità proviene dalla sessione; nessun testo libero entra nell'OR. */
export function filtroPreventiviPerMe(userId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('Utente non valido per il filtro Per me');
  return `assegnato_a.eq.${userId},assegnati_copia.cs.{${userId}}`;
}