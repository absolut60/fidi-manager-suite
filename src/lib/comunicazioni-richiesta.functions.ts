import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildNotificaComunicazioneEmail,
  RUOLI_DESTINATARI_COMUNICAZIONE_FIDO,
} from "@/lib/comunicazioni-richiesta-email";

const FINESTRA_INVIO_MS = 10 * 60 * 1000;

/**
 * FM41 fetta 1: notifica email "nuovo messaggio sulla richiesta fido" inviata
 * dal server (ramo x-internal-secret). Solo l'autore del messaggio, entro 10
 * minuti; destinatari validati, testo sempre letto dal DB.
 */
export const inviaEmailComunicazioneRichiesta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      comunicazioneId: z.string().uuid(),
      destinatariIds: z.array(z.string().uuid()).max(200),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendEmailViaEdge } = await import("@/lib/inngest/send-email.server");

    // a) comunicazione
    const { data: com, error: comErr } = await supabaseAdmin
      .from("comunicazioni_richiesta")
      .select("id, richiesta_id, autore_id, testo, created_at")
      .eq("id", data.comunicazioneId)
      .maybeSingle();
    if (comErr) throw new Error(comErr.message);
    if (!com) throw new Error("Comunicazione non trovata");

    // b) solo l'autore
    if (com.autore_id !== context.userId) throw new Error("Non autorizzato");

    // c) finestra temporale
    if (Date.now() - new Date(com.created_at).getTime() > FINESTRA_INVIO_MS) {
      return { ok: true, inviate: 0, saltate: 0, motivo: "scaduta" as const };
    }

    // d) richiesta
    const { data: richiesta, error: rErr } = await supabaseAdmin
      .from("richieste_fido")
      .select("id, created_by")
      .eq("id", com.richiesta_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);

    // e) validazione destinatari
    const richiesti = Array.from(new Set(data.destinatariIds));
    const ammessi = new Set<string>();
    if (richiesta?.created_by) ammessi.add(richiesta.created_by);
    if (richiesti.length > 0) {
      const { data: ruoli, error: ruErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", richiesti)
        .in("role", [...RUOLI_DESTINATARI_COMUNICAZIONE_FIDO]);
      if (ruErr) throw new Error(ruErr.message);
      for (const r of ruoli ?? []) ammessi.add(r.user_id);
    }
    ammessi.delete(com.autore_id);
    const validi = richiesti.filter((id) => ammessi.has(id));
    let saltate = richiesti.length - validi.length;
    if (validi.length === 0) return { ok: true, inviate: 0, saltate };

    // f) profili
    const [{ data: autore }, { data: profs, error: pErr }] = await Promise.all([
      supabaseAdmin.from("profili").select("nome, cognome, email").eq("id", com.autore_id).maybeSingle(),
      supabaseAdmin.from("profili").select("id, nome, cognome, email").in("id", validi),
    ]);
    if (pErr) throw new Error(pErr.message);
    const autoreNome = [autore?.nome, autore?.cognome].filter(Boolean).join(" ") || "Un utente";
    const autoreEmail = autore?.email ?? null;

    // g) testo dal DB, appUrl server
    const appUrl = process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";

    // h) invio
    let inviate = 0;
    const trovati = new Set((profs ?? []).map((p) => p.id));
    saltate += validi.filter((id) => !trovati.has(id)).length;
    for (const p of profs ?? []) {
      if (!p.email || p.email === autoreEmail) {
        saltate++;
        continue;
      }
      try {
        const esito = await sendEmailViaEdge({
          to: p.email,
          ...buildNotificaComunicazioneEmail({
            toName: [p.nome, p.cognome].filter(Boolean).join(" ") || "Utente",
            autoreNome,
            richiestaId: com.richiesta_id,
            testo: com.testo,
            appUrl,
          }),
        });
        if (esito.ok) inviate++;
        else console.error("Errore email comunicazione:", p.id, esito.err);
      } catch (e) {
        console.error("Errore email comunicazione:", p.id, e);
      }
    }

    // i)
    return { ok: true, inviate, saltate };
  });
