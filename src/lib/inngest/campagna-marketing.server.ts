import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isEmailValida } from "@/lib/email-validazione";
import { sendEmailViaEdge } from "./send-email.server";
import { buildEmailCampagna } from "@/lib/campagna-marketing-email";
import { riscriviLinkTracciati } from "@/lib/tracking-clic";
import type { DatiSede } from "@/lib/template-email-render";

type EventData = { campagna_id: string };

const DEFAULT_BLOCCO = 12;
const DEFAULT_PAUSA = 60;
const ALLEGATI_BUCKET = "allegati";

function appUrl(): string {
  return process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";
}

async function getConfigInt(chiave: string, fallback: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();
  const v = parseFloat(String(data?.valore ?? ""));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** Token di tracciamento clic del destinatario (idempotente). */
async function trackingTokenDestinatario(destinatarioId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("campagne_email_destinatari")
    .select("tracking_token")
    .eq("id", destinatarioId)
    .maybeSingle();
  const existing = (data as { tracking_token?: string | null } | null)?.tracking_token;
  if (existing) return existing;
  const token = crypto.randomUUID().replace(/-/g, "");
  const { error } = await supabaseAdmin
    .from("campagne_email_destinatari")
    .update({ tracking_token: token } as never)
    .eq("id", destinatarioId);
  if (error) return null;
  return token;
}

/** Token di recesso idempotente del contatto (riusa quello esistente). */
async function tokenRecessoContatto(contattoId: string | null): Promise<string | null> {
  if (!contattoId) return null;
  const { data } = await supabaseAdmin
    .from("contatti")
    .select("id, recesso_token")
    .eq("id", contattoId)
    .maybeSingle();
  if (!data) return null;
  const existing = (data as { recesso_token?: string | null }).recesso_token;
  if (existing) return existing;
  const token = crypto.randomUUID();
  const { error } = await supabaseAdmin
    .from("contatti")
    .update({ recesso_token: token } as never)
    .eq("id", contattoId);
  if (error) return null;
  return token;
}

export const invioCampagnaMarketing = inngest.createFunction(
  {
    id: "invio-campagna-marketing",
    name: "Invio campagna email marketing",
    retries: 2,
    timeouts: { finish: "30m" },
    triggers: [{ event: "campagna-marketing/invio.requested" }],
    onFailure: async ({ event: failedEvent, error }) => {
      const id = (failedEvent.data as { campagna_id?: string } | undefined)?.campagna_id;
      if (!id) return;
      await supabaseAdmin
        .from("campagne_email_marketing")
        .update({
          stato: "completata_con_errori",
          inviata_at: new Date().toISOString(),
          note: `Job fallito dopo i retry: ${error?.message ?? "errore sconosciuto"}`,
        } as never)
        .eq("id", id);
    },
  },
  async ({ event, step, logger }) => {
    const { campagna_id } = event.data as EventData;

    const prep = await step.run("prepara", async () => {
      const { data: camp, error } = await supabaseAdmin
        .from("campagne_email_marketing")
        .select("id, nome, oggetto, corpo_html, stato, operatore_id")
        .eq("id", campagna_id)
        .maybeSingle();
      if (error || !camp) throw new Error(`Campagna non trovata: ${error?.message ?? campagna_id}`);
      if (camp.stato === "annullata") {
        return { annullata: true, oggetto: "", corpo: "", operatoreId: null as string | null };
      }
      await supabaseAdmin
        .from("campagne_email_marketing")
        .update({ stato: "in_corso" } as never)
        .eq("id", campagna_id);
      return {
        annullata: false,
        oggetto: camp.oggetto as string,
        corpo: camp.corpo_html as string,
        operatoreId: (camp as { operatore_id?: string | null }).operatore_id ?? null,
      };
    });

    if (prep.annullata) {
      logger.info(`[campagna-marketing] campagna ${campagna_id} annullata prima dell'avvio`);
      return { ok: true, annullata: true };
    }

    const cfg = await step.run("config", async (): Promise<{
      blocco: number;
      pausa: number;
      nomeOperatore: string;
      emailOperatore: string | null;
    }> => {
      let nome = "Ufficio Marketing MADE";
      let email: string | null = null;
      if (prep.operatoreId) {
        const { data } = await supabaseAdmin
          .from("profili")
          .select("nome, cognome, email")
          .eq("id", prep.operatoreId)
          .maybeSingle();
        const n = `${data?.nome ?? ""} ${data?.cognome ?? ""}`.trim();
        if (n) nome = n;
        email = data?.email ?? null;
      }
      return {
        blocco: await getConfigInt("campagna_marketing_blocco", DEFAULT_BLOCCO),
        pausa: await getConfigInt("campagna_marketing_pausa_sec", DEFAULT_PAUSA),
        nomeOperatore: nome,
        emailOperatore: email,
      };
    });

    // Allegati della campagna: scaricati una sola volta e riusati per ogni invio.
    const allegati = await step.run("load-allegati", async () => {
      const { data } = await supabaseAdmin
        .from("allegati")
        .select("nome_file, storage_path, mime_type")
        .eq("entita_tipo", "campagna_email")
        .eq("entita_id", campagna_id);
      const out: { filename: string; content: string; contentType: string }[] = [];
      for (const a of data ?? []) {
        const { data: file, error } = await supabaseAdmin.storage
          .from(ALLEGATI_BUCKET)
          .download(a.storage_path as string);
        if (error || !file) continue;
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
        out.push({
          filename: (a.nome_file as string) ?? "allegato",
          content: btoa(bin),
          contentType: (a.mime_type as string) ?? "application/octet-stream",
        });
      }
      return out;
    });

    const idsRes = await step.run("collect-pending-ids", async () => {
      const { data } = await supabaseAdmin
        .from("campagne_email_destinatari")
        .select("id")
        .eq("campagna_id", campagna_id)
        .eq("stato_invio", "da_inviare")
        .order("aggiunto_il", { ascending: true });
      return { ids: (data ?? []).map((r: { id: string }) => r.id) };
    });

    const pendingIds = idsRes.ids;
    const total = pendingIds.length;
    logger.info(`[campagna-marketing] ${total} destinatari, blocchi da ${cfg.blocco}, pausa ${cfg.pausa}s`);

    if (total === 0) {
      await step.run("finalize-vuoto", async () => {
        await supabaseAdmin
          .from("campagne_email_marketing")
          .update({ stato: "completata", inviata_at: new Date().toISOString() } as never)
          .eq("id", campagna_id);
      });
      return { ok: true, inviati: 0 };
    }

    const numBlocchi = Math.ceil(total / cfg.blocco);
    let annullataInCorso = false;

    for (let b = 0; b < numBlocchi; b++) {
      const guard = await step.run(`guard-${b}`, async () => {
        const { data: c } = await supabaseAdmin
          .from("campagne_email_marketing")
          .select("stato")
          .eq("id", campagna_id)
          .maybeSingle();
        return { annullata: c?.stato === "annullata" };
      });
      if (guard.annullata) {
        logger.info(`[campagna-marketing] annullata al blocco ${b}, esco`);
        annullataInCorso = true;
        break;
      }

      const slice = pendingIds.slice(b * cfg.blocco, (b + 1) * cfg.blocco);

      const blockResult = await step.run(`blocco-${b}`, async () => {
        let inviati = 0;
        let falliti = 0;
        let saltati = 0;

        const { data: destBlock } = await supabaseAdmin
          .from("campagne_email_destinatari")
          .select("id, email, cliente_id, contatto_id, tipo_destinatario, stato_invio")
          .in("id", slice);

        for (const d of destBlock ?? []) {
          // Idempotenza: mai reinviare a chi risulta già inviato.
          if (d.stato_invio !== "da_inviare") continue;
          try {
            if (!isEmailValida(d.email)) {
              await supabaseAdmin
                .from("campagne_email_destinatari")
                .update({
                  stato_invio: "email_non_valida",
                  errore: "Indirizzo email non valido o malformato",
                } as never)
                .eq("id", d.id);
              saltati += 1;
              continue;
            }

            let ragioneSociale = "";
            let citta = "";
            let agente = "";
            let categoria = "";
            let sede: DatiSede | null = null;

            if (d.cliente_id) {
              const { data: cli } = await supabaseAdmin
                .from("clienti")
                .select("ragione_sociale, citta, categoria, codice_agente, store_id")
                .eq("id", d.cliente_id)
                .maybeSingle();
              ragioneSociale = cli?.ragione_sociale ?? "";
              citta = (cli as { citta?: string | null } | null)?.citta ?? "";
              categoria = (cli as { categoria?: string | null } | null)?.categoria ?? "";
              const codAg = (cli as { codice_agente?: string | null } | null)?.codice_agente ?? null;
              if (codAg) {
                const { data: ag } = await supabaseAdmin
                  .from("agenti")
                  .select("descrizione")
                  .eq("codice", codAg)
                  .maybeSingle();
                agente = (ag as { descrizione?: string | null } | null)?.descrizione ?? codAg;
              }
              const storeId = (cli as { store_id?: string | null } | null)?.store_id ?? null;
              if (storeId) {
                const { data: store } = await supabaseAdmin
                  .from("stores")
                  .select("nome, insegna, indirizzo, cap, citta, provincia, telefono")
                  .eq("id", storeId)
                  .maybeSingle();
                if (store) {
                  sede = {
                    nome: store.nome ?? null,
                    insegna: (store as { insegna?: string | null }).insegna ?? null,
                    indirizzo: store.indirizzo ?? null,
                    cap: store.cap ?? null,
                    citta: store.citta ?? null,
                    provincia: store.provincia ?? null,
                    telefono: store.telefono ?? null,
                  };
                }
              }
            }

            const token = await tokenRecessoContatto(d.contatto_id as string | null);
            const linkRecesso = token ? `${appUrl()}/recesso/${token}` : null;

            const { oggetto, html } = buildEmailCampagna({
              oggetto: prep.oggetto,
              corpo: prep.corpo,
              dati: { ragione_sociale: ragioneSociale, citta, agente, categoria },
              sede,
              mittente: { nome: cfg.nomeOperatore, email: cfg.emailOperatore },
              linkRecesso,
              useCid: true,
            });

            // Tracciamento clic: riscrittura dei link (il link di recesso è escluso dal modulo).
            const trackingToken = await trackingTokenDestinatario(d.id as string);
            const htmlFinale = trackingToken
              ? riscriviLinkTracciati(html, trackingToken, appUrl())
              : html;

            const sendRes = await sendEmailViaEdge({
              to: d.email as string,
              subject: oggetto,
              html: htmlFinale,
              fromName: "MADE Distribuzione",
              replyTo: cfg.emailOperatore ?? undefined,
              inlineLogo: true,
              ...(allegati.length ? { attachments: allegati } : {}),
            });

            if (!sendRes.ok) {
              await supabaseAdmin
                .from("campagne_email_destinatari")
                .update({ stato_invio: "fallito", errore: (sendRes.err ?? "errore invio").slice(0, 500) } as never)
                .eq("id", d.id);
              falliti += 1;
              continue;
            }

            await supabaseAdmin
              .from("campagne_email_destinatari")
              .update({
                stato_invio: "inviato",
                inviato_at: new Date().toISOString(),
                errore: null,
              } as never)
              .eq("id", d.id);
            inviati += 1;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await supabaseAdmin
              .from("campagne_email_destinatari")
              .update({ stato_invio: "fallito", errore: msg.slice(0, 500) } as never)
              .eq("id", d.id);
            falliti += 1;
          }
        }

        const { data: campNow } = await supabaseAdmin
          .from("campagne_email_marketing")
          .select("inviati, falliti, saltati")
          .eq("id", campagna_id)
          .maybeSingle();
        await supabaseAdmin
          .from("campagne_email_marketing")
          .update({
            inviati: Number((campNow as { inviati?: number } | null)?.inviati ?? 0) + inviati,
            falliti: Number((campNow as { falliti?: number } | null)?.falliti ?? 0) + falliti,
            saltati: Number((campNow as { saltati?: number } | null)?.saltati ?? 0) + saltati,
          } as never)
          .eq("id", campagna_id);

        return { inviati, falliti, saltati };
      });

      logger.info(`[campagna-marketing] blocco ${b + 1}/${numBlocchi}`, blockResult);

      if (b < numBlocchi - 1 && cfg.pausa > 0) {
        await step.sleep(`pausa-${b}`, `${cfg.pausa}s`);
      }
    }

    if (annullataInCorso) return { ok: true, annullata: true };

    await step.run("finalize", async () => {
      const { data: camp } = await supabaseAdmin
        .from("campagne_email_marketing")
        .select("falliti, stato")
        .eq("id", campagna_id)
        .maybeSingle();
      if (camp?.stato === "annullata") return;
      const falliti = Number((camp as { falliti?: number } | null)?.falliti ?? 0);
      await supabaseAdmin
        .from("campagne_email_marketing")
        .update({
          stato: falliti > 0 ? "completata_con_errori" : "completata",
          inviata_at: new Date().toISOString(),
        } as never)
        .eq("id", campagna_id);
    });

    return { ok: true };
  },
);
