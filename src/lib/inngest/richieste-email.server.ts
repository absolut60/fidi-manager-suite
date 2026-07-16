// Job Inngest: invio email notifiche Richieste interne.
// Trigger: evento "richieste/notifica" inviato da notifyRichiestaEvento.
// Fonte unica di logica di risoluzione destinatari, rendering e invio:
// non duplicare nella server function (che ora è un semplice dispatcher).
//
// Pattern:
// - step.run per ogni fase principale (retry Inngest).
// - withTimeout su ogni chiamata async (evita step "Running" per sempre).
// - un invio per destinatario; se TUTTI falliscono, lancia throw così Inngest ritenta.
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";
import { buildRichiestaEmail } from "@/lib/richieste-email-render";
import { SEDE_FALLBACK, type DatiSede } from "@/lib/template-email-render";

// Timeout helper locale (stesso pattern di functions.server.ts):
// supabase-js non espone AbortSignal; questo sblocca lo step Inngest.
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([Promise.resolve(p), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

const T_MS = 15_000;

type EventName =
  | "new_request"
  | "resp_approved"
  | "resp_forwarded"
  | "resp_rejected"
  | "dir_approved"
  | "dir_rejected"
  | "sollecito"
  | "info_request"
  | "messaggio_interno";

type NotificaPayload = {
  event: EventName;
  richiestaId: string;
  actor: { id?: string | null; nome?: string; email?: string | null };
  extra?: {
    by?: string | null;
    dest?: string | null;
    nota?: string | null;
    testo?: string | null;
  };
};

export const inviaEmailRichiesta = inngest.createFunction(
  {
    id: "richieste-invia-email",
    name: "Richieste interne: invio email notifica",
    retries: 3,
  },
  { event: "richieste/notifica" },
  async ({ event, step, logger }) => {
    const data = event.data as NotificaPayload;

    // 1) Carica richiesta
    const req = await step.run("load-richiesta", async () => {
      const { data: r, error } = await withTimeout(
        supabaseAdmin
          .from("richieste_interne")
          .select(
            "id, title, type, description, amount, fornitore, requester_id, requester_name, sede_id, sede_name, resp_approver_name, dir_approver_name, resp_note, dir_note",
          )
          .eq("id", data.richiestaId)
          .maybeSingle(),
        T_MS,
        "load richiesta",
      );
      if (error) throw new Error(error.message);
      if (!r) throw new Error(`Richiesta ${data.richiestaId} non trovata`);
      return r;
    });

    // 2) Sede (fallback amministrativa)
    const sedeDati = await step.run("load-sede", async (): Promise<DatiSede> => {
      if (!req.sede_id) return SEDE_FALLBACK;
      const { data: s } = await withTimeout(
        supabaseAdmin
          .from("stores")
          .select("nome, insegna, indirizzo, cap, citta, provincia, telefono")
          .eq("id", req.sede_id)
          .maybeSingle(),
        T_MS,
        "load sede",
      );
      if (!s) return SEDE_FALLBACK;
      return {
        nome: s.nome ?? null,
        insegna: s.insegna ?? null,
        indirizzo: s.indirizzo ?? null,
        cap: s.cap ?? null,
        citta: s.citta ?? null,
        provincia: s.provincia ?? null,
        telefono: s.telefono ?? null,
      };
    });

    // 3) Risoluzione destinatari
    const destinatari = await step.run("resolve-destinatari", async () => {
      async function emailsFromRole(role: string): Promise<string[]> {
        const { data: rows, error: eR } = await withTimeout(
          supabaseAdmin.from("user_roles").select("user_id").eq("role", role as never),
          T_MS,
          `user_roles ${role}`,
        );
        if (eR) {
          logger.error(`[emailsFromRole:${role}] errore user_roles: ${eR.message}`);
          return [];
        }
        const ids = Array.from(
          new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)),
        );
        if (ids.length === 0) return [];
        const { data: profs, error: eP } = await withTimeout(
          supabaseAdmin
            .from("profili")
            .select("id, email, attivo")
            .in("id", ids)
            .eq("attivo", true),
          T_MS,
          `profili by role ${role}`,
        );
        if (eP) {
          logger.error(`[emailsFromRole:${role}] errore profili: ${eP.message}`);
          return [];
        }
        return (profs ?? [])
          .map((p) => (typeof p.email === "string" ? p.email : null))
          .filter((e): e is string => !!e && e.includes("@"));
      }

      async function requesterEmail(): Promise<string | null> {
        if (!req.requester_id) return null;
        const { data: p } = await withTimeout(
          supabaseAdmin
            .from("profili")
            .select("email, attivo")
            .eq("id", req.requester_id)
            .maybeSingle(),
          T_MS,
          "requester email",
        );
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
            push([await requesterEmail()]);
            push(await emailsFromRole("approvatore_richieste_liv1"));
            push(await emailsFromRole("approvatore_richieste_liv2"));
            push(await emailsFromRole("gestore_richieste"));
            push(await emailsFromRole("esecutore_richieste"));
          }
          break;
        }
      }

      const totalePrima = to.size;
      let mittenteEscluso = false;
      if (data.actor.email && to.has(data.actor.email.toLowerCase())) {
        to.delete(data.actor.email.toLowerCase());
        mittenteEscluso = true;
      }
      return {
        list: Array.from(to),
        totalePrima,
        mittenteEscluso,
      };
    });

    if (destinatari.list.length === 0) {
      const motivo =
        destinatari.totalePrima === 0
          ? `Nessun utente attivo con ruolo per evento '${data.event}' (dest=${data.extra?.dest ?? "-"})`
          : `Unico destinatario era il mittente (${data.actor.email})`;
      logger.warn(`[richieste-invia-email][${data.event}] skip: ${motivo}`);
      return { ok: true, sent: 0, skipped: true, motivo };
    }

    // 4) Rendering (una volta sola)
    const rendered = await step.run("render-email", () => {
      const appUrl =
        process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";
      const mittenteNome = data.actor.nome?.trim() || "FidiManager MADE";
      const { oggetto, html } = buildRichiestaEmail({
        event: data.event,
        richiesta: {
          id: req.id,
          title: req.title,
          type: req.type,
          description: req.description,
          amount: req.amount,
          fornitore: req.fornitore,
          requester_name: req.requester_name,
          sede_name: req.sede_name,
          resp_approver_name: req.resp_approver_name,
          dir_approver_name: req.dir_approver_name,
          resp_note: req.resp_note,
          dir_note: req.dir_note,
        },
        sede: sedeDati,
        mittente: { nome: mittenteNome, email: data.actor.email ?? null },
        extra: data.extra,
        appUrl,
        useCid: true,
      });
      return { oggetto, html, mittenteNome };
    });

    // 5) Invio (uno per destinatario, un unico step per raggruppare i risultati)
    const esito = await step.run("send-all", async () => {
      let sent = 0;
      const errors: string[] = [];
      for (const dest of destinatari.list) {
        try {
          const res = await withTimeout(
            sendEmailViaEdge({
              to: dest,
              subject: rendered.oggetto,
              html: rendered.html,
              inlineLogo: true,
              fromName: rendered.mittenteNome,
              replyTo: data.actor.email ?? undefined,
            }),
            30_000,
            `send ${dest}`,
          );
          if (res.ok) sent++;
          else errors.push(`${dest}: ${res.err ?? "?"}`);
        } catch (e) {
          errors.push(`${dest}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { sent, errors };
    });

    if (esito.errors.length) {
      logger.error(
        `[richieste-invia-email][${data.event}] ${esito.errors.length}/${destinatari.list.length} falliti: ${esito.errors.slice(0, 5).join(" | ")}`,
      );
    }

    // Se TUTTI falliti, throw per far ritentare l'intero job.
    if (esito.sent === 0 && destinatari.list.length > 0) {
      throw new Error(
        `Tutti i ${destinatari.list.length} invii falliti: ${esito.errors.slice(0, 3).join(" | ")}`,
      );
    }

    return {
      ok: true,
      event: data.event,
      richiestaId: data.richiestaId,
      destinatari: destinatari.list.length,
      sent: esito.sent,
      falliti: esito.errors.length,
    };
  },
);
