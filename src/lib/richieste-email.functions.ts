// Server function: notifica per email un evento delle Richieste interne.
// Chiamata dai callsite client (submitDecision, nuova-richiesta-dialog,
// chat-messaggi). Non deve MAI bloccare l'azione: gli errori sono loggati
// e il chiamante prosegue.
//
// Autorizzazione: richiede sessione utente (requireSupabaseAuth).
// L'invio email attraversa la edge `send-email` col binario server
// (`x-internal-secret`), tramite sendEmailViaEdge.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENTS = [
  "new_request",
  "resp_approved",
  "resp_forwarded",
  "resp_rejected",
  "dir_approved",
  "dir_rejected",
  "sollecito",
  "info_request",
  "messaggio_interno",
] as const;

const InputSchema = z.object({
  event: z.enum(EVENTS),
  richiestaId: z.string().uuid(),
  actor: z.object({
    id: z.string().uuid().nullable().optional(),
    nome: z.string().max(200).optional().default(""),
    email: z.string().email().nullable().optional(),
  }),
  extra: z
    .object({
      by: z.string().max(200).nullable().optional(),
      dest: z.string().max(50).nullable().optional(),
      nota: z.string().max(4000).nullable().optional(),
      testo: z.string().max(8000).nullable().optional(),
    })
    .optional(),
});

export const notifyRichiestaEvento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof InputSchema>) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; sent: number; err?: string }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendEmailViaEdge } = await import("@/lib/inngest/send-email.server");
      const { buildRichiestaEmail } = await import("@/lib/richieste-email-render");
      const { SEDE_FALLBACK } = await import("@/lib/template-email-render");
      type DatiSede = import("@/lib/template-email-render").DatiSede;


      // 1) Carica richiesta
      const { data: r, error: eR } = await supabaseAdmin
        .from("richieste_interne")
        .select(
          "id, title, type, description, amount, fornitore, requester_id, requester_name, sede_id, sede_name, resp_approver_name, dir_approver_name, resp_note, dir_note",
        )
        .eq("id", data.richiestaId)
        .maybeSingle();
      if (eR) throw new Error(eR.message);
      if (!r) throw new Error("Richiesta non trovata");
      const req = r;



      // 2) Sede della richiesta (fallback amministrativa)
      let sede: DatiSede | null = null;
      if (r.sede_id) {
        const { data: s } = await supabaseAdmin
          .from("stores")
          .select("nome, insegna, indirizzo, cap, citta, provincia, telefono")
          .eq("id", r.sede_id)
          .maybeSingle();
        if (s) {
          sede = {
            nome: s.nome ?? null,
            insegna: s.insegna ?? null,
            indirizzo: s.indirizzo ?? null,
            cap: s.cap ?? null,
            citta: s.citta ?? null,
            provincia: s.provincia ?? null,
            telefono: s.telefono ?? null,
          };
        }
      }
      const sedeDati = sede ?? SEDE_FALLBACK;

      // 3) Risoluzione destinatari
      const actorId = data.actor.id ?? null;

      async function emailsFromRole(role: string): Promise<string[]> {
        const { data: rows } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, profili!inner(email, attivo)")
          .eq("role", role as never);
        return (rows ?? [])
          .filter(
            (x) =>
              // @ts-expect-error - shape from PostgREST
              x.profili?.attivo === true && typeof x.profili?.email === "string",
          )
          .map(
            (x) =>
              // @ts-expect-error - shape from PostgREST
              x.profili.email as string,
          );
      }

      async function requesterEmail(): Promise<string | null> {
        if (!req.requester_id) return null;
        const { data: p } = await supabaseAdmin
          .from("profili")
          .select("email, attivo")
          .eq("id", req.requester_id)
          .maybeSingle();
        if (!p || p.attivo !== true) return null;
        return typeof p.email === "string" ? p.email : null;
      }

      const to = new Set<string>();
      const push = (arr: (string | null | undefined)[]) => {
        for (const x of arr) if (x && x.includes("@")) to.add(x.toLowerCase());
      };

      switch (data.event) {
        case "new_request":
          push(await emailsFromRole("approvatore_richieste_liv1"));
          break;
        case "resp_approved":
        case "resp_rejected":
        case "dir_approved":
        case "dir_rejected":
          push([await requesterEmail()]);
          break;
        case "resp_forwarded":
          push(await emailsFromRole("approvatore_richieste_liv2"));
          push([await requesterEmail()]);
          break;
        case "sollecito":
        case "info_request":
        case "messaggio_interno": {
          const dest = data.extra?.dest ?? "tutti";
          if (dest === "richiedente") push([await requesterEmail()]);
          else if (dest === "resp_generale")
            push(await emailsFromRole("approvatore_richieste_liv1"));
          else if (dest === "direzione")
            push(await emailsFromRole("approvatore_richieste_liv2"));
          else if (dest === "amministrativo") {
            push(await emailsFromRole("gestore_richieste"));
            push(await emailsFromRole("esecutore_richieste"));
          } else {
            // tutti
            push([await requesterEmail()]);
            push(await emailsFromRole("approvatore_richieste_liv1"));
            push(await emailsFromRole("approvatore_richieste_liv2"));
            push(await emailsFromRole("gestore_richieste"));
            push(await emailsFromRole("esecutore_richieste"));
          }
          break;
        }
      }

      // Escludi sempre il mittente
      if (data.actor.email) to.delete(data.actor.email.toLowerCase());

      if (to.size === 0) return { ok: true, sent: 0 };

      // 4) Rendering
      const appUrl =
        process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";
      const mittenteNome = data.actor.nome?.trim() || "FidiManager MADE";
      const { oggetto, html } = buildRichiestaEmail({
        event: data.event,
        richiesta: {
          id: r.id,
          title: r.title,
          type: r.type,
          description: r.description,
          amount: r.amount,
          fornitore: r.fornitore,
          requester_name: r.requester_name,
          sede_name: r.sede_name,
          resp_approver_name: r.resp_approver_name,
          dir_approver_name: r.dir_approver_name,
          resp_note: r.resp_note,
          dir_note: r.dir_note,
        },
        sede: sedeDati,
        mittente: { nome: mittenteNome, email: data.actor.email ?? null },
        extra: data.extra,
        appUrl,
        useCid: true,
      });

      // 5) Invio (uno per destinatario per privacy)
      let sent = 0;
      const errors: string[] = [];
      for (const dest of to) {
        const res = await sendEmailViaEdge({
          to: dest,
          subject: oggetto,
          html,
          inlineLogo: true,
          fromName: mittenteNome,
          replyTo: data.actor.email ?? undefined,
        });
        if (res.ok) sent++;
        else errors.push(`${dest}: ${res.err ?? "?"}`);
      }

      if (errors.length) {
        console.error(
          `[notifyRichiestaEvento][${data.event}] ${errors.length}/${to.size} falliti:`,
          errors.slice(0, 5).join(" | "),
        );
      }
      return {
        ok: sent > 0 || to.size === 0,
        sent,
        err: errors.length ? errors[0] : undefined,
      };
    } catch (e) {
      // Non bloccare mai il chiamante
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[notifyRichiestaEvento] errore:", msg);
      return { ok: false, sent: 0, err: msg };
    }
  });
