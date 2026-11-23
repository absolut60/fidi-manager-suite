import { PDFDocument } from 'pdf-lib';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { fetchDatiClientePreventivo, type PreventivoConDettagli } from './preventivi-api';
import { nomeIntestatarioPdf } from './soggetto-preventivo';
import { generaSchedaCliente, type SchedaPdfInput } from './scheda-pdf';

type CampiPrivacy = 'ragione_sociale' | 'partita_iva' | 'codice_fiscale' | 'tipo_soggetto' | 'indirizzo' | 'cap' | 'citta' | 'provincia' | 'email' | 'cellulare';
export type ClientePrivacyPreventivo = Pick<Database['public']['Tables']['clienti']['Row'], CampiPrivacy>;
export type LeadPrivacyPreventivo = Pick<Database['public']['Tables']['lead']['Row'], CampiPrivacy | 'nome' | 'cognome'>;
type Intestatario = Parameters<typeof nomeIntestatarioPdf>[0];

/** Fonte unica: solo dati del soggetto, mai dichiarante, cantiere o sede MADE. */
export function inputPrivacyPreventivo(prev: Intestatario, dati?: ClientePrivacyPreventivo | LeadPrivacyPreventivo | null): SchedaPdfInput {
  const intestatario = nomeIntestatarioPdf(prev);
  const residenza = [dati?.indirizzo, [dati?.cap, dati?.citta].filter(Boolean).join(' '), dati?.provincia ? `(${dati.provincia.trim()})` : '']
    .map(v => v?.trim()).filter(Boolean).join(', ');
  return {
    tipo: 'nuovo', daFirmare: true,
    ragioneSociale: intestatario === '—' ? '' : intestatario,
    partitaIva: dati?.partita_iva?.trim() ?? '',
    codiceFiscaleDich: dati?.tipo_soggetto === 'persona_fisica' ? dati.codice_fiscale?.trim() ?? '' : '',
    residenza, emailDich: dati?.email?.trim() ?? '', cellulareDich: dati?.cellulare?.trim() ?? '',
    consensoProfilazione: false, consensoMarketingMedia: false, consensoMarketingDiretto: false,
    dataFirma: '',
  };
}

/** Lettura solo quando richiesta: RPC anagrafica cliente già autorizzata,
 * oppure lead collegato tramite client utente/RLS, senza ampliare DTO o permessi.
 */
export async function caricaInputPrivacyPreventivo(prev: PreventivoConDettagli): Promise<SchedaPdfInput> {
  if (prev.cliente_id) {
    const dati = await fetchDatiClientePreventivo(prev.cliente_id);
    return inputPrivacyPreventivo(prev, dati);
  }
  if (prev.lead_id) {
    const { data, error } = await supabase.from('lead')
      .select('ragione_sociale,nome,cognome,partita_iva,codice_fiscale,tipo_soggetto,indirizzo,cap,citta,provincia,email,cellulare')
      .eq('id', prev.lead_id).single();
    if (error) throw error;
    return inputPrivacyPreventivo(prev, data);
  }
  return inputPrivacyPreventivo(prev);
}

export async function unisciPdfPrivacy(documento: Blob, modulo: Uint8Array): Promise<Blob> {
  const pdf = await PDFDocument.load(await documento.arrayBuffer());
  const privacy = await PDFDocument.load(modulo);
  const pages = await pdf.copyPages(privacy, privacy.getPageIndices());
  pages.forEach(page => pdf.addPage(page));
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}

/** Spunta assente: restituisce lo stesso oggetto e gli stessi byte, senza letture.
 * Anche un errore di lettura/merge restituisce il documento originario intatto.
 */
export async function accodaPrivacyPreventivo(
  documento: { blob: Blob; fileName: string }, prev: PreventivoConDettagli, accoda: boolean,
  generaModulo: (prev: PreventivoConDettagli) => Promise<Uint8Array> = async p => generaSchedaCliente(await caricaInputPrivacyPreventivo(p)),
): Promise<{ documento: { blob: Blob; fileName: string }; privacyNonAccodata: boolean }> {
  if (!accoda) return { documento, privacyNonAccodata: false };
  try {
    return { documento: { ...documento, blob: await unisciPdfPrivacy(documento.blob, await generaModulo(prev)) }, privacyNonAccodata: false };
  } catch (error) {
    console.warn('Informativa privacy non accodata', error);
    return { documento, privacyNonAccodata: true };
  }
}