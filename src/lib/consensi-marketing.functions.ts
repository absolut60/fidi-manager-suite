import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generaPdfConsensiMarketing } from "./consensi-pdf";
import { risolviIntestazioneSoggetto } from "./intestazione-soggetto.server";
import { estraiIp, estraiUserAgent } from "./request-ip.server";
import { buildPrivacyPdfEmailPayload } from "./email-template";
import { INFORMATIVA_FULL, INFORMATIVA_VERSIONE, calcolaInformativaHash } from "./consensi-testi";





/**
 * Genera un token dedicato per il link di raccolta consensi marketing.
 * A differenza del token privacy-base (monouso), questo può essere rigenerato
 * anche se il contatto ha già firmato la privacy o già espresso consensi in passato.
 */
export const generaTokenConsensiMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contattoId: string; giorniValidita?: number }) =>
    z.object({
      contattoId: z.string().uuid(),
      giorniValidita: z.number().int().min(1).max(365).default(30),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ct, error } = await supabase
      .from("contatti").select("id").eq("id", data.contattoId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Contatto non trovato o non accessibile");

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + data.giorniValidita * 86400 * 1000).toISOString();

    const { error: eUpd } = await supabaseAdmin
      .from("contatti")
      .update({ consensi_token: token, consensi_token_expires_at: expires })
      .eq("id", data.contattoId);
    if (eUpd) throw new Error(eUpd.message);

    return { token, expires_at: expires };
  });

/**
 * Recupera dati contatto + cliente + stato attuale dei consensi per la pagina
 * pubblica di raccolta consensi marketing. NON rifiuta se privacy_firmata=true:
 * il consenso marketing può essere aggiornato nel tempo.
 */
export const getContattoPerConsensi = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select("id, cliente_id, lead_id, nome, cognome, email, firma_nome_dichiarato, consenso_profilazione, consenso_marketing_media, consenso_marketing_diretto, consensi_token_expires_at")
      .eq("consensi_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido o già utilizzato");
    if (ct.consensi_token_expires_at && new Date(ct.consensi_token_expires_at) < new Date()) {
      throw new Error("Link scaduto. Chiedi al punto vendita di generarne uno nuovo.");
    }

    const soggetto = await risolviIntestazioneSoggetto(ct);

    return {
      contatto: {
        id: ct.id,
        nome: ct.nome,
        cognome: ct.cognome,
        email: ct.email,
        firma_nome_dichiarato: ct.firma_nome_dichiarato,
      },
      cliente: {
        ragione_sociale: soggetto.ragione_sociale,
        partita_iva: soggetto.partita_iva,
        codice_fiscale: soggetto.codice_fiscale,
        indirizzo: soggetto.indirizzo,
        citta: soggetto.citta,
      },
      statoAttuale: {
        profilazione: !!ct.consenso_profilazione,
        marketing_media: !!ct.consenso_marketing_media,
        marketing_diretto: !!ct.consenso_marketing_diretto,
      },
    };
  });

const salvaSchema = z.object({
  token: z.string().uuid(),
  firmaDataUrl: z.string().startsWith("data:image/png;base64,").max(2_000_000),
  firmaNomeDichiarato: z.string().trim().min(2).max(200),
  consensi: z.object({
    marketing_diretto: z.boolean(),
    marketing_media: z.boolean(),
    profilazione: z.boolean(),
  }),
});


/**
 * Salva i tre consensi marketing raccolti via link pubblico.
 * Genera un PDF di prova, lo carica su documenti-privacy, e chiama
 * la funzione SQL registra_consenso una volta per ogni tipo di consenso.
 * Il token viene consumato dopo il salvataggio (senza toccare la privacy-base).
 */
