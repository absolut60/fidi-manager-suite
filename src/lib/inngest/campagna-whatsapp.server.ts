import { inngest, sendInngestEvent } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { inviaTemplate360 } from "./whatsapp-invio.server";

type EventData = { campagna_id: string };

const DEFAULT_BLOCCO = 12;
const DEFAULT_PAUSA = 60;
const MAX_PER_RUN = 150;

async function getConfigInt(chiave: string, fallback: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();
  const v = parseFloat(String(data?.valore ?? ""));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** Indici delle variabili {{n}} presenti nel body, ordinati crescenti. */
function indiciVariabili(body: string): number[] {
  const set = new Set<number>();
  for (const m of String(body ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = parseInt(m[1] ?? "", 10);
    if (Number.isFinite(n)) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

export const invioCampagnaWhatsapp = inngest.createFunction(
  {
    id: "invio-campagna-whatsapp",
    name: "Invio campagna WhatsApp",
    retries: 2,
    timeouts: { finish: "30m" },
    triggers: [{ event: "campagna-whatsapp/invio.requested" }],
    onFailure: async ({ event: failedEvent }) => {
      const id = (failedEvent.data as { campagna_id?: string } | undefined)?.campagna_id;
      if (!id) return;
      await supabaseAdmin
        .from("campagne_whatsapp")
        .update({ stato: "completata", inviata_at: new Date().toISOString() } as never)
        .eq("id", id);
    },
  },
  async ({ event, step, logger }) => {
    const { campagna_id } = event.data as EventData;

    const prep = await step.run("prepara", async () => {
      const { data: camp, error } = await supabaseAdmin
        .from("campagne_whatsapp")
        .select("id, nome, stato, template_id, template_name, parametri")
        .eq("id", campagna_id)
        .maybeSingle();
      if (error || !camp) throw new Error(`Campagna non trovata: ${error?.message ?? campagna_id}`);
      if (camp.stato === "completata") {
        return {
          giaCompletata: true,
          metaTemplateName: "",
          lingua: "it",
          indici: [] as number[],
          fissi: {} as Record<string, string>,
        };
      }

      const templateId = (camp as { template_id?: string | null }).template_id ?? null;
      if (!templateId) throw new Error("Template non approvato o mancante");

      const { data: tpl } = await supabaseAdmin
        .from("whatsapp_template")
        .select("meta_template_name, lingua, body_testo, stato")
        .eq("id", templateId)
        .maybeSingle();
      if (!tpl || tpl.stato !== "approvato") throw new Error("Template non approvato o mancante");

      await supabaseAdmin
        .from("campagne_whatsapp")
        .update({ stato: "in_corso" } as never)
        .eq("id", campagna_id);

      const parametri = (camp as { parametri?: { fissi?: Record<string, string> } | null }).parametri;

      return {
        giaCompletata: false,
        metaTemplateName:
          (tpl.meta_template_name as string | null) ??
          ((camp as { template_name?: string | null }).template_name ?? ""),
        lingua: (tpl.lingua as string | null) || "it",
        indici: indiciVariabili(tpl.body_testo as string),
        fissi: (parametri?.fissi ?? {}) as Record<string, string>,
      };
    });

    if (prep.giaCompletata) {
      logger.info(`[campagna-whatsapp] campagna ${campagna_id} già completata`);
      return { ok: true, gia_completata: true };
    }

    const cfg = await step.run("config", async (): Promise<{ blocco: number; pausa: number }> => ({
      blocco: await getConfigInt("campagna_whatsapp_blocco", DEFAULT_BLOCCO),
      pausa: await getConfigInt("campagna_whatsapp_pausa_sec", DEFAULT_PAUSA),
    }));

    const idsRes = await step.run("collect-pending-ids", async () => {
      const { data } = await supabaseAdmin
        .from("messaggi_whatsapp")
        .select("id")
        .eq("campagna_id", campagna_id)
        .eq("stato", "in_coda")
        .order("created_at", { ascending: true });
      return { ids: (data ?? []).map((r: { id: string }) => r.id) };
    });

    const pendingIds = idsRes.ids;
    const total = pendingIds.length;
    logger.info(
      `[campagna-whatsapp] ${total} destinatari, blocchi da ${cfg.blocco}, pausa ${cfg.pausa}s`,
    );

    if (total === 0) {
      await step.run("finalize-vuoto", async () => {
        await supabaseAdmin
          .from("campagne_whatsapp")
          .update({ stato: "completata", inviata_at: new Date().toISOString() } as never)
          .eq("id", campagna_id);
      });
      return { ok: true, inviati: 0 };
    }

    const idsQuestaRun = pendingIds.slice(0, MAX_PER_RUN);
    const numBlocchi = Math.ceil(idsQuestaRun.length / cfg.blocco);
    let annullataInCorso = false;

    for (let b = 0; b < numBlocchi; b++) {
      const guard = await step.run(`guard-${b}`, async () => {
        const { data: c } = await supabaseAdmin
          .from("campagne_whatsapp")
          .select("stato")
          .eq("id", campagna_id)
          .maybeSingle();
        return { stop: c?.stato === "completata" || c?.stato === "annullata" };
      });
      if (guard.stop) {
        logger.info(`[campagna-whatsapp] interrotta al blocco ${b}, esco`);
        annullataInCorso = true;
        break;
      }

      const slice = idsQuestaRun.slice(b * cfg.blocco, (b + 1) * cfg.blocco);

      const blockResult = await step.run(`blocco-${b}`, async () => {
        let inviati = 0;
        let falliti = 0;

        const { data: righe } = await supabaseAdmin
          .from("messaggi_whatsapp")
          .select("id, numero_dest, nome_riferimento, cliente_id, stato")
          .in("id", slice);

        for (const r of righe ?? []) {
          if (r.stato !== "in_coda") continue;
          try {
            let nomeDest = (r.nome_riferimento as string | null)?.trim() || "";
            if (!nomeDest && r.cliente_id) {
              const { data: cli } = await supabaseAdmin
                .from("clienti")
                .select("ragione_sociale")
                .eq("id", r.cliente_id)
                .maybeSingle();
              nomeDest = (cli?.ragione_sociale as string | null)?.trim() || "";
            }
            if (!nomeDest) nomeDest = "Cliente";

            const parametriBody = prep.indici.map((n) =>
              n === 1 ? nomeDest : (prep.fissi[String(n)] ?? ""),
            );

            const res = await inviaTemplate360({
              numeroDest: r.numero_dest as string,
              templateName: prep.metaTemplateName,
              lingua: prep.lingua,
              parametriBody,
            });

            if (!res.ok) {
              await supabaseAdmin
                .from("messaggi_whatsapp")
                .update({
                  stato: "fallito",
                  errore: (res.err ?? "errore invio").slice(0, 500),
                } as never)
                .eq("id", r.id);
              falliti += 1;
              continue;
            }

            await supabaseAdmin
              .from("messaggi_whatsapp")
              .update({
                stato: "inviato",
                inviato_at: new Date().toISOString(),
                meta_message_id: res.messageId ?? null,
                errore: null,
              } as never)
              .eq("id", r.id);
            inviati += 1;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await supabaseAdmin
              .from("messaggi_whatsapp")
              .update({ stato: "fallito", errore: msg.slice(0, 500) } as never)
              .eq("id", r.id);
            falliti += 1;
          }
        }

        const { data: campNow } = await supabaseAdmin
          .from("campagne_whatsapp")
          .select("invii_ok, invii_falliti, totale_invii")
          .eq("id", campagna_id)
          .maybeSingle();
        await supabaseAdmin
          .from("campagne_whatsapp")
          .update({
            invii_ok: Number((campNow as { invii_ok?: number | null } | null)?.invii_ok ?? 0) + inviati,
            invii_falliti:
              Number((campNow as { invii_falliti?: number | null } | null)?.invii_falliti ?? 0) +
              falliti,
            totale_invii:
              Number((campNow as { totale_invii?: number | null } | null)?.totale_invii ?? 0) +
              inviati +
              falliti,
          } as never)
          .eq("id", campagna_id);

        return { inviati, falliti };
      });

      logger.info(`[campagna-whatsapp] blocco ${b + 1}/${numBlocchi}`, blockResult);

      if (b < numBlocchi - 1 && cfg.pausa > 0) {
        await step.sleep(`pausa-${b}`, `${cfg.pausa}s`);
      }
    }

    if (annullataInCorso) return { ok: true, interrotta: true };

    if (total > idsQuestaRun.length) {
      logger.info(
        `[campagna-whatsapp] re-emit per ${campagna_id}, rimanenti ${total - idsQuestaRun.length}`,
      );
      await step.run("continua-campagna", async () => {
        await sendInngestEvent("campagna-whatsapp/invio.requested", { campagna_id });
      });
      return { ok: true, continua: true, rimanenti: total - idsQuestaRun.length };
    }

    await step.run("finalize", async () => {
      const { data: camp } = await supabaseAdmin
        .from("campagne_whatsapp")
        .select("stato")
        .eq("id", campagna_id)
        .maybeSingle();
      if (!camp) return;
      await supabaseAdmin
        .from("campagne_whatsapp")
        .update({ stato: "completata", inviata_at: new Date().toISOString() } as never)
        .eq("id", campagna_id);
    });

    return { ok: true };
  },
);
