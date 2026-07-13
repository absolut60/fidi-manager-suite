// Server function per l'anteprima del promemoria di scadenza in Impostazioni.
// Usa ESATTAMENTE la stessa pipeline dell'invio reale (buildPromemoriaEmail),
// con l'unica differenza useCid=false per rendere il logo via URL pubblico
// (l'iframe del browser non risolve cid:).
//
// Dati:
// - flag esclusioni + operatore dalle configurazioni;
// - template email attivo tipo "promemoria_scadenza";
// - un cliente reale con scadenze a T+N (se esiste) altrimenti dati demo.
//
// Autorizzazione: solo ruoli amministrativi. RLS-only-DB e' insufficiente
// perche' l'anteprima carica config protette.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildPromemoriaEmail } from "@/lib/promemoria-scadenza-render";
import type { DatiSede, ScadenzaSollecito } from "@/lib/template-email-render";

export type PromemoriaPreviewResult = {
  ok: boolean;
  reason?: string;
  oggetto?: string;
  html?: string;
  meta?: {
    cliente: string;
    email: string | null;
    num_scadenze: number;
    data_target: string;
    demo: boolean;
  };
};

export const previewPromemoriaEmail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PromemoriaPreviewResult> => {
    const { supabase, userId } = context;

    // Autorizzazione: solo ruoli amministrativi.
    const roles = ["amministratore", "amministrazione", "direzione"] as const;
    let allowed = false;
    for (const r of roles) {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: r });
      if (data === true) { allowed = true; break; }
    }
    if (!allowed) return { ok: false, reason: "forbidden" };

    // Config
    const { data: cfgRows } = await supabase
      .from("configurazioni")
      .select("chiave, valore")
      .in("chiave", [
        "promemoria_scadenza_giorni_anticipo",
        "promemoria_scadenza_escludi_legale",
        "promemoria_scadenza_escludi_bloccati",
        "promemoria_scadenza_escludi_bos",
        "promemoria_scadenza_includi_bonifici",
        "promemoria_scadenza_includi_riba",
        "promemoria_scadenza_operatore_id",
      ]);
    const cfg = new Map(((cfgRows ?? []) as { chiave: string; valore: string }[]).map((r) => [r.chiave, (r.valore ?? "").trim()]));
    const giorni = Math.max(0, parseInt(cfg.get("promemoria_scadenza_giorni_anticipo") ?? "3", 10) || 3);
    const escludiLegale = (cfg.get("promemoria_scadenza_escludi_legale") ?? "true") !== "false";
    const escludiBloccati = (cfg.get("promemoria_scadenza_escludi_bloccati") ?? "false") === "true";
    const escludiBos = (cfg.get("promemoria_scadenza_escludi_bos") ?? "true") !== "false";
    const operatoreId = cfg.get("promemoria_scadenza_operatore_id") ?? "";

    // Mittente: se non configurato, mostra un fallback ma indica il problema
    // (l'invio reale saltera' con reason=no_operatore_configurato).
    let mittente = { nome: "Operatore non configurato", email: undefined as string | undefined };
    if (operatoreId) {
      const { data: prof } = await supabase
        .from("profili")
        .select("nome, cognome, email")
        .eq("id", operatoreId)
        .maybeSingle();
      const nome = [prof?.nome ?? "", prof?.cognome ?? ""].map((s) => (s ?? "").trim()).filter(Boolean).join(" ").trim();
      const email = (prof?.email ?? "").trim();
      if (nome && email) mittente = { nome, email };
    }

    // Template
    const { data: tpl } = await supabase
      .from("template_email")
      .select("oggetto, corpo")
      .eq("tipo", "promemoria_scadenza")
      .eq("attivo", true)
      .maybeSingle();
    if (!tpl) return { ok: false, reason: "template_non_trovato" };
    const template = { oggetto: tpl.oggetto ?? "", corpo: tpl.corpo ?? "" };

    // Data target = oggi + N.
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + giorni);
    const targetISO = target.toISOString().slice(0, 10);

    // Tentativo di caricare un cliente reale con scadenze a T+N.
    let ragioneSociale = "ACME S.p.A. (anteprima)";
    let emailDest: string | null = null;
    let sede: DatiSede | null = null;
    let scadenze: ScadenzaSollecito[] = [];
    let demo = true;
    const { data: rows } = await supabase.rpc(
      "get_promemoria_scadenze_dettaglio" as never,
      {
        _data: targetISO,
        _escludi_legale: escludiLegale,
        _escludi_bloccati: escludiBloccati,
        _escludi_bos: escludiBos,
      } as never,
    );
    const scadenzeReali = (rows ?? []) as unknown as Array<{
      cliente_id: string; ragione_sociale: string | null; email: string | null;
      store_nome: string | null; store_insegna: string | null; store_indirizzo: string | null;
      store_cap: string | null; store_citta: string | null; store_provincia: string | null;
      store_telefono: string | null;
      numero_documento: string | null; data_documento: string | null; data_scadenza: string;
      importo_scadenza: number; codice_pagamento: string | null;
    }>;
    if (scadenzeReali.length > 0) {
      const primoClienteId = scadenzeReali[0].cliente_id;
      const gruppo = scadenzeReali.filter((r) => r.cliente_id === primoClienteId);
      const first = gruppo[0];
      ragioneSociale = first.ragione_sociale ?? ragioneSociale;
      emailDest = first.email ?? null;
      sede = {
        nome: first.store_nome, insegna: first.store_insegna,
        indirizzo: first.store_indirizzo, cap: first.store_cap,
        citta: first.store_citta, provincia: first.store_provincia,
        telefono: first.store_telefono,
      };
      scadenze = gruppo.map((r) => ({
        numero_documento: r.numero_documento,
        data_documento: r.data_documento,
        data_scadenza: r.data_scadenza,
        importo_scadenza: Number(r.importo_scadenza || 0),
        codice_pagamento: r.codice_pagamento,
      }));
      demo = false;
    } else {
      // Dati demo: due righe, una bonifico + una RiBa, per mostrare la colonna Metodo.
      scadenze = [
        { numero_documento: "2026/001234", data_documento: "2026-06-15", data_scadenza: targetISO, importo_scadenza: 1250.5, codice_pagamento: "BO30" },
        { numero_documento: "2026/001255", data_documento: "2026-06-20", data_scadenza: targetISO, importo_scadenza: 780, codice_pagamento: "RB60" },
      ];
      sede = {
        nome: "SEDE DI ESEMPIO",
        insegna: "MADE",
        indirizzo: "Via Esempio 1",
        cap: "20100",
        citta: "Milano",
        provincia: "MI",
        telefono: null,
      };
    }

    const { oggetto, html } = buildPromemoriaEmail({
      template,
      ragioneSociale,
      scadenze,
      sede,
      mittente: { nome: mittente.nome, email: mittente.email ?? null },
      // Anteprima nel browser: logo via URL pubblico (cid: non e' risolvibile qui).
      useCid: false,
    });

    return {
      ok: true,
      oggetto,
      html,
      meta: {
        cliente: ragioneSociale,
        email: emailDest,
        num_scadenze: scadenze.length,
        data_target: targetISO,
        demo,
      },
    };
  });