export const salvaConsensiMarketing = createServerFn({ method: "POST" })
  .inputValidator((d: z.infer<typeof salvaSchema>) => salvaSchema.parse(d))
  .handler(async ({ data }) => {
    const ip = estraiIp();

    const { data: ct, error } = await supabaseAdmin
      .from("contatti")
      .select("id, cliente_id, lead_id, nome, cognome, email, consensi_token_expires_at")
      .eq("consensi_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ct) throw new Error("Link non valido o già utilizzato");
    if (ct.consensi_token_expires_at && new Date(ct.consensi_token_expires_at) < new Date()) {
      throw new Error("Link scaduto");
    }

    const soggetto = await risolviIntestazioneSoggetto(ct);

    const now = new Date();

    // 1) Genera PDF di prova
    const pdfBytes = await generaPdfConsensiMarketing({
      ragioneSociale: soggetto.ragione_sociale,
      partitaIva: soggetto.partita_iva,
      codiceFiscale: soggetto.codice_fiscale,
      indirizzo: soggetto.indirizzo,
      citta: soggetto.citta,
      firmatarioNome: data.firmaNomeDichiarato,
      firmatarioEmail: ct.email,
      consensi: data.consensi,
      firmaPngDataUrl: data.firmaDataUrl,
      dataFirma: now,
      ipAddress: ip,
    });
    const pdfPath = `contatti/${ct.id}/consensi-${now.getTime()}.pdf`;
    const { error: ePdf } = await supabaseAdmin.storage
      .from("documenti-privacy")
      .upload(pdfPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
    if (ePdf) throw new Error(ePdf.message);

    // 2) Salva il nome dichiarato dal firmatario sul contatto
    await supabaseAdmin
      .from("contatti")
      .update({ firma_nome_dichiarato: data.firmaNomeDichiarato })
      .eq("id", ct.id);

    // 3) Registra i tre consensi in un'unica transazione atomica
    //    (aggiorna anche i flag di stato attuale sul contatto)
    const ua = estraiUserAgent();
    const hashInformativa = await calcolaInformativaHash(INFORMATIVA_FULL);
    const { error: eReg } = await supabaseAdmin.rpc("registra_consensi_batch", {
      _contatto_id: ct.id,
      _marketing_diretto: data.consensi.marketing_diretto,
      _marketing_media: data.consensi.marketing_media,
      _profilazione: data.consensi.profilazione,
      _origine: "link_pubblico",
      _prova_path: pdfPath,
      ...(ip ? { _ip: ip } : {}),
      _informativa_versione: INFORMATIVA_VERSIONE,
      _informativa_hash: hashInformativa,
      ...(ua ? { _user_agent: ua } : {}),
      _note: `Firmato via link pubblico da "${data.firmaNomeDichiarato}"`,
    });

    if (eReg) {
      // Rollback: nessun PDF orfano su storage se la registrazione fallisce
      await supabaseAdmin.storage.from("documenti-privacy").remove([pdfPath]);
      throw new Error(`registra_consensi_batch: ${eReg.message}`);
    }

    // 4) Consuma il token consensi (senza toccare la privacy-base)
    await supabaseAdmin
      .from("contatti")
      .update({ consensi_token: null, consensi_token_expires_at: null })
      .eq("id", ct.id);

    // 5) Invio mail informativa con il PDF di prova — non fatale
    let emailInviata = false;
    if (ct.email) {
      try {
        let binary = "";
        for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
        const payload = buildPrivacyPdfEmailPayload({
          toName: data.firmaNomeDichiarato,
          ragioneSociale: soggetto.ragione_sociale,
          dataFirma: now.toISOString(),
          pdfBase64: btoa(binary),
        });
        const { sendEmailViaEdge } = await import("./inngest/send-email.server");
        const esito = await sendEmailViaEdge({ to: ct.email, ...payload });
        emailInviata = esito.ok;
        if (!esito.ok) console.error("[consensi-marketing] invio email fallito:", esito.err);
      } catch (e) {
        console.error("[consensi-marketing] invio email fallito:", e);
      }
    }

    return { ok: true, emailInviata };
  });
