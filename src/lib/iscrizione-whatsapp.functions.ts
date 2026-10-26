import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  INFORMATIVA_FULL,
  INFORMATIVA_VERSIONE,
  calcolaInformativaHash,
} from "@/lib/consensi-testi";

/**
 * Registra un consenso WhatsApp raccolto dalla pagina pubblica (link o QR).
 * Chiama la RPC registra_consenso_whatsapp, che normalizza il numero, tenta il
 * match univoco su clienti/lead e scrive la prova in consensi_log (fonte unica),
 * oppure lascia l'iscritto in iscritti_whatsapp se non anagrafato.
 */
export const iscriviWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      numero: z.string().trim().min(6, "Numero non valido").max(40),
      nome: z.string().trim().min(1, "Nome obbligatorio").max(100),
      cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100),
      azienda: z.string().trim().max(150).optional(),
      email: z.string().trim().toLowerCase().min(1, "Email obbligatoria").email("Email non valida").max(150),
      consenso: z.literal(true, {
        errorMap: () => ({ message: "Devi dare il consenso per iscriverti" }),
      }),
      consenso_marketing: z.boolean().default(false),
      consenso_profilazione: z.boolean().default(false),
      origine: z.enum(["link", "qr_pagina"]).default("link"),
      secondi_permanenza: z.number().int().min(0).max(86400).nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    // Prova GDPR: IP + user-agent dagli header della richiesta
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const req = getRequest();
      userAgent = req?.headers.get("user-agent") ?? null;
      ip =
        req?.headers.get("cf-connecting-ip") ??
        req?.headers.get("x-real-ip") ??
        req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
    } catch {
      /* header non disponibili: prova comunque */
    }

    const informativaHash = await calcolaInformativaHash(INFORMATIVA_FULL);

    const { data: res, error } = await supabaseAdmin.rpc(
      "registra_consenso_whatsapp",
      {
        _numero_raw: data.numero,
        _nome: data.nome,
        _cognome: data.cognome,
        _azienda: data.azienda || undefined,
        _consenso_marketing: data.consenso_marketing,
        _consenso_profilazione: data.consenso_profilazione,
        _email:
          data.email && data.email.trim() !== "" ? data.email.trim() : undefined,
        _origine: data.origine,
        _ip: ip ?? undefined,
        _user_agent: userAgent ?? undefined,
        _informativa_versione: INFORMATIVA_VERSIONE,
        _informativa_hash: informativaHash,
        _secondi_permanenza: data.secondi_permanenza ?? undefined,
      }
    );
    if (error) throw new Error(error.message);

    const out = res as { ok: boolean; errore?: string; esito?: string; numero?: string };
    if (!out?.ok) {
      throw new Error(
        out?.errore === "numero_non_valido"
          ? "Il numero inserito non sembra un cellulare italiano valido."
          : "Non è stato possibile registrare l'iscrizione. Riprova."
      );
    }
    // Prova documentale: PDF telematico + prova_path + email (se presente). Mai fatale.
    try {
      const { data: isc } = out.numero
        ? await supabaseAdmin
            .from("iscritti_whatsapp")
            .select("id, contatto_id, email")
            .eq("numero_norm", out.numero)
            .neq("stato", "ignorato")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };

      if (isc) {
        const contattoId = isc.contatto_id ?? null;
        const emailDich = ((data.email ?? "").trim() || (isc.email ?? "").trim());
        const now = new Date();
        const { generaPdfPrivacyIscritto } = await import("./privacy-iscritto-whatsapp.server");
        const { pdfBytes, ragioneSociale } = await generaPdfPrivacyIscritto({
          iscrittoId: isc.id,
          ip,
          dataOraRaccolta: now,
        });

        const pdfPath = contattoId
          ? `contatti/${contattoId}/privacy-qr-${now.getTime()}.pdf`
          : `iscritti/${isc.id}/privacy-qr-${now.getTime()}.pdf`;
        const { error: ePdf } = await supabaseAdmin.storage
          .from("documenti-privacy")
          .upload(pdfPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
        if (ePdf) throw new Error(ePdf.message);

        const { error: eLog } = await supabaseAdmin
          .from("consensi_log")
          .update({ prova_path: pdfPath })
          .eq("iscritto_id", isc.id)
          .is("prova_path", null);
        if (eLog) console.error("[iscrizione-whatsapp] update prova_path fallito:", eLog.message);

        if (contattoId) {
          const { data: pdfSigned, error: eSigned } = await supabaseAdmin.storage
            .from("documenti-privacy")
            .createSignedUrl(pdfPath, 60 * 60 * 24 * 365 * 10);
          if (eSigned) throw new Error(eSigned.message);

          // FM37: non sostituire un documento privacy già presente o firmato.
          const { data: contEsistente, error: eCont } = await supabaseAdmin
            .from("contatti")
            .select("pdf_privacy_path, privacy_firmata")
            .eq("id", contattoId)
            .maybeSingle();
          if (eCont) console.error("[iscrizione-whatsapp] lettura contatto fallita:", eCont.message);
          const giaPresente =
            !!eCont || !!contEsistente?.pdf_privacy_path || contEsistente?.privacy_firmata === true;
          if (giaPresente) {
            console.log(`[iscrizione-whatsapp] contatto ${contattoId}: documento privacy esistente preservato`);
          } else {
            const { error: eUpd } = await supabaseAdmin
              .from("contatti")
              .update({ pdf_privacy_url: pdfSigned.signedUrl, pdf_privacy_path: pdfPath })
              .eq("id", contattoId);
            if (eUpd) console.error("[iscrizione-whatsapp] update contatto PDF fallito:", eUpd.message);
          }
        }

        if (emailDich) {
          try {
            let binary = "";
            for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i]);
            const { buildPrivacyPdfEmailPayload } = await import("./email-template");
            const payload = buildPrivacyPdfEmailPayload({
              toName: [data.nome, data.cognome].filter(Boolean).join(" ").trim() || "Cliente",
              ragioneSociale,
              dataFirma: now.toISOString(),
              pdfBase64: btoa(binary),
            });
            const { sendEmailViaEdge } = await import("./inngest/send-email.server");
            const esito = await sendEmailViaEdge({ to: emailDich, ...payload });
            if (!esito.ok) console.error("[iscrizione-whatsapp] invio email QR fallito:", esito.err);
          } catch (e) {
            console.error("[iscrizione-whatsapp] invio email QR fallito:", e);
          }
        }
      }
    } catch (e) {
      console.error("[iscrizione-whatsapp] generazione PDF/mail QR fallita", e);
    }

    // Notifica in app (push dal trigger esistente) ai destinatari configurati. Mai fatale.
    try {
      if (out.numero) {
        const { data: iscr } = await supabaseAdmin
          .from("iscritti_whatsapp")
          .select("id, cliente_id, lead_id, stato, numero_norm")
          .eq("numero_norm", out.numero)
          .neq("stato", "ignorato")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: conf } = await supabaseAdmin
          .from("configurazioni")
          .select("valore")
          .eq("chiave", "notifica_iscrizioni_whatsapp_destinatari")
          .maybeSingle();
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const ids = Array.from(
          new Set(
            (conf?.valore ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter((s) => uuidRe.test(s))
          )
        );
        let destinatari: string[] = [];
        if (ids.length > 0) {
          const { data: prof } = await supabaseAdmin
            .from("profili")
            .select("id")
            .in("id", ids)
            .eq("attivo", true);
          destinatari = (prof ?? []).map((p) => p.id);
        }

        if (iscr && destinatari.length > 0) {
          // Decisione del motore di riconciliazione (mai fatale: in errore si usa il testo base).
          type Decisione = {
            ok?: boolean;
            motivi?: string[];
            regola?: string | null;
            avviso?: string | null;
            motivo?: string;
          };
          let decisione: Decisione | null = null;
          let esitoCls: string | null = null;
          let nCandidati = 0;
          try {
            const { data: cls, error: eCls } = await supabaseAdmin.rpc(
              "classifica_iscritto_whatsapp",
              { _id: iscr.id },
            );
            if (eCls) throw eCls;
            const c = cls as {
              esito?: string;
              decisione?: Decisione;
              candidati_clienti?: unknown[];
              candidati_lead?: unknown[];
            } | null;
            decisione = c?.decisione ?? null;
            esitoCls = c?.esito ?? null;
            nCandidati = (c?.candidati_clienti?.length ?? 0) + (c?.candidati_lead?.length ?? 0);
          } catch (e) {
            console.error("[iscrizione-whatsapp] classifica per notifica:", e);
          }
          const motiviTxt =
            decisione?.ok && Array.isArray(decisione.motivi) && decisione.motivi.length > 0
              ? ` · Motivo: ${decisione.motivi.join(", ")}`
              : "";
          const azienda = (data.azienda ?? "").trim();
          const avvisoImpresa =
            decisione?.avviso === "impresa_dichiarata_diversa" && azienda.length > 0;

          let collegamento = "Da controllare: nessuna corrispondenza trovata";
          if (iscr.cliente_id) {
            const { data: cl } = await supabaseAdmin
              .from("clienti")
              .select("ragione_sociale, codice_gestionale")
              .eq("id", iscr.cliente_id)
              .maybeSingle();
            collegamento = `Collegato al cliente ${cl?.ragione_sociale ?? "?"} (${cl?.codice_gestionale ?? "?"})${motiviTxt}`;
          } else if (iscr.lead_id) {
            const { data: ld } = await supabaseAdmin
              .from("lead")
              .select("ragione_sociale, nome, cognome")
              .eq("id", iscr.lead_id)
              .maybeSingle();
            const nominativo =
              ld?.ragione_sociale?.trim() ||
              [ld?.nome, ld?.cognome].filter(Boolean).join(" ").trim() ||
              "?";
            collegamento = `Collegato al lead ${nominativo}${motiviTxt}`;
          } else if (esitoCls === "ambiguo" && nCandidati > 0) {
            const motivoTxt =
              decisione?.motivo === "piu_imprese_omonime" ? "più imprese omonime" : "più candidati";
            collegamento = `Da controllare: ${nCandidati} possibili corrispondenze (${motivoTxt})`;
          }
          const collegato = !!(iscr.cliente_id || iscr.lead_id);
          const messaggio =
            collegamento +
            (collegato && avvisoImpresa
              ? ` · ⚠ Impresa dichiarata diversa: ${azienda}`
              : azienda
                ? ` · Impresa dichiarata: ${azienda}`
                : " · Nessuna impresa dichiarata") +
            ` · Email: ${data.consenso_marketing ? "sì" : "no"}`;
          const numeroNorm = iscr.numero_norm ?? out.numero;
          const righe = destinatari.map((user_id) => ({
            user_id,
            tipo: "iscrizione_whatsapp",
            titolo: `Nuova iscrizione WhatsApp: ${data.nome} ${data.cognome}`,
            messaggio,
            link: `/marketing/iscritti-whatsapp?q=${encodeURIComponent(numeroNorm)}`,
            metadata: {
              iscritto_id: iscr.id,
              cliente_id: iscr.cliente_id,
              lead_id: iscr.lead_id,
              stato: iscr.stato,
              origine: data.origine,
              regola: decisione?.regola ?? null,
              avviso: decisione?.avviso ?? null,
            },
          }));
          const { error: eNot } = await supabaseAdmin.from("notifiche").insert(righe);
          if (eNot) console.error("[iscrizione-whatsapp] notifica:", eNot.message);
        }
      }
    } catch (e) {
      console.error("[iscrizione-whatsapp] notifica", e);
    }

    return { ok: true };
  });
