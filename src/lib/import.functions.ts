import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendInngestEvent } from "./inngest/client";
import { assertImportazioneEsiste, assertPuoImportareGamma } from "@/lib/import-permessi.server";

const FonteEnum = z.enum([
  "anagrafica",
  "analisi_rischio",
  "scadenziario",
  "scadenziario_assicurazioni",
  "blocco_fido_assicurazione",
  "articoli_listini_gamma",
]);

/**
 * Avvia un import in background tramite Inngest.
 * Il file deve essere già stato caricato sullo storage e una riga in
 * `importazioni` deve essere già stata creata (stato in_elaborazione).
 */
/** Import unico listini Gamma: fogli e pacchetti già caricati dal browser in _staging/<id>/. */
const ManifestListiniSchema = z.object({
  fogli: z
    .array(
      z.object({
        chiave: z.string().regex(/^[a-z_]{1,40}$/),
        foglio: z.string().max(200),
        righe: z.number().int().min(0),
        righeLette: z.number().int().min(0),
        anomalie: z.number().int().min(0),
        lotti: z.number().int().min(0).max(1000),
        lotto: z.number().int().min(1).max(5000),
        errore: z.string().max(1000).optional(),
      }),
    )
    .max(50),
  nonGestiti: z.array(z.string().max(200)).max(200),
});

/** Fonti con un solo import alla volta e relativo messaggio. */
const MESSAGGIO_IMPORT_IN_CORSO: Partial<Record<z.infer<typeof FonteEnum>, string>> = {
  scadenziario: "C'è già un import scadenziario in corso: attendi che finisca",
  articoli_listini_gamma: "C'è già un import articoli/listini in corso: attendi che finisca",
};

/**
 * Blocca se un'altra importazione della stessa fonte è in_elaborazione da meno di 3 ore
 * (quelle più vecchie non bloccano): chiude la riga appena creata come "fallita" e lancia.
 */
async function bloccaSeImportInCorso(
  supabase: { from: (t: "importazioni") => any },
  fonte: string,
  importazioneId: string,
  messaggio: string,
) {
  const soglia = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: inCorso, error } = await supabase
    .from("importazioni")
    .select("id")
    .eq("fonte", fonte)
    .eq("stato", "in_elaborazione")
    .gte("created_at", soglia)
    .neq("id", importazioneId)
    .limit(1);
  if (error) throw new Error(`Verifica import in corso non riuscita: ${error.message}`);
  if (inCorso && inCorso.length > 0) {
    // Chiude la riga appena creata, così non resta "in elaborazione".
    await supabase
      .from("importazioni")
      .update({
        stato: "fallita",
        completata_at: new Date().toISOString(),
        log_errori: [{ riga: 0, errore: messaggio }],
        problemi: [messaggio],
      })
      .eq("id", importazioneId);
    throw new Error(messaggio);
  }
}

export const triggerImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      fonte: FonteEnum,
      importazioneId: z.string().uuid(),
      filePath: z.string().min(1).max(500),
      listini: ManifestListiniSchema.optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    await assertImportazioneEsiste(context.supabase, data.importazioneId);
    // FM50/FM61: un solo import alla volta per le fonti a fotografia (le chiusure cancellano
    // le righe di altri import).
    const messaggioBlocco = MESSAGGIO_IMPORT_IN_CORSO[data.fonte];
    if (messaggioBlocco) {
      await bloccaSeImportInCorso(context.supabase, data.fonte, data.importazioneId, messaggioBlocco);
    }
    if (data.fonte === "articoli_listini_gamma" && !data.listini) {
      throw new Error("File non preparato: ricarica il file dalla pagina Import/Export");
    }
    await sendInngestEvent(`import/${data.fonte}.requested`, {
      importazioneId: data.importazioneId,
      filePath: data.filePath,
      userId: context.userId,
      ...(data.listini ? { listini: data.listini } : {}),
    });
    return { ok: true };
  });

// Backward-compat: alias per AnagraficaImportCard esistente
export const triggerAnagraficaImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      importazioneId: z.string().uuid(),
      filePath: z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPuoImportareGamma(context.supabase, context.userId, context.claims);
    await assertImportazioneEsiste(context.supabase, data.importazioneId);
    await sendInngestEvent("import/anagrafica.requested", {
      importazioneId: data.importazioneId,
      filePath: data.filePath,
      userId: context.userId,
    });
    return { ok: true };
  });
