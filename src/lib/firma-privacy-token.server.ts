import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Genera (o rigenera) il token del link di firma privacy per un contatto e
 * valorizza `richiesta_privacy_generata_il`.
 * Logica condivisa fra generaTokenFirmaPrivacy e inviaRichiestaFirmaPrivacy.
 */
export async function generaTokenPrivacy(
  contattoId: string,
  giorniValidita: number,
): Promise<{ token: string; expires_at: string }> {
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + giorniValidita * 86400 * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("contatti")
    .update({
      privacy_token: token,
      privacy_token_expires_at: expires,
      richiesta_privacy_generata_il: new Date().toISOString(),
    })
    .eq("id", contattoId);

  if (error) throw new Error(error.message);

  return { token, expires_at: expires };
}
