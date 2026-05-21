import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generaPdfPrivacy } from "./privacy-pdf";

/**
 * Genera (o rigenera) il token per il link di firma privacy del cliente.
 * Solo utenti autenticati.
 */
export const generaTokenFirmaPrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string; giorniValidita?: number }) =>
    z.object({
      clienteId: z.string().uuid(),
      giorniValidita: z.number().int().min(1).max(365).default(30),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Verifica permessi tramite RLS dell'utente
    const { data: cli, error: e1 } = await supabase
      .from("clienti").select("id").eq("id", data.clienteId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cli) throw new Error("Cliente non trovato o non accessibile");

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + data.giorniValidita * 86400 * 1000).toISOString();

    const { error: e2 } = await supabaseAdmin
      .from("clienti")
      .update({ privacy_token: token, privacy_token_expires_at: expires })
      .eq("id", data.clienteId);
    if (e2) throw new Error(e2.message);

    return { token, expires_at: expires };
  });

/**
 * Recupera dati minimi del cliente per la pagina pubblica di firma.
 */
export const getClientePerFirma = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: cli, error } = await supabaseAdmin
      .from("clienti")
      .select("id, ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta, email, privacy_firmata, privacy_token_expires_at")
      .eq("privacy_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cli) throw new Error("Link non valido");
    if (cli.privacy_firmata) throw new Error("Privacy già firmata per questo cliente");
    if (cli.privacy_token_expires_at && new Date(cli.privacy_token_expires_at) < new Date()) {
      throw new Error("Link scaduto. Chiedi al punto vendita di generarne uno nuovo.");
    }
    return {
      id: cli.id,
      ragione_sociale: cli.ragione_sociale,
      partita_iva: cli.partita_iva,
      codice_fiscale: cli.codice_fiscale,
      indirizzo: cli.indirizzo,
      citta: cli.citta,
      email: cli.email,
    };
  });

/**
 * Salva la firma del cliente effettuata tramite link pubblico.
 */
export const firmaPrivacyConToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; firmaDataUrl: string }) =>
    z.object({
      token: z.string().uuid(),
      firmaDataUrl: z.string().startsWith("data:image/png;base64,").max(2_000_000),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { data: cli, error } = await supabaseAdmin
      .from("clienti")
      .select("id, ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta, email, privacy_firmata, privacy_token_expires_at")
      .eq("privacy_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cli) throw new Error("Link non valido");
    if (cli.privacy_firmata) throw new Error("Privacy già firmata");
    if (cli.privacy_token_expires_at && new Date(cli.privacy_token_expires_at) < new Date()) {
      throw new Error("Link scaduto");
    }

    const now = new Date();

    // 1) Upload PNG firma
    const base64 = data.firmaDataUrl.split(",")[1];
    const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const firmaPath = `${cli.id}/firma-${now.getTime()}.png`;
    const { error: eFirma } = await supabaseAdmin.storage.from("firme")
      .upload(firmaPath, pngBytes, { upsert: true, contentType: "image/png" });
    if (eFirma) throw new Error(eFirma.message);
    const { data: firmaUrl } = supabaseAdmin.storage.from("firme").getPublicUrl(firmaPath);

    // 2) Genera PDF
    const pdfBytes = await generaPdfPrivacy({
      ragioneSociale: cli.ragione_sociale,
      partitaIva: cli.partita_iva,
      codiceFiscale: cli.codice_fiscale,
      indirizzo: cli.indirizzo,
      citta: cli.citta,
      email: cli.email,
      firmaPngDataUrl: data.firmaDataUrl,
      dataFirma: now,
    });
    const pdfPath = `${cli.id}/privacy-${now.getTime()}.pdf`;
    const { error: ePdf } = await supabaseAdmin.storage.from("privacy-pdf")
      .upload(pdfPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
    if (ePdf) throw new Error(ePdf.message);
    const { data: pdfUrl } = supabaseAdmin.storage.from("privacy-pdf").getPublicUrl(pdfPath);

    // 3) Aggiorna cliente e invalida il token
    const { error: eUpd } = await supabaseAdmin.from("clienti").update({
      privacy_firmata: true,
      data_firma: now.toISOString(),
      firma_url: firmaUrl.publicUrl,
      privacy_pdf_url: pdfUrl.publicUrl,
      privacy_token: null,
      privacy_token_expires_at: null,
    }).eq("id", cli.id);
    if (eUpd) throw new Error(eUpd.message);

    return { ok: true };
  });
