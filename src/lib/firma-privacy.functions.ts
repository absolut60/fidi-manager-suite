import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { risolviIntestazioneSoggetto } from "./intestazione-soggetto.server";
import { generaSchedaCliente } from "./scheda-pdf";
import { buildPrivacyPdfEmailPayload } from "./email-template";

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
      .select("id, cliente_id, lead_id, nome, cognome, email, cellulare, luogo_nascita, data_nascita, codice_fiscale, residenza, privacy_firmata, privacy_token_expires_at")
      .eq("privacy_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido");
    if (ct.privacy_firmata) throw new Error("Privacy già firmata per questo contatto");
    if (ct.privacy_token_expires_at && new Date(ct.privacy_token_expires_at) < new Date()) {
      throw new Error("Link scaduto. Chiedi al punto vendita di generarne uno nuovo.");
    }

    const soggetto = await risolviIntestazioneSoggetto(ct);

    return {
      contatto: {
        id: ct.id,
        nome: ct.nome,
        cognome: ct.cognome,
        email: ct.email,
        cellulare: ct.cellulare,
        luogo_nascita: ct.luogo_nascita,
        data_nascita: ct.data_nascita,
        codice_fiscale: ct.codice_fiscale,
        residenza: ct.residenza,
      },
      cliente: {
        ragione_sociale: soggetto.ragione_sociale,
        partita_iva: soggetto.partita_iva,
        codice_fiscale: soggetto.codice_fiscale,
        indirizzo: soggetto.indirizzo,
        citta: soggetto.citta,
      },
    };
  });

/**
 * Salva la firma del contatto effettuata tramite link pubblico.
 */
