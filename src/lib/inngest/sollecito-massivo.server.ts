import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderTemplate, isScaduto, wrapEmailHtml, livelloSollecitoFromTipo, type DatiSede, type ScadenzaSollecito } from "@/lib/template-email-render";

type EventData = { campagna_id: string };

const DEFAULT_BLOCCO = 12;
const DEFAULT_PAUSA = 60;

async function getConfigInt(chiave: string, fallback: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();
  const v = parseFloat(String(data?.valore ?? ""));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

async function sendEmailViaEdge(payload: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  inlineLogo?: boolean;
}): Promise<{ ok: boolean; err?: string }> {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* noop */
    }
    if (!res.ok) {
      return { ok: false, err: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const ok = (parsed as { ok?: boolean } | null)?.ok ?? false;
    if (!ok) return { ok: false, err: text.slice(0, 300) };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

async function getOperatoreInfo(userId: string | null): Promise<{ nome: string; email: string | null }> {
  if (!userId) return { nome: "Operatore", email: null };
  const { data } = await supabaseAdmin
    .from("profili")
    .select("nome, cognome, email")
    .eq("id", userId)
    .maybeSingle();
  const n = `${data?.nome ?? ""} ${data?.cognome ?? ""}`.trim();
  return { nome: n || "Operatore", email: data?.email ?? null };
}

export const invioMassivoSolleciti = inngest.createFunction(
  {
    id: "invio-massivo-solleciti",
    name: "Invio massivo solleciti email",
    retries: 2,
    timeouts: { finish: "30m" },
    triggers: [{ event: "sollecito/invio-massivo.requested" }],
    onFailure: async ({ event: failedEvent, error }) => {
      const id = (failedEvent.data as { campagna_id?: string } | undefined)?.campagna_id;
      if (!id) return;
      await supabaseAdmin
        .from("campagne_sollecito")
        .update({
          stato: "completata_con_errori",
          completata_at: new Date().toISOString(),
          note: `Job fallito dopo i retry: ${error?.message ?? "errore sconosciuto"}`,
        })
        .eq("id", id);
    },
  },
  async ({ event, step, logger }) => {
    const { campagna_id } = event.data as EventData;

    // STEP prepara: legge campagna, determina indirizzi, marca saltati senza indirizzo
    const prep = await step.run("prepara", async () => {
      const { data: camp, error } = await supabaseAdmin
        .from("campagne_sollecito")
        .select("id, template_id, preferenza_indirizzo, operatore_id, stato, tipo_campagna, mesi")
        .eq("id", campagna_id)
        .maybeSingle();
      if (error || !camp) throw new Error(`Campagna non trovata: ${error?.message ?? campagna_id}`);

      // Guard: se annullata prima ancora di partire, esci pulito
      if (camp.stato === "annullata") {
        return { templateId: null, operatoreId: null, annullata: true, tipoCampagna: "sollecito" as string, mesi: [] as string[] };
      }

      await supabaseAdmin
        .from("campagne_sollecito")
        .update({ stato: "in_corso" })
        .eq("id", campagna_id);


      const { data: dests } = await supabaseAdmin
        .from("campagne_sollecito_destinatari")
        .select("id, cliente_id, indirizzo_usato")
        .eq("campagna_id", campagna_id)
        .eq("stato", "da_inviare");

      const destRows = dests ?? [];
      // Solo per le righe SENZA indirizzo_usato dobbiamo risolverlo da clienti.
      const daRisolvere = destRows.filter((d) => !d.indirizzo_usato || !String(d.indirizzo_usato).trim());
      const clienteIds = Array.from(new Set(daRisolvere.map((d) => d.cliente_id)));

      const clientiInfo: Record<string, { email: string | null; pec: string | null }> = {};
      const CHUNK = 200;
      for (let i = 0; i < clienteIds.length; i += CHUNK) {
        const slice = clienteIds.slice(i, i + CHUNK);
        const { data } = await supabaseAdmin
          .from("clienti")
          .select("id, email, pec")
          .in("id", slice);
        (data ?? []).forEach((c: { id: string; email: string | null; pec: string | null }) => {
          clientiInfo[c.id] = { email: c.email, pec: c.pec };
        });
      }

      const pref = camp.preferenza_indirizzo as "email" | "pec";
      let saltati = 0;
      for (const d of daRisolvere) {
        const ci = clientiInfo[d.cliente_id] ?? { email: null, pec: null };
        const primary = pref === "email" ? ci.email : ci.pec;
        const secondary = pref === "email" ? ci.pec : ci.email;
        const addr = (primary && primary.trim()) || (secondary && secondary.trim()) || null;
        if (!addr) {
          await supabaseAdmin
            .from("campagne_sollecito_destinatari")
            .update({ stato: "saltato_no_indirizzo" })
            .eq("id", d.id);
          saltati += 1;
        } else {
          await supabaseAdmin
            .from("campagne_sollecito_destinatari")
            .update({ indirizzo_usato: addr })
            .eq("id", d.id);
        }
      }

      if (saltati > 0) {
        await supabaseAdmin
          .from("campagne_sollecito")
          .update({ saltati })
          .eq("id", campagna_id);
      }

      return {
        templateId: camp.template_id as string | null,
        operatoreId: camp.operatore_id as string | null,
        annullata: false as boolean,
        tipoCampagna: ((camp as { tipo_campagna?: string | null }).tipo_campagna ?? "sollecito") as string,
        mesi: (((camp as { mesi?: string[] | null }).mesi ?? []) as string[]),
      };
    });

    if (prep.annullata) {
      logger.info(`[sollecito-massivo] campagna ${campagna_id} annullata prima dell'avvio, esco`);
      return { ok: true, annullata: true };
    }



    if (!prep.templateId) {
      await supabaseAdmin
        .from("campagne_sollecito")
        .update({
          stato: "completata_con_errori",
          completata_at: new Date().toISOString(),
          note: "Template non specificato",
        })
        .eq("id", campagna_id);
      return { ok: false, reason: "no-template" };
    }

    // Configurazione throttling (letta una sola volta — il job può durare a lungo)
    const cfg = await step.run("config", async (): Promise<{
      blocco: number;
      pausa: number;
      nomeOperatore: string;
      emailOperatore: string | null;
    }> => {
      const op = await getOperatoreInfo(prep.operatoreId);
      return {
        blocco: await getConfigInt("sollecito_massivo_blocco", DEFAULT_BLOCCO),
        pausa: await getConfigInt("sollecito_massivo_pausa_sec", DEFAULT_PAUSA),
        nomeOperatore: op.nome,
        emailOperatore: op.email,
      };
    });

    // Carica template UNA volta
    const tpl = await step.run("load-template", async () => {
      const { data, error } = await supabaseAdmin
        .from("template_email")
        .select("id, nome, oggetto, corpo, tipo")
        .eq("id", prep.templateId!)
        .maybeSingle();
      if (error || !data) throw new Error(`Template non trovato: ${prep.templateId}`);
      return data as { id: string; nome: string; oggetto: string; corpo: string; tipo: string };
    });

    // Recupera gli ID dei destinatari ancora da inviare (solo id, ordinati)
    const idsRes = await step.run("collect-pending-ids", async () => {
      const { data } = await supabaseAdmin
        .from("campagne_sollecito_destinatari")
        .select("id")
        .eq("campagna_id", campagna_id)
        .eq("stato", "da_inviare")
        .order("created_at", { ascending: true });
      return { ids: (data ?? []).map((r: { id: string }) => r.id) };
    });

    const pendingIds = idsRes.ids;
    const total = pendingIds.length;
    logger.info(`[sollecito-massivo] ${total} destinatari da inviare, blocchi da ${cfg.blocco}, pausa ${cfg.pausa}s`);

    if (total === 0) {
      await step.run("finalize-vuoto", async () => {
        await supabaseAdmin
          .from("campagne_sollecito")
          .update({
            stato: "completata",
            completata_at: new Date().toISOString(),
          })
          .eq("id", campagna_id);
      });
      return { ok: true, inviati: 0 };
    }

    const numBlocchi = Math.ceil(total / cfg.blocco);

    let annullataInCorso = false;
    for (let b = 0; b < numBlocchi; b++) {
      // Guard: prima di ogni blocco rileggi lo stato campagna e fermati se annullata
      const guard = await step.run(`guard-${b}`, async () => {
        const { data: c } = await supabaseAdmin
          .from("campagne_sollecito")
          .select("stato")
          .eq("id", campagna_id)
          .maybeSingle();
        return { annullata: c?.stato === "annullata" };
      });
      if (guard.annullata) {
        logger.info(`[sollecito-massivo] campagna ${campagna_id} annullata al blocco ${b}, esco`);
        annullataInCorso = true;
        break;
      }

      const slice = pendingIds.slice(b * cfg.blocco, (b + 1) * cfg.blocco);

      const blockResult = await step.run(`blocco-${b}`, async () => {

        let inviati = 0;
        let falliti = 0;

        // Carica i dati necessari del blocco
        const { data: destBlock } = await supabaseAdmin
          .from("campagne_sollecito_destinatari")
          .select("id, cliente_id, indirizzo_usato")
          .in("id", slice);

        for (const d of destBlock ?? []) {
          try {
            if (!d.indirizzo_usato) {
              await supabaseAdmin
                .from("campagne_sollecito_destinatari")
                .update({ stato: "saltato_no_indirizzo" })
                .eq("id", d.id);
              continue;
            }

            // Cliente: ragione sociale + store (per dati sede footer)
            const { data: cliente } = await supabaseAdmin
              .from("clienti")
              .select("ragione_sociale, store_id")
              .eq("id", d.cliente_id)
              .maybeSingle();

            let sede: DatiSede | null = null;
            if (cliente?.store_id) {
              const { data: store } = await supabaseAdmin
                .from("stores")
                .select("nome, insegna, indirizzo, cap, citta, provincia, telefono")
                .eq("id", cliente.store_id)
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

            // Scadenze del cliente
            const { data: rawScad } = await supabaseAdmin
              .from("scadenze")
              .select(
                "id, numero_documento, data_documento, data_scadenza, importo_scadenza, stato_contabile, data_pagamento_effettiva, giorni_ritardo, tempi_scadenza, in_legale",
              )
              .eq("cliente_id", d.cliente_id)
              .order("data_scadenza", { ascending: true });

            const isPromemoria = prep.tipoCampagna === "promemoria_scadenza";
            const oggiStr = new Date().toISOString().slice(0, 10);
            const mesiSet = new Set(prep.mesi ?? []);

            const scadenzeRilevanti = (rawScad ?? []).filter((s) => {
              // Regola: stato + data_pagamento_effettiva + data_scadenza
              if ((s as { data_pagamento_effettiva?: string | null }).data_pagamento_effettiva) return false;
              if (s.stato_contabile !== "Aperta") return false;
              if (isPromemoria) {
                if ((s as { in_legale?: boolean | null }).in_legale) return false;
                if (!s.data_scadenza || String(s.data_scadenza) < oggiStr) return false;
                if (mesiSet.size > 0) {
                  const k = String(s.data_scadenza).slice(0, 7);
                  if (!mesiSet.has(k)) return false;
                }
                return true;
              }
              return isScaduto(s);
            });
            const totaleRif = scadenzeRilevanti.reduce(
              (a, s) => a + Number(s.importo_scadenza ?? 0),
              0,
            );

            const scadenzeForTpl: ScadenzaSollecito[] = scadenzeRilevanti.map((s) => ({
              numero_documento: s.numero_documento,
              data_documento: s.data_documento,
              data_scadenza: s.data_scadenza,
              importo_scadenza: s.importo_scadenza,
            }));

            const rendered = renderTemplate(
              { oggetto: tpl.oggetto, corpo: tpl.corpo },
              {
                ragione_sociale: cliente?.ragione_sociale ?? "",
                nome_operatore: cfg.nomeOperatore,
                scadenze: scadenzeForTpl,
              },
              { tipo: tpl.tipo },
            );

            const htmlCompleto = wrapEmailHtml(rendered.corpo, sede, {
              nome: cfg.nomeOperatore,
              email: cfg.emailOperatore,
            }, { useCid: true, tipo: tpl.tipo });

            const sendRes = await sendEmailViaEdge({
              to: d.indirizzo_usato,
              subject: rendered.oggetto,
              html: htmlCompleto,
              fromName: "Recupero Crediti MADE",
              replyTo: cfg.emailOperatore ?? undefined,
              inlineLogo: true,
            });

            if (!sendRes.ok) {
              await supabaseAdmin
                .from("campagne_sollecito_destinatari")
                .update({ stato: "fallito", errore: sendRes.err ?? "errore invio" })
                .eq("id", d.id);
              falliti += 1;
              continue;
            }

            // Crea azione_recupero — tipo differenziato per promemoria
            const tipoAzione = isPromemoria ? "promemoria_scadenza" : "email";
            const noteRiassunto = isPromemoria
              ? `Promemoria scadenza inviato "${tpl.nome}" a ${d.indirizzo_usato} (campagna ${campagna_id})`
              : `Inviato template "${tpl.nome}" a ${d.indirizzo_usato} (campagna ${campagna_id})`;
            const { data: azione, error: azErr } = await supabaseAdmin
              .from("azioni_recupero")
              .insert({
                cliente_id: d.cliente_id,
                operatore_id: prep.operatoreId,
                tipo: tipoAzione,
                esito: "fatto",
                data_azione: new Date().toISOString(),
                importo_riferimento: totaleRif,
                note: noteRiassunto,
                email_oggetto: rendered.oggetto,
                email_corpo_html: htmlCompleto,
                email_destinatario: d.indirizzo_usato,
                livello_sollecito: livelloSollecitoFromTipo(tpl.tipo),
              })
              .select("id")
              .single();
            if (azErr) throw azErr;

            const scadIds = scadenzeRilevanti.map((s) => s.id as string).filter(Boolean);
            if (scadIds.length && azione?.id) {
              const rows = scadIds.map((sid) => ({ azione_id: azione.id, scadenza_id: sid }));
              await supabaseAdmin.from("azioni_recupero_scadenze").insert(rows);
            }

            await supabaseAdmin
              .from("campagne_sollecito_destinatari")
              .update({
                stato: "inviato",
                azione_id: azione?.id ?? null,
                importo_riferimento: totaleRif,
                inviato_at: new Date().toISOString(),
              })
              .eq("id", d.id);
            inviati += 1;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await supabaseAdmin
              .from("campagne_sollecito_destinatari")
              .update({ stato: "fallito", errore: msg.slice(0, 500) })
              .eq("id", d.id);
            falliti += 1;
          }
        }

        // Aggiorna contatori sulla campagna (incremento via RPC non disponibile:
        // facciamo una read+write sicuro)
        const { data: campNow } = await supabaseAdmin
          .from("campagne_sollecito")
          .select("inviati, falliti")
          .eq("id", campagna_id)
          .maybeSingle();
        await supabaseAdmin
          .from("campagne_sollecito")
          .update({
            inviati: Number(campNow?.inviati ?? 0) + inviati,
            falliti: Number(campNow?.falliti ?? 0) + falliti,
          })
          .eq("id", campagna_id);

        return { inviati, falliti };
      });

      logger.info(`[sollecito-massivo] blocco ${b + 1}/${numBlocchi}`, blockResult);

      // Pausa tra blocchi (escluso l'ultimo)
      if (b < numBlocchi - 1 && cfg.pausa > 0) {
        await step.sleep(`pausa-${b}`, `${cfg.pausa}s`);
      }
    }

    if (annullataInCorso) {
      // Non sovrascrivere lo stato 'annullata' impostato dall'utente
      return { ok: true, annullata: true };
    }

    await step.run("finalize", async () => {
      const { data: camp } = await supabaseAdmin
        .from("campagne_sollecito")
        .select("falliti, stato")
        .eq("id", campagna_id)
        .maybeSingle();
      // Doppio guard: se nel frattempo è stata annullata, non toccare lo stato
      if (camp?.stato === "annullata") return;
      const falliti = Number(camp?.falliti ?? 0);
      await supabaseAdmin
        .from("campagne_sollecito")
        .update({
          stato: falliti > 0 ? "completata_con_errori" : "completata",
          completata_at: new Date().toISOString(),
        })
        .eq("id", campagna_id);
    });

    return { ok: true };

  },
);
