// Job Inngest a orari fissi: variazioni blocco/legale e alert fidi in un unico
// avviso per negozio (email + notifica) e una sola notifica per agente.
// Pattern: step.run per fase, withTimeout su ogni chiamata, un step per negozio
// (un retry non rimanda i negozi già riusciti).
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";
import { buildVariazioniBloccoEmail } from "@/lib/variazioni-blocco-email-render";
import { type AlertEmail } from "@/lib/alert-fidi-email";
import { messaggioConteggi, raggruppaAvvisiPerNegozio } from "@/lib/avvisi-clienti";
import { etichetteRigaProposta } from "@/lib/proposta-fido-riga";
import { segnalazioniCorrenti } from "@/lib/fido-segnalazioni";

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
  cliente_id: string | null;
  store_id: string | null;
  codice_gestionale: string | null;
  ragione_sociale: string | null;
  tipo: string;
  negozio: string | null;
  importazione_id: string | null;
};

/**
 * Agenti attivi per cliente. GEMELLO TS di public.utenti_agente_cliente(uuid)
 * (migrazione 0044, FM45): profilo attivo, ruolo 'agente',
 * profili.codice_agente = clienti.codice_agente (cliente senza codice → nessuno).
 * Query equivalente in blocco per non fare una RPC per ogni cliente.
 * Se cambia la funzione SQL, cambia anche questa.
 */
async function agentiPerCliente(clienteIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!clienteIds.length) return out;
  const codicePerCliente = new Map<string, string>();
  const BATCH = 500;
  for (let i = 0; i < clienteIds.length; i += BATCH) {
    const { data, error } = await withTimeout(
      supabaseAdmin.from("clienti").select("id, codice_agente").in("id", clienteIds.slice(i, i + BATCH)),
      T_MS,
      "clienti codice_agente",
    );
    if (error) throw new Error(`clienti codice_agente: ${error.message}`);
    for (const c of (data ?? []) as Array<{ id: string; codice_agente: string | null }>) {
      if (c.codice_agente) codicePerCliente.set(c.id, c.codice_agente);
    }
  }
  const codici = Array.from(new Set(codicePerCliente.values()));
  if (!codici.length) return out;
  const { data: prof, error: eP } = await withTimeout(
    supabaseAdmin.from("profili").select("id, codice_agente").in("codice_agente", codici).eq("attivo", true),
    T_MS,
    "profili agenti",
  );
  if (eP) throw new Error(`profili agenti: ${eP.message}`);
  const profili = (prof ?? []) as Array<{ id: string; codice_agente: string | null }>;
  if (!profili.length) return out;
  const { data: ruoli, error: eR } = await withTimeout(
    supabaseAdmin.from("user_roles").select("user_id").eq("role", "agente" as never).in("user_id", profili.map((p) => p.id)),
    T_MS,
    "user_roles agente",
  );
  if (eR) throw new Error(`user_roles agente: ${eR.message}`);
  const agentiIds = new Set((ruoli ?? []).map((r) => r.user_id as string));
  const agentiPerCodice = new Map<string, string[]>();
  for (const p of profili) {
    if (!p.codice_agente || !agentiIds.has(p.id)) continue;
    const arr = agentiPerCodice.get(p.codice_agente) ?? [];
    if (!arr.includes(p.id)) arr.push(p.id);
    agentiPerCodice.set(p.codice_agente, arr);
  }
  for (const [cid, codice] of codicePerCliente) {
    const a = agentiPerCodice.get(codice);
    if (a?.length) out.set(cid, a);
  }
  return out;
}

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

