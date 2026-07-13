// Job giornaliero: promemoria automatico scadenze in arrivo.
// - Cron: 06:00 UTC ogni giorno.
// - Rispetta il flag `promemoria_scadenza_attivo`.
// - Regola "a scadere" centralizzata nella RPC SQL
//   `get_promemoria_scadenze_dettaglio(_data, _escludi_legale, _escludi_bloccati, _escludi_bos)`:
//     data_pagamento_effettiva IS NULL AND data_scadenza = today+N
//     + esclusioni configurabili (in_legale, bloccato, codice_pagamento BOS%).
//   NESSUN filtro replicato qui.
// - Pipeline email condivisa: `buildPromemoriaEmail` (renderTemplate +
//   wrapEmailHtml, tipo "promemoria_scadenza", useCid:true).
// - Firma: nome + email dell'utente firmatario configurato
//   (`promemoria_scadenza_operatore_id`); se assente il job salta l'invio.
// - Idempotenza: `scadenze.promemoria_scadenza_inviato_il` viene marcata dopo
//   l'invio effettivo. Log su `promemoria_scadenza_log` (+ bridge scadenze).
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";
import { buildPromemoriaEmail } from "@/lib/promemoria-scadenza-render";
import type { DatiSede, ScadenzaSollecito } from "@/lib/template-email-render";

async function getConfig(chiave: string, fallback: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("configurazioni")
    .select("valore")
    .eq("chiave", chiave)
    .maybeSingle();
  return (data?.valore ?? "").toString().trim() || fallback;
}

type ScadenzaDettaglioRow = {
  scadenza_id: string;
  cliente_id: string;
  ragione_sociale: string | null;
  email: string | null;
  pec: string | null;
  store_id: string | null;
  store_nome: string | null;
  store_insegna: string | null;
  store_indirizzo: string | null;
  store_cap: string | null;
  store_citta: string | null;
  store_provincia: string | null;
  store_telefono: string | null;
  numero_documento: string | null;
  data_documento: string | null;
  data_scadenza: string;
  importo_scadenza: number;
  codice_pagamento: string | null;
};

function sedeFromRow(r: ScadenzaDettaglioRow): DatiSede | null {
  if (!r.store_id) return null;
  return {
    nome: r.store_nome,
    insegna: r.store_insegna,
    indirizzo: r.store_indirizzo,
    cap: r.store_cap,
    citta: r.store_citta,
    provincia: r.store_provincia,
    telefono: r.store_telefono,
  };
}

