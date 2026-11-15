import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { brandingSede, MAX_LOGO_BYTES, type RigaBrandingSede } from '@/lib/branding-sede';
import { LOGO_EMAIL_URL } from '@/lib/template-email-render';

type ClientStorage = Pick<SupabaseClient<Database>, 'storage'>;
export type LogoEmailSede = { logoEmailUrl: string; inlineLogoBase64?: string };

/** Anteprime browser: nessuna lettura della sede aggiuntiva, firma con i permessi dell'utente. */
export async function logoEmailAnteprima(sede: RigaBrandingSede | null, client: ClientStorage): Promise<LogoEmailSede> {
  const branding = brandingSede(sede);
  if (!branding.logoEmailPath) return { logoEmailUrl: LOGO_EMAIL_URL };
  try {
    const { data, error } = await client.storage.from('branding').createSignedUrl(branding.logoEmailPath, 3600);
    if (!error && data?.signedUrl) return { logoEmailUrl: data.signedUrl };
  } catch { /* Un logo non leggibile non impedisce l'anteprima. */ }
  return { logoEmailUrl: LOGO_EMAIL_URL };
}

/** Invii server: solo il client privilegiato già autorizzato; mai fetch di URL forniti dal browser.
 * L'archivio usa gli stessi byte in data URL, senza link pubblici o firme che scadono.
 */
export async function logoEmailInvio(sede: RigaBrandingSede | null, client: ClientStorage): Promise<LogoEmailSede> {
  const branding = brandingSede(sede);
  if (!branding.logoEmailPath) return { logoEmailUrl: LOGO_EMAIL_URL };
  try {
    const { data, error } = await client.storage.from('branding').download(branding.logoEmailPath);
    if (error || !data) throw new Error('Download non disponibile');
    if (data.size > MAX_LOGO_BYTES) throw new Error('Logo oltre 1 MB');
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
      throw new Error('Logo PNG non valido');
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const inlineLogoBase64 = btoa(binary);
    return { logoEmailUrl: `data:image/png;base64,${inlineLogoBase64}`, inlineLogoBase64 };
  } catch {
    // Nessun contenuto del file, URL firmato o dato del destinatario nei log.
    console.warn('[branding-email] Logo sede non disponibile: ripiego MADE');
    return { logoEmailUrl: LOGO_EMAIL_URL };
  }
}