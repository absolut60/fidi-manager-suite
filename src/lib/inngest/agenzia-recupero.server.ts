// Job Inngest FM36: clienti che superano i 60 giorni di scaduto →
// promemoria "Passare all'agenzia di recupero" (creato dalla RPC) +
// UNA notifica in app per ogni utente con ruolo recupero_crediti.
// Pattern: step.run per fase, withTimeout su ogni chiamata.
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatEuro } from "@/lib/fidi";

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

type Pendente = {
  id: string;
  cliente_id: string;
  codice_gestionale: string | null;
  ragione_sociale: string | null;
  tot_scaduto: number;
  max_gg: number;
  negozio: string | null;
};

async function marcaNotificati(ids: string[]): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < ids.length; i += BATCH) {
    const { error } = await withTimeout(
      supabaseAdmin
        .from("clienti_scaduto60_ingressi" as never)
        .update({ notificato_at: new Date().toISOString() } as never)
        .in("id", ids.slice(i, i + BATCH)),
      T_MS,
      "marca notificati",
    );
    if (error) throw new Error(`marca notificati: ${(error as { message: string }).message}`);
  }
}

export const rilevaAgenziaRecupero = inngest.createFunction(
  {
    id: "clienti-agenzia-recupero-rileva",
    name: "Clienti: scaduto oltre 60gg → promemoria agenzia",
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ event: "clienti/agenzia-recupero.rileva" }],
  },
  async ({ event, step, logger }) => {
    const importazioneId = ((event.data as { importazioneId?: string | null })?.importazioneId ??
      null) as string | null;

    await step.run("rileva", async () => {
      const { data, error } = await withTimeout(
        supabaseAdmin.rpc("rileva_ingressi_scaduto_60" as never, {
          _importazione_id: importazioneId,
        } as never),
        T_MS * 4,
        "rpc rileva_ingressi_scaduto_60",
      );
      if (error) throw new Error(`rileva_ingressi_scaduto_60: ${error.message}`);
      const n = Number(data ?? 0);
      logger.info(`Nuovi ingressi oltre 60gg: ${n}`);
      return n;
    });

    const pendenti = await step.run("carica-pendenti", async (): Promise<Pendente[]> => {
      const out: Pendente[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await withTimeout(
          supabaseAdmin
            .from("clienti_scaduto60_ingressi" as never)
            .select("id, cliente_id, codice_gestionale, ragione_sociale, tot_scaduto, max_gg, stores(nome)")
            .is("notificato_at", null)
            .order("id")
            .range(from, from + PAGE - 1),
          T_MS,
          "carica pendenti",
        );
        if (error) throw new Error(`carica pendenti: ${(error as { message: string }).message}`);
        const rows = (data ?? []) as unknown as Array<{
          id: string;
          cliente_id: string;
          codice_gestionale: string | null;
          ragione_sociale: string | null;
          tot_scaduto: number | string;
          max_gg: number;
          stores: { nome: string | null } | null;
        }>;
        for (const r of rows) {
          out.push({
            id: r.id,
            cliente_id: r.cliente_id,
            codice_gestionale: r.codice_gestionale,
            ragione_sociale: r.ragione_sociale,
            tot_scaduto: Number(r.tot_scaduto ?? 0),
            max_gg: Number(r.max_gg ?? 0),
            negozio: r.stores?.nome ?? null,
          });
        }
        if (rows.length < PAGE) break;
      }
      return out;
    });

    if (!pendenti.length) {
      logger.info("Nessun ingresso da notificare");
      return { notificati: 0, destinatari: 0 };
    }

    const destinatari = await step.run("destinatari", async (): Promise<string[]> => {
      const { data: ruoli, error: eR } = await withTimeout(
        supabaseAdmin.from("user_roles").select("user_id").eq("role", "recupero_crediti" as never),
        T_MS,
        "user_roles recupero_crediti",
      );
      if (eR) throw new Error(`user_roles: ${eR.message}`);
      const ids = Array.from(new Set((ruoli ?? []).map((r) => r.user_id).filter(Boolean)));
      if (!ids.length) return [];
      const { data: prof, error: eP } = await withTimeout(
        supabaseAdmin.from("profili").select("id").in("id", ids).eq("attivo", true),
        T_MS,
        "profili attivi",
      );
      if (eP) throw new Error(`profili: ${eP.message}`);
      return ((prof ?? []) as Array<{ id: string }>).map((p) => p.id);
    });

    const ids = pendenti.map((p) => p.id);

    if (!destinatari.length) {
      await step.run("marca-senza-destinatari", async () => {
        logger.warn(`Nessun destinatario recupero_crediti: ${ids.length} ingressi marcati senza notifica`);
        await marcaNotificati(ids);
        return true;
      });
      return { notificati: 0, destinatari: 0 };
    }

    await step.run("notifica", async () => {
      const n = pendenti.length;
      const ordinati = [...pendenti].sort((a, b) => b.tot_scaduto - a.tot_scaduto);
      const righe = ordinati
        .slice(0, 5)
        .map(
          (p) =>
            `${p.ragione_sociale ?? p.codice_gestionale ?? "Cliente"}${p.negozio ? ` (${p.negozio})` : ""} — ${formatEuro(p.tot_scaduto)}`,
        );
      if (n > 5) righe.push(`e altri ${n - 5}`);
      const totale = pendenti.reduce((s, p) => s + p.tot_scaduto, 0);
      const titolo = `${n} ${n === 1 ? "cliente" : "clienti"} da passare all'agenzia di recupero`;

      const { error } = await withTimeout(
        supabaseAdmin.from("notifiche").insert(
          destinatari.map((uid) => ({
            user_id: uid,
            tipo: "agenzia_recupero",
            titolo,
            messaggio: righe.join("\n"),
            link: "/recupero-agenzia",
            metadata: { importazione_id: importazioneId, ingressi: ids, totale },
          })),
        ),
        T_MS,
        "insert notifiche",
      );
      if (error) throw new Error(`insert notifiche: ${error.message}`);

      await marcaNotificati(ids);
      logger.info(`Notificati ${n} ingressi a ${destinatari.length} destinatari`);
      return true;
    });

    return { notificati: pendenti.length, destinatari: destinatari.length };
  },
);
