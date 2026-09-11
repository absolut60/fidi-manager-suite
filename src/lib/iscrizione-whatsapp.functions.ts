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
      email: z.string().trim().toLowerCase().email("Email non valida").max(150).optional().or(z.literal("")),
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

    const out = res as { ok: boolean; errore?: string; esito?: string };
    if (!out?.ok) {
      throw new Error(
        out?.errore === "numero_non_valido"
          ? "Il numero inserito non sembra un cellulare italiano valido."
          : "Non è stato possibile registrare l'iscrizione. Riprova."
      );
    }
    return { ok: true };
  });