export const notificaVariazioniBlocco = inngest.createFunction(
  {
    id: "clienti-variazioni-blocco-notifica",
    name: "Clienti: aggiornamento a orari fissi",
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [
      { cron: "TZ=Europe/Rome 0 10 * * *" },
      { cron: "TZ=Europe/Rome 30 14 * * *" },
      { cron: "TZ=Europe/Rome 0 18 * * *" },
    ],
  },
  async ({ step, logger }) => {
    const importazioneId: string | null = null;
    // Step memorizzato: i retry dei negozi non rieseguono la marcatura e non perdono gli ID.
    const alertIds = await step.run("marca-alert-fidi", async (): Promise<string[]> => {
      const { data: prima, error: eP } = await withTimeout(
        supabaseAdmin.from("alert_fidi").select("notificato_il").not("notificato_il", "is", null)
          .order("notificato_il", { ascending: false }).limit(1).maybeSingle(),
        T_MS,
        "ultimo avviso alert fidi",
      );
      if (eP) throw new Error(`ultimo avviso alert fidi: ${eP.message}`);
      const { data, error } = await withTimeout(
        supabaseAdmin.rpc("invia_notifiche_alert_fidi" as never),
        T_MS * 4,
        "marcatura alert fidi",
      );
      if (error) throw new Error(`marcatura alert fidi: ${error.message}`);
      if (Number(data ?? 0) === 0) return [];
      const soglia = (prima as { notificato_il?: string } | null)?.notificato_il;
      const out: string[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let q = supabaseAdmin.from("alert_fidi").select("id").not("notificato_il", "is", null);
        if (soglia) q = q.gt("notificato_il", soglia);
        const { data: nuovi, error: eN } = await withTimeout(
          q.order("id").range(from, from + PAGE - 1),
          T_MS,
          "alert fidi appena marcati",
        );
        if (eN) throw new Error(`alert fidi appena marcati: ${eN.message}`);
        out.push(...(nuovi ?? []).map((r) => (r as { id: string }).id));
        if ((nuovi ?? []).length < PAGE) break;
      }
      logger.info(`Alert fidi marcati per questo giro: ${out.length}`);
      return out;
    });

    const alertFidi = await step.run("carica-alert-fidi", async (): Promise<AlertEmail[]> => {
      if (!alertIds.length) return [];
      const out: AlertEmail[] = [];
      for (let i = 0; i < alertIds.length; i += 200) {
        const { data, error } = await withTimeout(
          supabaseAdmin
            .from("alert_fidi")
            .select("id, tipo, consumo, esposizione, ordini_aperti, fido_gamma, fido_proposto, cliente_id, clienti(codice_gestionale, ragione_sociale, store_id, stores(nome))")
            .in("id", alertIds.slice(i, i + 200)),
          T_MS,
          "carica alert fidi",
        );
        if (error) throw new Error(`carica alert fidi: ${error.message}`);
        const rows = (data ?? []) as unknown as Array<{
          id: string; tipo: string; consumo: number | null; esposizione: number | null; ordini_aperti: number | null;
          fido_gamma: number | null; fido_proposto: number | null; cliente_id: string;
          clienti: { codice_gestionale: string | null; ragione_sociale: string | null; store_id: string | null; stores: { nome: string | null } | null } | null;
        }>;
        const { data: teo, error: eT } = await withTimeout(
          supabaseAdmin
            .from("fido_teorico_cliente")
            .select("cliente_id, regola_applicata, segnalazioni, fido_proposto, fido_attuale")
            .in("cliente_id", rows.map((r) => r.cliente_id)),
          T_MS,
          "fido teorico alert",
        );
        if (eT) throw new Error(`fido teorico alert: ${eT.message}`);
        const teoMap = new Map(((teo ?? []) as Array<Record<string, unknown>>).map((t) => [t.cliente_id as string, t]));
        for (const r of rows) {
          const t = teoMap.get(r.cliente_id);
          const motivi = t
            ? etichetteRigaProposta({
                regola: String(t.regola_applicata ?? ""),
                segnalazioni: segnalazioniCorrenti(t as { segnalazioni?: unknown; fido_proposto?: number | null; fido_attuale?: number | null }),
              }).map((e) => e.testo)
            : [];
          out.push({
            id: r.id, tipo: r.tipo, consumo: r.consumo, esposizione: r.esposizione, ordini_aperti: r.ordini_aperti,
            fido_gamma: r.fido_gamma, fido_proposto: r.fido_proposto,
            store_id: r.clienti?.store_id ?? null, negozio: r.clienti?.stores?.nome ?? null,
            codice: r.clienti?.codice_gestionale ?? null, ragione_sociale: r.clienti?.ragione_sociale ?? null,
            motivi,
          });
        }
      }
      return out;
    });
    const alertNegozio = alertPerNegozio(alertFidi);

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
            .select("id, cliente_id, store_id, codice_gestionale, ragione_sociale, tipo, stores(nome)")
            .is("notificato_at", null)
            .order("id")
            .range(from, from + PAGE - 1),
          T_MS,
          "carica pendenti",
        );
        if (error) throw new Error(`carica pendenti: ${error.message}`);
        const rows = (data ?? []) as unknown as Array<{
          id: string;
          cliente_id: string | null;
          store_id: string | null;
          codice_gestionale: string | null;
          ragione_sociale: string | null;
          tipo: string;
          stores: { nome: string | null } | null;
        }>;
        for (const r of rows) {
          out.push({
            id: r.id,
            cliente_id: r.cliente_id,
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

    // FM45: notifica in app anche agli agenti dei clienti variati (una per agente,
    // solo i propri clienti, stesso tipo/testo/link dello store manager; mai l'autore
    // dell'import). In modalità test nessuna notifica agli agenti reali.
    // Va prima del ciclo negozi: le righe sono già in memoria e la marcatura resta ai negozi.
    const notificheAgenti = await step.run("agenti", async () => {
      if (isTest || !pendenti.length) return 0;
      let autoreId: string | null = null;
      if (importazioneId) {
        const { data: imp } = await withTimeout(
          supabaseAdmin.from("importazioni").select("eseguita_da").eq("id", importazioneId).maybeSingle(),
          T_MS,
          "autore import",
        );
        autoreId = ((imp as { eseguita_da?: string | null } | null)?.eseguita_da ?? null) as string | null;
      }
      const clienteIds = Array.from(new Set(pendenti.map((p) => p.cliente_id).filter((x): x is string => !!x)));
      const mappa = await agentiPerCliente(clienteIds);
      const perAgente = new Map<string, Pendente[]>();
      for (const p of pendenti) {
        if (!p.cliente_id) continue;
        for (const a of mappa.get(p.cliente_id) ?? []) {
          if (a === autoreId) continue;
          const arr = perAgente.get(a) ?? [];
          arr.push(p);
          perAgente.set(a, arr);
        }
      }
      if (!perAgente.size) return 0;
      const righe = Array.from(perAgente, ([uid, lista]) => {
        const negozi = Array.from(new Set(lista.map((r) => r.negozio ?? "sede")));
        const nB = lista.filter((r) => r.tipo === "bloccato").length;
        const nS = lista.filter((r) => r.tipo === "sbloccato").length;
        const nL = lista.filter((r) => r.tipo === "in_legale").length;
        const nU = lista.filter((r) => r.tipo === "uscito_legale").length;
        return {
          user_id: uid,
          tipo: "variazioni_blocco_clienti",
          titolo: `Variazioni blocco e legale clienti — ${negozi.join(", ")}`,
          messaggio: messaggioConteggi(nB, nS, nL, nU),
          link: "/clienti-variazioni-blocco",
          metadata: {
            store_id: negozi.length === 1 ? lista[0].store_id : null,
            importazione_id: importazioneId,
            bloccati: nB,
            sbloccati: nS,
            in_legale: nL,
            usciti_legale: nU,
            test: false,
            destinatario: "agente",
          },
        };
      });
      const { error } = await withTimeout(
        supabaseAdmin.from("notifiche").insert(righe),
        T_MS,
        "insert notifiche agenti",
      );
      if (error) {
        logger.error(`Notifiche agenti: ${error.message}`);
        return 0;
      }
      logger.info(`Notifiche variazioni blocco agli agenti: ${righe.length}`);
      return righe.length;
    });

    const appUrl = process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";
    let negoziAvvisati = 0;
    let mailInviate = 0;
    let mailFallite = 0;
    let notificheInserite = 0;

    for (const sid of alertNegozio.keys()) if (!perNegozio.has(sid)) perNegozio.set(sid, []);

    for (const [storeId, righe] of perNegozio) {
      const esito = await step.run(`negozio-${storeId}`, async () => {
        const alertDelNegozio = alertNegozio.get(storeId) ?? [];
        const negozioNome = righe[0]?.negozio ?? alertDelNegozio[0]?.negozio ?? "sede";
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
          if (ids.length) await marcaNotificate(ids);
          return { avvisato: false, inviate: 0, fallite: 0, notifiche: 0 };
        }

        const bloccati = righe
          .filter((r) => r.tipo === "bloccato")
          .map((r) => ({ codice: r.codice_gestionale, ragione_sociale: r.ragione_sociale }));
        const sbloccati = righe
          .filter((r) => r.tipo === "sbloccato")
          .map((r) => ({ codice: r.codice_gestionale, ragione_sociale: r.ragione_sociale }));
        const inLegale = righe
          .filter((r) => r.tipo === "in_legale")
          .map((r) => ({ codice: r.codice_gestionale, ragione_sociale: r.ragione_sociale }));
        const uscitiLegale = righe
          .filter((r) => r.tipo === "uscito_legale")
          .map((r) => ({ codice: r.codice_gestionale, ragione_sociale: r.ragione_sociale }));

        // d) render
        const { oggetto, html } = buildVariazioniBloccoEmail({
          negozioNome,
          bloccati,
          sbloccati,
          inLegale,
          uscitiLegale,
          appUrl,
          dataRilevazione: new Date(),
          testInfo: emailTest ? { emailReali: reali.map((r) => r.email) } : null,
          alertFidi: alertDelNegozio,
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
        // Gli alert fidi hanno già la loro notifica in app (invia_notifiche_alert_fidi).
        if (userIds.length && ids.length) {
          const titolo = `${isTest ? "[TEST] " : ""}Variazioni blocco e legale clienti — ${negozioNome}`;
          const messaggio = messaggioConteggi(bloccati.length, sbloccati.length, inLegale.length, uscitiLegale.length);
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
                  in_legale: inLegale.length,
                  usciti_legale: uscitiLegale.length,
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
          if (ids.length) await marcaNotificate(ids);
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
      notificheAgenti,
      test: isTest,
    };
  },
);
