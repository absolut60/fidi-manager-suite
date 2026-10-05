import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const codiceSchema = z
  .string()
  .trim()
  .min(6)
  .max(40)
  .regex(/^[a-z0-9]+$/, "Codice non valido");

/** Dati pubblici dell'evento per la pagina di iscrizione (QR/link). */
export const getEventoIscrizionePubblica = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ codice: codiceSchema }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.rpc("get_evento_iscrizione_pubblica", {
      _codice: data.codice,
    });
    if (error) throw new Error("Non è stato possibile caricare l'evento. Riprova.");
    const r = (rows ?? [])[0];
    if (!r) return { trovato: false as const };
    return {
      trovato: true as const,
      nome: r.nome as string,
      data_evento: (r.data_evento ?? null) as string | null,
      luogo: (r.luogo ?? null) as string | null,
      aperte: r.aperte === true,
    };
  });

const MESSAGGI: Record<string, string> = {
  evento_non_trovato: "Evento non trovato.",
  iscrizioni_chiuse: "Le iscrizioni a questo evento sono chiuse.",
  dati_mancanti: "Inserisci nome e cognome.",
  email_non_valida: "Inserisci un indirizzo email valido.",
  numero_non_valido: "Il numero di cellulare non sembra valido.",
};

/**
 * Registra l'iscrizione pubblica: la RPC crea lead provvisorio + contatto +
 * partecipante; poi la privacy viene finalizzata sul contatto con lo stesso
 * percorso degli iscritti sul posto (finalizzaRaccoltaPrivacy). La
 * finalizzazione non è mai fatale per l'iscrizione. A privacy finalizzata
 * parte la riconciliazione automatica (riconcilia_partecipante, modo
 * automatico): anch'essa mai fatale, esito solo nei log (la pagina pubblica
 * non deve sapere se la persona è già cliente).
 */
export const iscriviEventoPubblico = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        codice: codiceSchema,
        nome: z.string().trim().min(1, "Nome obbligatorio").max(100),
        cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100),
        cellulare: z.string().trim().min(6, "Numero non valido").max(40),
        email: z.string().trim().toLowerCase().email("Email non valida").max(150),
        azienda: z.string().trim().max(150).optional(),
        consenso_whatsapp: z.boolean().default(false),
        consenso_marketing: z.boolean().default(false),
        consenso_profilazione: z.boolean().default(false),
        consenso_media: z.boolean().default(false),
        secondi_permanenza: z.number().int().min(0).max(86400).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { nome, cognome, cellulare, email, azienda } = data;
    const { data: rows, error } = await supabaseAdmin.rpc("registra_iscrizione_evento_pubblica", {
      _codice: data.codice,
      _nome: nome,
      _cognome: cognome,
      _cellulare: cellulare,
      _email: email,
      _azienda: azienda || undefined,
    });
    if (error) {
      console.error("[iscrizione-evento] errore RPC", error.message);
      throw new Error("Non è stato possibile registrare l'iscrizione. Riprova.");
    }
    const r = (rows ?? [])[0];
    if (!r?.ok) {
      throw new Error(
        MESSAGGI[r?.motivo ?? ""] ?? "Non è stato possibile registrare l'iscrizione. Riprova.",
      );
    }
    if (r.gia_presente === true) {
      return { ok: true as const, giaPresente: true, privacyArchiviata: false, emailInviata: false };
    }

    let privacyArchiviata = false;
    let emailInviata = false;
    if (r.contatto_id) {
      try {
        const { finalizzaRaccoltaPrivacy } = await import("./firma-privacy-finalizza.server");
        const esito = await finalizzaRaccoltaPrivacy({
          contattoId: r.contatto_id,
          contattoNome: nome,
          contattoCognome: cognome,
          soggetto: { ragione_sociale: azienda || `${nome} ${cognome}` },
          dichiarante: { nome, cognome, societa: azienda || undefined, email, cellulare },
          consensi: {
            profilazione: data.consenso_profilazione,
            marketing_media: data.consenso_media,
            marketing_diretto: data.consenso_marketing,
          },
          consensoWhatsapp: data.consenso_whatsapp,
          secondi_permanenza: data.secondi_permanenza,
          origine: "link_pubblico",
          note: `Iscrizione online all'evento: ${r.nome_evento ?? ""}`,
          invalidaToken: false,
        });
        privacyArchiviata = true;
        emailInviata = esito.emailInviata;
      } catch (e) {
        console.error("[iscrizione-evento] privacy non finalizzata", e);
      }
      try {
        const { data: part, error: pErr } = await supabaseAdmin
          .from("eventi_partecipanti")
          .select("id")
          .eq("contatto_id", r.contatto_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pErr) throw pErr;
        if (part?.id) {
          const { data: esito, error: rErr } = await supabaseAdmin.rpc("riconcilia_partecipante", {
            _partecipante_id: part.id,
          });
          if (rErr) throw rErr;
          console.log("[iscrizione-evento] riconciliazione automatica", esito);
        }
      } catch (e) {
        console.error("[iscrizione-evento] riconciliazione automatica non riuscita", e);
      }
    }
    return { ok: true as const, giaPresente: false, privacyArchiviata, emailInviata };
  });
