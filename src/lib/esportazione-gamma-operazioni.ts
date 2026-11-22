import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { caricaDatiEsportazioneGamma } from './esportazione-gamma-dati';
import { costruisciEsportazioneGamma, type DatiOrdineGamma } from './esportazione-gamma';
import { normalizzaCodiceSdi } from './codice-sdi';
import type { RiferimentoPreventivo } from './condizioni-riferimento';
import { normalizzaTestoLead } from './lead-anagrafica';

export const CAMPI_ANAGRAFICA_LEAD_GAMMA = ['ragione_sociale', 'nome', 'cognome', 'partita_iva', 'codice_fiscale',
  'indirizzo', 'cap', 'citta', 'provincia', 'telefono', 'cellulare', 'email', 'tipo_soggetto'] as const;
export type CampoAnagraficaLeadGamma = typeof CAMPI_ANAGRAFICA_LEAD_GAMMA[number];
export type AnagraficaLeadGamma = Partial<Record<CampoAnagraficaLeadGamma, string | null>>;
type DatiNuovoClienteGamma = RiferimentoPreventivo & { codice_sdi: string; anagrafica?: AnagraficaLeadGamma };

/** In questa finestra i valori già compilati non sono riscrivibili, neppure con suggerimenti Google. */
export function patchAnagraficaLeadGamma(d: DatiOrdineGamma, valori: AnagraficaLeadGamma): AnagraficaLeadGamma {
  return Object.fromEntries(CAMPI_ANAGRAFICA_LEAD_GAMMA.filter(c => !normalizzaTestoLead(d.lead?.[c]) && valori[c] !== undefined)
    .map(c => [c, valori[c]]));
}

export function datiNuovoClienteGamma(d: DatiOrdineGamma): DatiNuovoClienteGamma {
  return { listino_rif: d.ordine.listino_rif ?? d.lead?.listino_rif ?? null,
    macrocategoria_rif: d.ordine.macrocategoria_rif?.trim() || d.lead?.macrocategoria_rif || null,
    categoria_rif: d.ordine.categoria_rif?.trim() || d.lead?.categoria_rif || null,
    codice_sdi: d.lead?.codice_sdi ?? '',
    anagrafica: Object.fromEntries(CAMPI_ANAGRAFICA_LEAD_GAMMA.map(c => [c, d.lead?.[c] ?? ''])) };
}

export async function completaDatiGamma(id: string, valori: ReturnType<typeof datiNuovoClienteGamma>, client: SupabaseClient<Database> = supabase) {
  const anagrafica = Object.fromEntries(CAMPI_ANAGRAFICA_LEAD_GAMMA.filter(c => valori.anagrafica?.[c] !== undefined)
    .map(c => { const v = valori.anagrafica?.[c]; return [c, v == null ? null : normalizzaTestoLead(v) ?? '']; }));
  const { error } = await client.rpc('completa_dati_lead_esportazione_gamma', { _ordine_id: id,
    _listino: valori.listino_rif, _macrocategoria: valori.macrocategoria_rif, _categoria: valori.categoria_rif,
    // Il generatore non rappresenta NULL nei parametri RPC, ma SQL lo usa per "invariato".
    _codice_sdi: normalizzaCodiceSdi(valori.codice_sdi), _anagrafica: anagrafica } as unknown as Database['public']['Functions']['completa_dati_lead_esportazione_gamma']['Args']);
  if (error) throw new Error(error.message);
}

/** Ricalcola prima di caricare; registra solo i pronti e ripulisce se la registrazione fallisce. */
export async function esportaOrdiniGamma(ids: string[], client: SupabaseClient<Database> = supabase,
  carica: (ids: string[]) => Promise<DatiOrdineGamma[]> = ids => caricaDatiEsportazioneGamma(ids, client)) {
  const dati = await carica(ids);
  if (dati.some(d => d.ordine.esportato_gamma_at)) throw new Error('Uno o più ordini sono già esportati. Aggiorna la lista.');
  const esito = costruisciEsportazioneGamma(dati);
  if (!esito.ordiniEsportati.length) throw new Error('Nessun ordine esportabile.');
  const { scriviFileGammaXls, nomeFileGamma } = await import('./esportazione-gamma-file');
  const nome = nomeFileGamma(new Date());
  const blob = new Blob([new Uint8Array(scriviFileGammaXls(esito.righe))], { type: 'application/vnd.ms-excel' });
  const percorso = `${crypto.randomUUID()}/${nome}`;
  const bucket = client.storage.from('esportazioni-gamma');
  const { error: uploadError } = await bucket.upload(percorso, blob, { contentType: blob.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const testate = esito.righe.filter(r => r.TESTATA_RIGHE === 'T');
  try {
    const { error } = await client.rpc('registra_esportazione_gamma', { _ordine_ids: esito.ordiniEsportati,
      _nome_file: nome, _file_path: percorso,
      _n_doc_fornitore: testate.filter(r => Number(r.IND_CLIFOR) === 1).length,
      _n_doc_cliente: testate.filter(r => Number(r.IND_CLIFOR) === 0).length });
    if (error) throw new Error(error.message);
  } catch (errore) {
    const { error: cleanupError } = await bucket.remove([percorso]);
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    throw new Error(cleanupError ? `${messaggio}. Impossibile rimuovere il file non registrato: ${cleanupError.message}` : messaggio);
  }
  return { esito, blob, nome };
}