export const promemoriaScadenzaAutomatico = inngest.createFunction(
  {
    id: "promemoria-scadenza-automatico",
    name: "Promemoria scadenza automatico",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async () => {
    const attivo = await getConfig("promemoria_scadenza_attivo", "true");
    if (attivo !== "true") {
      return { ok: true, skipped: true, reason: "disattivato" };
    }

    const giorniStr = await getConfig("promemoria_scadenza_giorni_anticipo", "3");
    const giorni = Math.max(0, parseInt(giorniStr, 10) || 3);
    const escludiLegale = (await getConfig("promemoria_scadenza_escludi_legale", "true")) !== "false";
    const escludiBloccati = (await getConfig("promemoria_scadenza_escludi_bloccati", "false")) === "true";
    const escludiBos = (await getConfig("promemoria_scadenza_escludi_bos", "true")) !== "false";
    // Filtro metodi (restrittivo, distinto dalle esclusioni): default true/true =
    // comportamento invariato (bonifici + RiBa). Se entrambi false, non inviare.
    const includiBonifici = (await getConfig("promemoria_scadenza_includi_bonifici", "true")) !== "false";
    const includiRiba = (await getConfig("promemoria_scadenza_includi_riba", "true")) !== "false";
    if (!includiBonifici && !includiRiba) {
      return { ok: true, skipped: true, reason: "nessun_metodo_incluso" };
    }

    // Firmatario: senza operatore configurato NON inviamo email anonime.
    const operatoreId = (await getConfig("promemoria_scadenza_operatore_id", "")).trim();
    if (!operatoreId) {
      return { ok: true, skipped: true, reason: "no_operatore_configurato" };
    }
    const { data: prof } = await supabaseAdmin
      .from("profili")
      .select("nome, cognome, email")
      .eq("id", operatoreId)
      .maybeSingle();
    const mittenteNome = [prof?.nome ?? "", prof?.cognome ?? ""].map((s) => (s ?? "").trim()).filter(Boolean).join(" ").trim();
    const mittenteEmail = (prof?.email ?? "").trim();
    if (!mittenteNome || !mittenteEmail) {
      return { ok: true, skipped: true, reason: "operatore_incompleto" };
    }
    const mittente = { nome: mittenteNome, email: mittenteEmail };

    // Data target = oggi + N giorni (ISO YYYY-MM-DD).
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + giorni);
    const targetISO = target.toISOString().slice(0, 10);

    // Template email (fonte unica: template_email tipo=promemoria_scadenza attivo).
    const { data: tplRaw } = await supabaseAdmin
      .from("template_email")
      .select("oggetto, corpo")
      .eq("tipo", "promemoria_scadenza")
      .eq("attivo", true)
      .maybeSingle();
    const tpl = tplRaw as { oggetto: string | null; corpo: string | null } | null;
    if (!tpl) return { ok: true, skipped: true, reason: "template_non_trovato" };
    const template = { oggetto: tpl.oggetto ?? "", corpo: tpl.corpo ?? "" };

    // Regola "a scadere" UNIFICATA: la RPC decide tutto (dpe IS NULL, data,
    // in_legale, bloccato, BOS%). Il job non replica filtri.
    const { data: rows, error } = await supabaseAdmin.rpc(
      "get_promemoria_scadenze_dettaglio" as never,
      {
        _data: targetISO,
        _escludi_legale: escludiLegale,
        _escludi_bloccati: escludiBloccati,
        _escludi_bos: escludiBos,
        _includi_bonifici: includiBonifici,
        _includi_riba: includiRiba,
      } as never,
    );
    if (error) throw new Error(error.message);
    const scadenze = (rows ?? []) as unknown as ScadenzaDettaglioRow[];

    // Escludi scadenze gia' promemoriate (idempotenza) in un secondo round-trip
    // — evita di appesantire la RPC con la colonna dedicata.
    const scadenzaIds = scadenze.map((r) => r.scadenza_id);
    let giaInviate = new Set<string>();
    if (scadenzaIds.length > 0) {
      const { data: yaSent } = await supabaseAdmin
        .from("scadenze")
        .select("id")
        .in("id", scadenzaIds)
        .not("promemoria_scadenza_inviato_il", "is", null);
      giaInviate = new Set(((yaSent ?? []) as { id: string }[]).map((r) => r.id));
    }
    const scadenzeFiltrate = scadenze.filter((r) => !giaInviate.has(r.scadenza_id));

    // Raggruppa per cliente.
    const perCliente = new Map<string, ScadenzaDettaglioRow[]>();
    for (const s of scadenzeFiltrate) {
      const arr = perCliente.get(s.cliente_id) ?? [];
      arr.push(s);
      perCliente.set(s.cliente_id, arr);
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    let inviati = 0;
    let saltati_no_email = 0;
    let falliti = 0;

    for (const [clienteId, lista] of perCliente) {
      const first = lista[0];
      const ragioneSociale = first.ragione_sociale ?? "Cliente";
      const email = (first.email ?? "").trim();
      const importoTotale = lista.reduce((acc, r) => acc + Number(r.importo_scadenza || 0), 0);
      const numScadenze = lista.length;

      const scadenzePerRender: ScadenzaSollecito[] = lista.map((r) => ({
        numero_documento: r.numero_documento,
        data_documento: r.data_documento,
        data_scadenza: r.data_scadenza,
        importo_scadenza: Number(r.importo_scadenza || 0),
        codice_pagamento: r.codice_pagamento,
      }));

      // Composizione ARCHIVIO (useCid:false) prodotta SEMPRE, prima del check email,
      // cosi' anche i saltato_no_email hanno l'anteprima "di cosa sarebbe partito".
      // Logo via URL pubblico -> ri-renderizzabile in iframe browser.
      const { html: htmlArchivio } = buildPromemoriaEmail({
        template,
        ragioneSociale,
        scadenze: scadenzePerRender,
        sede: sedeFromRow(first),
        mittente,
        useCid: false,
      });

      // Helper: inserisce log + bridge scadenze (per tutti gli esiti).
      const insertLog = async (payload: Record<string, unknown>) => {
        const { data: logRow, error: logErr } = await supabaseAdmin
          .from("promemoria_scadenza_log" as never)
          .insert(payload as never)
          .select("id")
          .single();
        if (logErr || !logRow) return;
        const logId = (logRow as { id: string }).id;
        const bridgeRows = lista.map((r) => ({ log_id: logId, scadenza_id: r.scadenza_id }));
        await supabaseAdmin.from("promemoria_scadenza_log_scadenze" as never).insert(bridgeRows as never);
      };

      if (!email) {
        await insertLog({
          cliente_id: clienteId,
          email_destinatario: null,
          data_esecuzione: todayISO,
          giorni_anticipo: giorni,
          num_scadenze: numScadenze,
          importo_totale: importoTotale,
          esito: "saltato_no_email",
          email_html: htmlArchivio,
        });
        saltati_no_email++;
        continue;
      }

      // Composizione INVIO (useCid:true) SOLO se c'e' un'email valida.
      const { oggetto, html } = buildPromemoriaEmail({
        template,
        ragioneSociale,
        scadenze: scadenzePerRender,
        sede: sedeFromRow(first),
        mittente,
        useCid: true,
      });

      const res = await sendEmailViaEdge({
        to: email,
        subject: oggetto,
        html,
        inlineLogo: true,
        fromName: mittente.nome,
        replyTo: mittente.email,
      });

      if (res.ok) {
        await insertLog({
          cliente_id: clienteId,
          email_destinatario: email,
          data_esecuzione: todayISO,
          giorni_anticipo: giorni,
          num_scadenze: numScadenze,
          importo_totale: importoTotale,
          esito: "inviato",
          email_html: htmlArchivio,
        });
        // Idempotenza: la marca resta ESCLUSIVAMENTE nel ramo di invio ok.
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("scadenze")
          .update({ promemoria_scadenza_inviato_il: nowIso } as never)
          .in("id", lista.map((r) => r.scadenza_id));
        inviati++;
      } else {
        await insertLog({
          cliente_id: clienteId,
          email_destinatario: email,
          data_esecuzione: todayISO,
          giorni_anticipo: giorni,
          num_scadenze: numScadenze,
          importo_totale: importoTotale,
          esito: "fallito",
          errore: res.err ?? null,
          email_html: htmlArchivio,
        });
        falliti++;
        console.error(`[promemoria-scadenza] fail cliente ${clienteId}:`, res.err);
      }
    }


    return {
      ok: true,
      target_date: targetISO,
      giorni_anticipo: giorni,
      escludi_legale: escludiLegale,
      escludi_bloccati: escludiBloccati,
      escludi_bos: escludiBos,
      includi_bonifici: includiBonifici,
      includi_riba: includiRiba,
      operatore_id: operatoreId,
      clienti_candidati: perCliente.size,
      inviati,
      saltati_no_email,
      falliti,
    };
  },
);