export const firmaPrivacyConToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      token: z.string().uuid(),
      firmaDataUrl: z.string().startsWith("data:image/png;base64,").max(2_000_000),
      dichiarante: z.object({
        nome: z.string().trim().min(1, "Nome obbligatorio").max(100),
        cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100),
        societa: z.string().trim().max(200).optional(),
        luogo_nascita: z.string().trim().max(120).optional(),
        data_nascita: z.string().trim().max(20).optional(),
        codice_fiscale: z.string().trim().max(32).optional(),
        residenza: z.string().trim().max(250).optional(),
        email: z.string().trim().max(255),
        cellulare: z.string().trim().max(40).optional(),
      }),
      consensi: z.object({
        profilazione: z.boolean(),
        marketing_media: z.boolean(),
        marketing_diretto: z.boolean(),
      }),
      data_firma: z.string().trim().max(20).optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const emailDich = data.dichiarante.email.trim();
    if (!emailDich || !z.string().email().safeParse(emailDich).success) {
      throw new Error("Email obbligatoria per l'invio del contratto firmato");
    }

    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select("id, cliente_id, lead_id, nome, cognome, email, privacy_firmata, privacy_token_expires_at")
      .eq("privacy_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido");
    if (ct.privacy_firmata) throw new Error("Privacy già firmata");
    if (ct.privacy_token_expires_at && new Date(ct.privacy_token_expires_at) < new Date()) {
      throw new Error("Link scaduto");
    }

    // Intestazione del soggetto: cliente oppure lead non ancora convertito
    const soggetto = await risolviIntestazioneSoggetto(ct);

    const now = new Date();
    const nomeCompleto =
      [data.dichiarante.nome, data.dichiarante.cognome].filter(Boolean).join(" ").trim() ||
      [ct.nome, ct.cognome].filter(Boolean).join(" ").trim() ||
      "Contatto";

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
    if (eSigned) {
      await supabaseAdmin.storage.from("firme").remove([firmaPath]);
      throw new Error(eSigned.message);
    }
    const firmaUrl = { publicUrl: firmaSigned.signedUrl };

    // 2) Genera il PDF RICCO — stesso generatore del wizard cliente (§5)
    const ragioneSociale = data.dichiarante.societa?.trim() || soggetto.ragione_sociale;
    const pdfBytes = await generaSchedaCliente({
      tipo: "aggiornamento",
      ragioneSociale,
      dichiaranteNome: data.dichiarante.nome,
      dichiaranteCognome: data.dichiarante.cognome,
      luogoNascita: data.dichiarante.luogo_nascita || undefined,
      dataNascita: data.dichiarante.data_nascita || undefined,
      codiceFiscaleDich: data.dichiarante.codice_fiscale || soggetto.codice_fiscale || undefined,
      partitaIva: soggetto.partita_iva ?? undefined,
      residenza: data.dichiarante.residenza || undefined,
      emailDich: emailDich,
      cellulareDich: data.dichiarante.cellulare || undefined,
      consensoProfilazione: data.consensi.profilazione ? "si" : "no",
      consensoMarketingMedia: data.consensi.marketing_media ? "si" : "no",
      consensoMarketingDiretto: data.consensi.marketing_diretto ? "si" : "no",
      dataFirma: data.data_firma || now,
      firmaPngDataUrl: data.firmaDataUrl,
    });
    const pdfPath = `contatti/${ct.id}/privacy-${now.getTime()}.pdf`;
    const { error: ePdf } = await supabaseAdmin.storage.from("documenti-privacy")
      .upload(pdfPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
    if (ePdf) {
      await supabaseAdmin.storage.from("firme").remove([firmaPath]);
      throw new Error(ePdf.message);
    }
    // Bucket privato: signed URL a lunga scadenza (10 anni). Il path è la fonte di verità.
    const { data: pdfSigned, error: ePdfSigned } = await supabaseAdmin.storage
      .from("documenti-privacy")
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
    if (ePdfSigned) {
      await supabaseAdmin.storage.from("firme").remove([firmaPath]);
      await supabaseAdmin.storage.from("documenti-privacy").remove([pdfPath]);
      throw new Error(ePdfSigned.message);
    }
    const pdfUrl = { publicUrl: pdfSigned.signedUrl };

    // 3) Aggiorna contatto e invalida il token — se fallisce, rimuovi i file orfani
    const { error: eUpd } = await supabaseAdmin.from("contatti").update({
      privacy_firmata: true,
      data_firma: now.toISOString(),
      firma_url: firmaUrl.publicUrl,
      pdf_privacy_url: pdfUrl.publicUrl,
      pdf_privacy_path: pdfPath,
      luogo_nascita: data.dichiarante.luogo_nascita || null,
      data_nascita: data.dichiarante.data_nascita || null,
      codice_fiscale: data.dichiarante.codice_fiscale || null,
      residenza: data.dichiarante.residenza || null,
      email: emailDich,
      cellulare: data.dichiarante.cellulare || null,
      consenso_profilazione: data.consensi.profilazione,
      consenso_marketing_media: data.consensi.marketing_media,
      consenso_marketing_diretto: data.consensi.marketing_diretto,
      privacy_token: null,
      privacy_token_expires_at: null,
    }).eq("id", ct.id);
    if (eUpd) {
      await supabaseAdmin.storage.from("firme").remove([firmaPath]);
      await supabaseAdmin.storage.from("documenti-privacy").remove([pdfPath]);
      throw new Error(eUpd.message);
    }

    // 4) Invio del PDF al firmatario — non deve MAI rompere il flusso:
    // il documento è già archiviato e recuperabile dal path.
    let emailInviata = false;
    try {
      let binary = "";
      for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
      const payload = buildPrivacyPdfEmailPayload({
        toName: nomeCompleto,
        ragioneSociale,
        dataFirma: now.toISOString(),
        pdfBase64: btoa(binary),
      });
      const { sendEmailViaEdge } = await import("./inngest/send-email.server");
      const esito = await sendEmailViaEdge({ to: emailDich, ...payload });
      emailInviata = esito.ok;
      if (!esito.ok) console.error("[firma-privacy] invio email fallito:", esito.err);
    } catch (e) {
      console.error("[firma-privacy] invio email fallito:", e);
    }

    return { ok: true, pdfUrl: pdfUrl.publicUrl, pdfPath, emailInviata };
  });

