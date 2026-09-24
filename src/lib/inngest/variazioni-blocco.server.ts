// Job Inngest: rilevazione variazioni blocco clienti a fine import
// "blocco_fido_assicurazione" + avvisi (mail + notifica in app) agli store manager
// del negozio del cliente, raggruppati per negozio.
// Pattern: step.run per fase, withTimeout su ogni chiamata, un step per negozio
// (un retry non rimanda i negozi già riusciti).
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";
import { buildVariazioniBloccoEmail } from "@/lib/variazioni-blocco-email-render";

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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Pendente = {
  id: string;
  store_id: string | null;
  codice_gestionale: string | null;
  ragione_sociale: string | null;
  tipo: string;
  negozio: string | null;
};

async function marcaNotificate(ids: string[]): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await withTimeout(
      supabaseAdmin
        .from("clienti_blocco_variazioni")
        .update({ notificato_at: new Date().toISOString() } as never)
        .in("id", ids.slice(i, i + BATCH)),
      T_MS,
      "marca notificate",
    );
    if (error) throw new Error(`marca notificate: ${error.message}`);
  }
}

function messaggioConteggi(n: number, m: number): string {
  const parti: string[] = [];
  if (n > 0) parti.push(`${n} ${n === 1 ? "bloccato" : "bloccati"}`);
  if (m > 0) parti.push(`${m} ${m === 1 ? "sbloccato" : "sbloccati"}`);
  return parti.join(", ");
}

