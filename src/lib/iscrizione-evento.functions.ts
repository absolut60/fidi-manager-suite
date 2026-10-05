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
  numero_non_valido: "Il numero di cellulare non sembra valido.",
};

/** Registra l'iscrizione pubblica: nessun lead/contatto/consenso creato qui. */
export const iscriviEventoPubblico = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        codice: codiceSchema,
        nome: z.string().trim().min(1, "Nome obbligatorio").max(100),
        cognome: z.string().trim().min(1, "Cognome obbligatorio").max(100),
        cellulare: z.string().trim().min(6, "Numero non valido").max(40),
        azienda: z.string().trim().max(150).optional(),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email("Email non valida")
          .max(150)
          .optional()
          .or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.rpc("registra_iscrizione_evento_pubblica", {
      _codice: data.codice,
      _nome: data.nome,
      _cognome: data.cognome,
      _cellulare: data.cellulare,
      _azienda: data.azienda || undefined,
      _email: data.email || undefined,
    });
    if (error) {
      console.error("[iscrizione-evento] errore RPC", error.message);
      throw new Error("Non è stato possibile registrare l'iscrizione. Riprova.");
    }
    const r = (rows ?? [])[0];
    if (r?.ok) return { ok: true as const, giaPresente: r.gia_presente === true };
    throw new Error(
      MESSAGGI[r?.motivo ?? ""] ?? "Non è stato possibile registrare l'iscrizione. Riprova.",
    );
  });
