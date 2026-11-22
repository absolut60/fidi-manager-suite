import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { ordineBloccatoGamma } from './esportazione-gamma';
import { preventivoModificabile } from './permessi-preventivi';
import { inizioGiornoExport, giornoSuccessivoExport } from './preventivi-api';

type Tables = Database['public']['Tables'];
export type EsportazioneGamma = Tables['esportazioni_gamma']['Row'];
export type EventoGamma = Tables['esportazioni_gamma_eventi']['Row'];
export type PeriodoGamma = { dal: string; al: string };
export const DURATA_URL_GAMMA = 60;
export function modoEditorGamma(ordine: { tipo: string; stato: string; esportato_gamma_at?: string | null }, puoScrivere: boolean) {
  const bloccato = ordineBloccatoGamma(ordine);
  return { bloccato, modificabile: !bloccato && preventivoModificabile(ordine, puoScrivere), statoEditabile: !bloccato && puoScrivere, salva: !bloccato && (preventivoModificabile(ordine, puoScrivere) || ordine.tipo === 'ordine' && puoScrivere) };
}
export function dataOraGamma(data: string): string {
  return new Date(data).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}
export const opzioniNomiGamma = { queryKey: ['gamma', 'nomi-utenti'], queryFn: async () => {
  const { data, error } = await supabase.rpc('get_nomi_utenti');
  if (error) throw error;
  return new Map((data ?? []).map(p => [p.id, [p.nome, p.cognome].filter(Boolean).join(' ').trim()]));
} };
export function nomeUtenteGamma(nomi: Map<string, string> | undefined, id: string | null): string {
  return (id && nomi?.get(id)) || 'Utente senza nome';
}
export async function riapriOrdineGamma(id: string, motivo: string, client = supabase) {
  const { error } = await client.rpc('riapri_ordine_gamma', { _ordine_id: id, _motivo: motivo.trim() });
  if (error) throw error;
}
export async function fetchStoricoGamma(periodo: PeriodoGamma, client = supabase): Promise<EsportazioneGamma[]> {
  const tutte: EsportazioneGamma[] = [];
  for (let offset = 0; ; offset += 500) {
    let q = client.from('esportazioni_gamma').select('*').order('creata_at', { ascending: false }).order('id');
    if (periodo.dal) q = q.gte('creata_at', inizioGiornoExport(periodo.dal));
    if (periodo.al) q = q.lt('creata_at', giornoSuccessivoExport(periodo.al));
    const { data, error } = await q.range(offset, offset + 499);
    if (error) throw error;
    tutte.push(...(data ?? []));
    if ((data ?? []).length < 500) return tutte;
  }
}
export async function fetchEventiGamma(esportazioneId: string | null, periodo: PeriodoGamma, client = supabase): Promise<EventoGamma[]> {
  const tutti: EventoGamma[] = [];
  for (let offset = 0; ; offset += 500) {
    let q = client.from('esportazioni_gamma_eventi').select('*').order('at', { ascending: false }).order('id');
    if (esportazioneId) q = q.eq('esportazione_id', esportazioneId);
    else {
      q = q.is('esportazione_id', null).eq('tipo', 'riaperto');
      if (periodo.dal) q = q.gte('at', inizioGiornoExport(periodo.dal));
      if (periodo.al) q = q.lt('at', giornoSuccessivoExport(periodo.al));
    }
    const { data, error } = await q.range(offset, offset + 499);
    if (error) throw error;
    tutti.push(...(data ?? []));
    if ((data ?? []).length < 500) return tutti;
  }
}
export async function preparaDownloadGamma(file: Pick<EsportazioneGamma, 'file_path' | 'nome_file'>, client = supabase, fetchFile: typeof fetch = fetch) {
  if (!file.file_path || !file.nome_file) throw new Error('File non disponibile nello storico.');
  const { data, error } = await client.storage.from('esportazioni-gamma').createSignedUrl(file.file_path, DURATA_URL_GAMMA);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Impossibile preparare il download.');
  const risposta = await fetchFile(data.signedUrl);
  if (!risposta.ok) throw new Error(`Download non riuscito (${risposta.status}).`);
  return { blob: await risposta.blob(), nome: file.nome_file };
}