export const notificaVariazioniBlocco = inngest.createFunction(
  {
    id: "clienti-variazioni-blocco-notifica",
    name: "Clienti: variazioni blocco → avvisi store manager",
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ event: "clienti/blocco.variazioni.rileva" }],
  },
  async ({ event, step, logger }) => {
    const importazioneId = ((event.data as { importazioneId?: string | null })?.importazioneId ??
      null) as string | null;

    const rilevate = await step.run("rileva", async () => {
      const { data, error } = await withTimeout(
        supabaseAdmin.rpc("rileva_variazioni_blocco" as never, {
          _importazione_id: importazioneId,
        } as never),
        T_MS * 4,
        "rpc rileva_variazioni_blocco",
      );
      if (error) throw new Error(`rileva_variazioni_blocco: ${error.message}`);
      const n = Number(data ?? 0);
      logger.info(`Variazioni blocco rilevate (nuove): ${n}`);
      return n;
    });

    const pendenti = await step.run("carica-pendenti", async (): Promise<Pendente[]> => {
      const out: Pendente[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await withTimeout(
          supabaseAdmin
            .from("clienti_blocco_variazioni")
            .select("id, store_id, codice_gestionale, ragione_sociale, tipo, stores(nome)")
            .is("notificato_at", null)
            .order("id")
            .range(from, from + PAGE - 1),
          T_MS,
          "carica pendenti",
        );
        if (error) throw new Error(`carica pendenti: ${error.message}`);
        const rows = (data ?? []) as unknown as Array<{
          id: string;
          store_id: string | null;
          codice_gestionale: string | null;
          ragione_sociale: string | null;
          tipo: string;
          stores: { nome: string | null } | null;
        }>;
        for (const r of rows) {
          out.push({
            id: r.id,
            store_id: r.store_id,
            codice_gestionale: r.codice_gestionale,
            ragione_sociale: r.ragione_sociale,
            tipo: r.tipo,
            negozio: r.stores?.nome ?? null,
          });
        }
        if (rows.length < PAGE) break;
      }
      const senzaNegozio = out.filter((r) => !r.store_id).map((r) => r.id);
      if (senzaNegozio.length) {
        await marcaNotificate(senzaNegozio);
        logger.info(`Variazioni senza negozio marcate senza avviso: ${senzaNegozio.length}`);
      }
      return out.filter((r) => !!r.store_id);
    });

    const emailTest = await step.run("config-test", async () => {
      const { data } = await withTimeout(
        supabaseAdmin
          .from("configurazioni")
          .select("valore")
          .eq("chiave", "variazioni_blocco_email_test")
          .maybeSingle(),
        T_MS,
        "config test",
      );
      const v = (data?.valore ?? "").trim();
      return v || null;
    });
    const isTest = !!emailTest;

    const perNegozio = new Map<string, Pendente[]>();
    for (const p of pendenti) {
      const arr = perNegozio.get(p.store_id!) ?? [];
      arr.push(p);
      perNegozio.set(p.store_id!, arr);
    }

    const appUrl = process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";
    let negoziAvvisati = 0;
    let mailInviate = 0;
    let mailFallite = 0;
    let notificheInserite = 0;

    for (const [storeId, righe] of perNegozio) {
      const esito = await step.run(`negozio-${storeId}`, async () => {
        const negozioNome = righe[0]?.negozio ?? "sede";
        const ids = righe.map((r) => r.id);

        // a) destinatari reali: store manager del negozio, attivi, email valida
        const { data: ruoli, error: eR } = await withTimeout(
          supabaseAdmin.from("user_roles").select("user_id").eq("role", "store_manager" as never),
          T_MS,
          "user_roles store_manager",
        );
        if (eR) throw new Error(`user_roles: ${eR.message}`);
        const smIds = Array.from(new Set((ruoli ?? []).map((r) => r.user_id).filter(Boolean)));
        let reali: Array<{ user_id: string; email: string }> = [];
        if (smIds.length) {
          const { data: prof, error: eP } = await withTimeout(
            supabaseAdmin
              .from("profili")
              .select("id, email, store_id, attivo")
              .in("id", smIds)
              .eq("store_id", storeId)
              .eq("attivo", true),
            T_MS,
            "profili store manager",
          );
          if (eP) throw new Error(`profili: ${eP.message}`);
          reali = ((prof ?? []) as Array<{ id: string; email: string | null }>)
            .map((p) => ({ user_id: p.id, email: (p.email ?? "").trim() }))
            .filter((p) => EMAIL_RE.test(p.email));
        }

        // b) destinatari effettivi (test o produzione)
        let emails: string[];
        let userIds: string[];
        if (emailTest) {
          emails = [emailTest];
          const { data: pt } = await withTimeout(
            supabaseAdmin.from("profili").select("id").ilike("email", emailTest),
            T_MS,
            "profilo test",
          );
          userIds = ((pt ?? []) as Array<{ id: string }>).map((p) => p.id);
        } else {
          emails = Array.from(new Set(reali.map((r) => r.email)));
          userIds = Array.from(new Set(reali.map((r) => r.user_id)));
        }

        // c) nessun destinatario
        if (!emails.length && !userIds.length) {
          logger.warn(`Negozio ${negozioNome} (${storeId}): nessun destinatario, ${ids.length} variazioni marcate`);
          await marcaNotificate(ids);
          return { avvisato: false, inviate: 0, fallite: 0, notifiche: 0 };
        }

        const bloccati = righe
          .filter((r) => r.tipo === "bloccato")
          .map((r) => ({ codice: r.codice_gestionale, ragione_sociale: r.ragione_sociale }));
        const sbloccati = righe
          .filter((r) => r.tipo === "sbloccato")
          .map((r) => ({ codice: r.codice_gestionale, ragione_sociale: r.ragione_sociale }));

        // d) render
        const { oggetto, html } = buildVariazioniBloccoEmail({
          negozioNome,
          bloccati,
          sbloccati,
          appUrl,
          dataRilevazione: new Date(),
          testInfo: emailTest ? { emailReali: reali.map((r) => r.email) } : null,
        });

        // e) invio, uno per destinatario
        let inviate = 0;
        let fallite = 0;
        for (const to of emails) {
          try {
            const r = await withTimeout(
              sendEmailViaEdge({ to, subject: oggetto, html, inlineLogo: true, fromName: "MADE Distribuzione" }),
              T_MS * 2,
              `send ${to}`,
            );
            if (r.ok) inviate++;
            else {
              fallite++;
              logger.error(`Mail a ${to} fallita: ${r.err ?? "errore"}`);
            }
          } catch (e) {
            fallite++;
            logger.error(`Mail a ${to} fallita: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // f) notifiche in app (la push parte dal trigger esistente)
        let notifiche = 0;
        if (userIds.length) {
          const titolo = `${isTest ? "[TEST] " : ""}Variazioni blocco clienti — ${negozioNome}`;
          const messaggio = messaggioConteggi(bloccati.length, sbloccati.length);
          const { error: eN } = await withTimeout(
            supabaseAdmin.from("notifiche").insert(
              userIds.map((uid) => ({
                user_id: uid,
                tipo: "variazioni_blocco_clienti",
                titolo,
                messaggio,
                link: "/clienti-variazioni-blocco",
                metadata: {
                  store_id: storeId,
                  importazione_id: importazioneId,
                  bloccati: bloccati.length,
                  sbloccati: sbloccati.length,
                  test: isTest,
                },
              })),
            ),
            T_MS,
            "insert notifiche",
          );
          if (eN) logger.error(`Notifiche negozio ${negozioNome}: ${eN.message}`);
          else notifiche = userIds.length;
        }

        // g) marca o ritenta
        if (inviate > 0 || notifiche > 0) {
          await marcaNotificate(ids);
          return { avvisato: true, inviate, fallite, notifiche };
        }
        throw new Error(`Negozio ${negozioNome}: tutte le mail fallite e nessuna notifica inserita`);
      });
      if (esito.avvisato) negoziAvvisati++;
      mailInviate += esito.inviate;
      mailFallite += esito.fallite;
      notificheInserite += esito.notifiche;
    }

    return {
      variazioniRilevate: rilevate,
      negoziAvvisati,
      mailInviate,
      mailFallite,
      notifiche: notificheInserite,
      test: isTest,
    };
  },
);
