import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { risolviIntestazioneSoggetto } from "./intestazione-soggetto.server";




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

    const { generaTokenPrivacy } = await import("./firma-privacy-token.server");
    return await generaTokenPrivacy(data.contattoId, data.giorniValidita);
  });

/**
 * Genera il link di firma privacy e prova a inviarlo via email al contatto.
 * L'invio NON è fatale: se SMTP non è disponibile ritorna emailInviata=false
 * e valorizza solo `richiesta_privacy_generata_il`.
 */
export const inviaRichiestaFirmaPrivacy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contattoId: string; origin: string }) =>
    z.object({
      contattoId: z.string().uuid(),
      origin: z.string().url().max(300),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ct, error: e1 } = await supabase
      .from("contatti")
      .select("id, cliente_id, lead_id, nome, cognome, email")
      .eq("id", data.contattoId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!ct) throw new Error("Contatto non trovato o non accessibile");

    const { generaTokenPrivacy } = await import("./firma-privacy-token.server");
    const { token, expires_at } = await generaTokenPrivacy(data.contattoId, 30);
    const link = `${data.origin.replace(/\/+$/, "")}/firma-privacy/${token}`;

    if (!ct.email) return { link, expires_at, emailInviata: false };

    let emailInviata = false;
    try {
      const soggetto = await risolviIntestazioneSoggetto(ct);
      const { buildRichiestaFirmaEmailPayload } = await import("./email-template");
      const payload = buildRichiestaFirmaEmailPayload({
        nomeDestinatario:
          [ct.nome, ct.cognome].filter(Boolean).join(" ").trim() || "Cliente",
        ragioneSociale: soggetto.ragione_sociale,
        link,
      });
      const { sendEmailViaEdge } = await import("./inngest/send-email.server");
      const esito = await sendEmailViaEdge({ to: ct.email, ...payload });
      emailInviata = esito.ok;
      if (!esito.ok) console.error("[firma-privacy] invio richiesta fallito:", esito.err);
    } catch (e) {
      console.error("[firma-privacy] invio richiesta fallito:", e);
    }

    if (emailInviata) {
      const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
      const { error: eUpd } = await admin
        .from("contatti")
        .update({ richiesta_privacy_inviata_il: new Date().toISOString() })
        .eq("id", data.contattoId);
      if (eUpd) console.error("[firma-privacy] update inviata_il fallito:", eUpd.message);
    }

    return { link, expires_at, emailInviata };
  });


/**
 * Recupera dati minimi del contatto + cliente per la pagina pubblica di firma.
 */
export const getContattoPerFirma = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select("id, cliente_id, lead_id, nome, cognome, email, cellulare, luogo_nascita, data_nascita, codice_fiscale, residenza, privacy_firmata, privacy_token_expires_at, richiesta_privacy_aperta_il")
      .eq("privacy_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido");
    if (ct.privacy_firmata) throw new Error("Privacy già firmata per questo contatto");
    if (ct.privacy_token_expires_at && new Date(ct.privacy_token_expires_at) < new Date()) {
      throw new Error("Link scaduto. Chiedi al punto vendita di generarne uno nuovo.");
    }

    // Prima apertura della pagina: traccia il momento (non sovrascrivere le successive)
    if (!ct.richiesta_privacy_aperta_il) {
      try {
        const { error: eApri } = await supabaseAdmin
          .from("contatti")
          .update({ richiesta_privacy_aperta_il: new Date().toISOString() })
          .eq("id", ct.id)
          .is("richiesta_privacy_aperta_il", null);
        if (eApri) console.error("[firma-privacy] tracciamento apertura fallito:", eApri.message);
      } catch (e) {
        console.error("[firma-privacy] tracciamento apertura fallito:", e);
      }
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
      secondi_permanenza: z.number().int().min(0).max(86400).nullable().optional(),

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

    const soggetto = await risolviIntestazioneSoggetto(ct);
    const { finalizzaRaccoltaPrivacy } = await import("./firma-privacy-finalizza.server");
    return await finalizzaRaccoltaPrivacy({
      contattoId: ct.id,
      contattoNome: ct.nome,
      contattoCognome: ct.cognome,
      soggetto,
      dichiarante: { ...data.dichiarante, email: emailDich },
      consensi: data.consensi,
      firmaDataUrl: data.firmaDataUrl,
      data_firma: data.data_firma,
      secondi_permanenza: data.secondi_permanenza,
      origine: "firma_grafica",
      note: "Firma grafica via link privacy",
      invalidaToken: true,
    });
  });

/**
 * Canale "Compila di persona": il cliente compila e firma sul tablet al bancone.
 * Raccoglie ESATTAMENTE gli stessi dati del link pubblico, ma l'accesso è
 * garantito dall'utente autenticato (RLS sul contatto) e l'origine registrata
 * nel registro consensi è 'di_persona'.
 */
export const registraConsensoDiPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      contattoId: z.string().uuid(),
      firmaDataUrl: z.string().startsWith("data:image/png;base64,").max(2_000_000),
      dichiarante: z.object({
        nome: z.string().trim().min(1, "Nome obbligatorio").max(100),
        cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100),
        societa: z.string().trim().max(200).optional(),
        luogo_nascita: z.string().trim().max(120).optional(),
        data_nascita: z.string().trim().max(20).optional(),
        codice_fiscale: z.string().trim().max(32).optional(),
        residenza: z.string().trim().max(250).optional(),
        email: z.string().trim().email("Email non valida").max(255),
        cellulare: z.string().trim().max(40).optional(),
      }),
      consensi: z.object({
        profilazione: z.boolean(),
        marketing_media: z.boolean(),
        marketing_diretto: z.boolean(),
      }),
      data_firma: z.string().trim().max(20).optional(),
      secondi_permanenza: z.number().int().min(0).max(86400).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // L'accesso al contatto è verificato dalle RLS con il client dell'utente
    const { data: ct, error } = await supabase
      .from("contatti")
      .select("id, cliente_id, lead_id, nome, cognome, email, privacy_firmata")
      .eq("id", data.contattoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Contatto non trovato o non accessibile");
    if (ct.privacy_firmata) throw new Error("Privacy già firmata per questo contatto");

    const soggetto = await risolviIntestazioneSoggetto(ct);
    const { finalizzaRaccoltaPrivacy } = await import("./firma-privacy-finalizza.server");
    return await finalizzaRaccoltaPrivacy({
      contattoId: ct.id,
      contattoNome: ct.nome,
      contattoCognome: ct.cognome,
      soggetto,
      dichiarante: { ...data.dichiarante, email: data.dichiarante.email.trim() },
      consensi: data.consensi,
      firmaDataUrl: data.firmaDataUrl,
      data_firma: data.data_firma,
      secondi_permanenza: data.secondi_permanenza,
      origine: "di_persona",
      note: "Consenso raccolto di persona al punto vendita",
      operatoreId: userId,
      invalidaToken: true,
    });
  });


