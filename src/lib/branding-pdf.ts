import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { MAX_LOGO_BYTES, type RigaBrandingSede } from './branding-sede';

export type BrandingPdf = {
  nome: string | null; insegna: string | null; indirizzo: string | null;
  cap: string | null; citta: string | null; provincia: string | null;
  telefono: string | null; email: string | null;
  logoPdfBytes: Uint8Array | null; rigaSede: string;
};
const presente = (value?: string | null) => value?.trim() || null;

export function datiBrandingPdf(sede?: RigaBrandingSede | null): BrandingPdf {
  const dati = {
    nome: presente(sede?.nome), insegna: presente(sede?.insegna), indirizzo: presente(sede?.indirizzo),
    cap: presente(sede?.cap), citta: presente(sede?.citta), provincia: presente(sede?.provincia),
    telefono: presente(sede?.telefono), email: presente(sede?.email_sede),
  };
  // Compatibilità richiesta: una sede storica senza logo né contatti non cambia il piede.
  const attivo = Boolean(presente(sede?.logo_pdf_path) || dati.telefono || dati.email);
  const localita = [dati.cap, dati.citta, dati.provincia ? `(${dati.provincia})` : null].filter(Boolean).join(' ');
  const indirizzo = [dati.indirizzo, localita].filter(Boolean).join(', ');
  return { ...dati, logoPdfBytes: null, rigaSede: attivo ? [dati.nome, dati.insegna, indirizzo,
    dati.telefono ? `Tel. ${dati.telefono}` : null, dati.email].filter(Boolean).join(' — ') : '' };
}

/** Solo sede salvata del documento: filiale e cliente non sono chiavi di collegamento. */
export async function caricaBrandingPdf(preventivo: { store_id: string | null }, client: SupabaseClient<Database>): Promise<BrandingPdf> {
  if (!preventivo.store_id) return datiBrandingPdf(null);
  try {
    const { data: sede, error } = await client.from('stores')
      .select('nome, insegna, indirizzo, cap, citta, provincia, telefono, email_sede, logo_pdf_path')
      .eq('id', preventivo.store_id).maybeSingle();
    if (error || !sede) return datiBrandingPdf(null);
    const branding = datiBrandingPdf(sede);
    if (!sede.logo_pdf_path) return branding;
    try {
      const { data: blob, error: downloadError } = await client.storage.from('branding').download(sede.logo_pdf_path);
      if (downloadError || !blob || blob.size > MAX_LOGO_BYTES) return branding;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return branding;
      return { ...branding, logoPdfBytes: bytes };
    } catch { return branding; }
  } catch { return datiBrandingPdf(null); }
}

/** Area logo esistente: stessa altezza massima e larghezza massima, senza deformazioni. */
export function dimensioniLogoPdf(width: number, height: number, tipo: 'sistema' | 'fidimanager') {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return null;
  const maxHeight = tipo === 'sistema' ? 20.2 : 13.4;
  const scala = Math.min(95 / width, maxHeight / height);
  return { x: 12, y: (tipo === 'sistema' ? 4 : 6) + (maxHeight - height * scala) / 2,
    width: width * scala, height: height * scala };
}