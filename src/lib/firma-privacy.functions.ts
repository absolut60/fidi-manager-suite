import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generaPdfPrivacy } from "./privacy-pdf";

/**
 * Genera (o rigenera) il token per il link di firma privacy di un CONTATTO.
 */
export const generaTokenFirmaPrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contattoId: string; giorniValidita?: number }) =>
    z.object({
      contattoId: z.string().uuid(),
      giorniValidita: z.number().int().min(1).max(365).default(30),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Verifica accesso al contatto via RLS utente
    const { data: ct, error: e1 } = await supabase
      .from("contatti").select("id").eq("id", data.contattoId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!ct) throw new Error("Contatto non trovato o non accessibile");

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + data.giorniValidita * 86400 * 1000).toISOString();

    const { error: e2 } = await supabaseAdmin
      .from("contatti")
      .update({ privacy_token: token, privacy_token_expires_at: expires })
      .eq("id", data.contattoId);
    if (e2) throw new Error(e2.message);

    return { token, expires_at: expires };
  });

/**
 * Recupera dati minimi del contatto + cliente per la pagina pubblica di firma.
 */
export const getContattoPerFirma = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select("id, cliente_id, nome, cognome, email, privacy_firmata, privacy_token_expires_at")
      .eq("privacy_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido");
    if (ct.privacy_firmata) throw new Error("Privacy già firmata per questo contatto");
    if (ct.privacy_token_expires_at && new Date(ct.privacy_token_expires_at) < new Date()) {
      throw new Error("Link scaduto. Chiedi al punto vendita di generarne uno nuovo.");
    }

    const { data: cli, error: e2 } = await supabaseAdmin
      .from("clienti")
      .select("ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta")
      .eq("id", ct.cliente_id)
      .maybeSingle();
    if (e2) throw new Error(e2.message);

    return {
      contatto: {
        id: ct.id,
        nome: ct.nome,
        cognome: ct.cognome,
        email: ct.email,
      },
      cliente: {
        ragione_sociale: cli?.ragione_sociale ?? "",
        partita_iva: cli?.partita_iva ?? null,
        codice_fiscale: cli?.codice_fiscale ?? null,
        indirizzo: cli?.indirizzo ?? null,
        citta: cli?.citta ?? null,
      },
    };
  });

/**
 * Salva la firma del contatto effettuata tramite link pubblico.
 */
export const firmaPrivacyConToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; firmaDataUrl: string }) =>
    z.object({
      token: z.string().uuid(),
      firmaDataUrl: z.string().startsWith("data:image/png;base64,").max(2_000_000),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select("id, cliente_id, nome, cognome, email, privacy_firmata, privacy_token_expires_at")
      .eq("privacy_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido");
    if (ct.privacy_firmata) throw new Error("Privacy già firmata");
    if (ct.privacy_token_expires_at && new Date(ct.privacy_token_expires_at) < new Date()) {
      throw new Error("Link scaduto");
    }

    const { data: cli } = await supabaseAdmin
      .from("clienti")
      .select("ragione_sociale, partita_iva, codice_fiscale, indirizzo, citta")
      .eq("id", ct.cliente_id)
      .maybeSingle();

    const now = new Date();
    const nomeCompleto = [ct.nome, ct.cognome].filter(Boolean).join(" ").trim() || "Contatto";

    // 1) Upload PNG firma
    const base64 = data.firmaDataUrl.split(",")[1];
    const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const firmaPath = `contatti/${ct.id}/firma-${now.getTime()}.png`;
    const { error: eFirma } = await supabaseAdmin.storage.from("firme")
      .upload(firmaPath, pngBytes, { upsert: true, contentType: "image/png" });
    if (eFirma) throw new Error(eFirma.message);
    // Bucket "firme" privato: genera URL firmato a lunga scadenza (10 anni)
    const { data: firmaSigned, error: eSigned } = await supabaseAdmin.storage
      .from("firme")
      .createSignedUrl(firmaPath, 60 * 60 * 24 * 365 * 10);
    if (eSigned) throw new Error(eSigned.message);
    const firmaUrl = { publicUrl: firmaSigned.signedUrl };

    // 2) Genera PDF (intestato al cliente, firmato dal contatto)
    const pdfBytes = await generaPdfPrivacy({
      ragioneSociale: `${cli?.ragione_sociale ?? ""} — firma di ${nomeCompleto}`,
      partitaIva: cli?.partita_iva,
      codiceFiscale: cli?.codice_fiscale,
      indirizzo: cli?.indirizzo,
      citta: cli?.citta,
      email: ct.email,
      firmaPngDataUrl: data.firmaDataUrl,
      dataFirma: now,
    });
    const pdfPath = `contatti/${ct.id}/privacy-${now.getTime()}.pdf`;
    const { error: ePdf } = await supabaseAdmin.storage.from("documenti-privacy")
      .upload(pdfPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
    if (ePdf) throw new Error(ePdf.message);
    // Bucket privato: signed URL a lunga scadenza (10 anni). Il path è la fonte di verità.
    const { data: pdfSigned, error: ePdfSigned } = await supabaseAdmin.storage
      .from("documenti-privacy")
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
    if (ePdfSigned) throw new Error(ePdfSigned.message);
    const pdfUrl = { publicUrl: pdfSigned.signedUrl };

    // 3) Aggiorna contatto e invalida il token
    const { error: eUpd } = await supabaseAdmin.from("contatti").update({
      privacy_firmata: true,
      data_firma: now.toISOString(),
      firma_url: firmaUrl.publicUrl,
      pdf_privacy_url: pdfUrl.publicUrl,
      pdf_privacy_path: pdfPath,
      privacy_token: null,
      privacy_token_expires_at: null,
    }).eq("id", ct.id);
    if (eUpd) throw new Error(eUpd.message);

    return { ok: true, pdfUrl: pdfUrl.publicUrl, pdfPath };
  });
