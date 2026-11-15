import type { Database } from '@/integrations/supabase/types';
import { LOGO_EMAIL_URL, SEDE_FALLBACK } from '@/lib/template-email-render';

export type RigaBrandingSede = Partial<Pick<Database['public']['Tables']['stores']['Row'],
  'nome' | 'insegna' | 'indirizzo' | 'cap' | 'citta' | 'provincia' | 'telefono' | 'email_sede' | 'pec_sede' | 'logo_email_path' | 'logo_pdf_path'>>;
export type BrandingSede = {
  nome: string | null; insegna: string | null; indirizzo: string | null;
  cap: string | null; citta: string | null; provincia: string | null;
  telefono: string | null; email: string | null; pec: string | null;
  logoEmailPath: string | null; logoPdfPath: string | null;
  logoEmailUrl: string; logoPdfUrl: string | null;
};

/** Il prefisso branding è il bucket, non una seconda cartella dell'oggetto. */
export function urlPubblicoBranding(path: string, baseUrl = import.meta.env?.VITE_SUPABASE_URL ?? ''): string {
  return `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/branding/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Solo composizione dati: nessuna lettura, nessuna modifica alle cornici attuali. */
export function brandingSede(sede?: RigaBrandingSede | null, baseUrl?: string): BrandingSede {
  const dato = (key: keyof typeof SEDE_FALLBACK) => sede?.[key] || SEDE_FALLBACK[key];
  const logoEmailPath = sede?.logo_email_path || null;
  const logoPdfPath = sede?.logo_pdf_path || null;
  return {
    nome: dato('nome'), insegna: dato('insegna'), indirizzo: dato('indirizzo'),
    cap: dato('cap'), citta: dato('citta'), provincia: dato('provincia'), telefono: dato('telefono'),
    email: sede?.email_sede ?? null, pec: sede?.pec_sede ?? null,
    logoEmailPath, logoPdfPath,
    logoEmailUrl: logoEmailPath ? urlPubblicoBranding(logoEmailPath, baseUrl) : LOGO_EMAIL_URL,
    logoPdfUrl: logoPdfPath ? urlPubblicoBranding(logoPdfPath, baseUrl) : null,
  };
}

export const MAX_LOGO_BYTES = 1024 * 1024;
export function erroreFileLogo(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!/\.png$/i.test(file.name) || file.type !== 'image/png') return 'Sono ammessi solo file PNG';
  if (file.size > MAX_LOGO_BYTES) return 'Il logo non può superare 1 MB';
  if (file.size === 0) return 'Il file è vuoto';
  return null;
}

export async function verificaLogoPng(file: File): Promise<void> {
  const errore = erroreFileLogo(file);
  if (errore) throw new Error(errore);
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    throw new Error('Il contenuto del file non è un PNG valido');
  }
}