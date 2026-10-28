import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPuoInviareRecupero } from "@/lib/recupero-permessi.server";
import {
  classificaDestinatarioProgressivo,
  scegliTemplateProgressivi,
  type StadioSollecito,
} from "@/lib/escalation-solleciti";

const AvviaSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  preferenzaIndirizzo: z.enum(["email", "pec"]).default("email"),
  nota: z.string().nullable().optional(),
  clienteIds: z.array(z.string().uuid()).min(1),
  indirizziCorretti: z.record(z.string().uuid(), z.string()).optional().default({}),
  tipoCampagna: z.enum(["sollecito", "promemoria_scadenza", "sollecito_progressivo"]).default("sollecito"),
  // Mesi in formato YYYY-MM, usato per filtrare le scadenze future nei promemoria.
  mesi: z.array(z.string().regex(/^\d{4}-\d{2}$/)).optional().default([]),
});

/**
 * Crea una campagna_sollecito + i destinatari + invia evento Inngest.
 * - operatore_id = utente loggato (forzato server-side).
 * - RLS: l'insert dei destinatari passa attraverso user_can_access_cliente,
 *   quindi uno Store Manager può creare destinatari solo per i suoi clienti.
 * - 'sollecito_progressivo' (FM51): livello per cliente da get_stadio_sollecito_clienti,
 *   regole in classificaDestinatarioProgressivo (escalation-solleciti.ts).
 */
export const avviaCampagnaSollecito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AvviaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPuoInviareRecupero(supabase);

    const clienteIds = Array.from(new Set(data.clienteIds));
    if (clienteIds.length === 0) {
      throw new Error("Nessun cliente selezionato");
    }

    const isProgressivo = data.tipoCampagna === "sollecito_progressivo";
    if (!isProgressivo && !data.templateId) {
      throw new Error("Seleziona il modello email da inviare");
    }

    // Progressivo: valida i tre modelli PRIMA di creare qualsiasi cosa.
    let templatesProg: Record<1 | 2 | 3, { id: string }> | null = null;
    if (isProgressivo) {
      const { data: tpls, error: et } = await supabase
        .from("template_email")
        .select("id, tipo, attivo")
        .eq("attivo", true);
      if (et) throw new Error(`Lettura modelli email fallita: ${et.message}`);
      templatesProg = scegliTemplateProgressivi(tpls ?? []);
    }

    // Progressivo: calcola lo stadio (RLS dell'utente) prima di creare la campagna.
    const stadi = new Map<string, StadioSollecito>();
    const CHUNK = 200;
    if (isProgressivo) {
      for (let i = 0; i < clienteIds.length; i += CHUNK) {
        const slice = clienteIds.slice(i, i + CHUNK);
        const { data: st, error: es } = await supabase.rpc("get_stadio_sollecito_clienti", {
          _cliente_ids: slice,
        });
        if (es) throw new Error(`Calcolo livello sollecito fallito: ${es.message}`);
        ((st ?? []) as unknown as StadioSollecito[]).forEach((r) => stadi.set(r.cliente_id, r));
      }
    }

    // Crea campagna
    const { data: camp, error: e1 } = await supabase
      .from("campagne_sollecito")
      .insert({
        operatore_id: userId,
        template_id: isProgressivo ? null : data.templateId,
        stato: "in_coda",
        preferenza_indirizzo: data.preferenzaIndirizzo,
        totale_destinatari: clienteIds.length,
        note: data.nota ?? null,
        tipo_campagna: data.tipoCampagna,
        mesi: data.tipoCampagna === "promemoria_scadenza" ? data.mesi : null,
      } as never)
      .select("id")
      .single();
    if (e1 || !camp) throw new Error(`Creazione campagna fallita: ${e1?.message}`);

    // Calcola importo_riferimento per ciascun cliente:
    // - "sollecito" => totale SCADUTO
    // - "promemoria_scadenza" => totale A SCADERE nei mesi selezionati
    // - "sollecito_progressivo" => totale_scaduto canonico dallo stadio
    const importi: Record<string, number> = {};
    const isPromemoria = data.tipoCampagna === "promemoria_scadenza";
    const oggi = new Date().toISOString().slice(0, 10);
    const mesiSet = new Set(data.mesi);
    if (isProgressivo) {
      stadi.forEach((s, cid) => { importi[cid] = Number(s.totale_scaduto ?? 0); });
    } else for (let i = 0; i < clienteIds.length; i += CHUNK) {
      const slice = clienteIds.slice(i, i + CHUNK);
      const { data: sc } = await supabase
        .from("scadenze")
        .select("cliente_id, importo_scadenza, data_scadenza, stato_contabile, data_pagamento_effettiva, giorni_ritardo, in_legale")
        .in("cliente_id", slice);
      (sc ?? []).forEach((s) => {
        if (!s.cliente_id) return;
        // Regola: fonte di verita' = stato_contabile + data_scadenza (gestionale).
        if (s.stato_contabile !== "Aperta") return;
        if (isPromemoria) {
          if (s.in_legale) return;
          if (!s.data_scadenza || String(s.data_scadenza) < oggi) return;
          const k = String(s.data_scadenza).slice(0, 7);
          if (mesiSet.size > 0 && !mesiSet.has(k)) return;
        } else {
          // Scaduto: Aperta + data_scadenza nel passato
          if (!s.data_scadenza || String(s.data_scadenza) >= oggi) return;
        }
        importi[s.cliente_id] = (importi[s.cliente_id] ?? 0) + Number(s.importo_scadenza ?? 0);
      });
    }

    // Inserisci destinatari a batch (RLS valida cliente per cliente).
    // Se l'utente ha corretto/inserito un indirizzo in anteprima, lo persistiamo
    // subito in indirizzo_usato così il job lo userà direttamente.
    const overrides = data.indirizziCorretti ?? {};
    let saltatiCreazione = 0;
    const rows = clienteIds.map((cid) => {
      const ov = (overrides[cid] ?? "").trim();
      const base = {
        campagna_id: camp.id,
        cliente_id: cid,
        stato: "da_inviare" as string,
        importo_riferimento: importi[cid] ?? null,
        indirizzo_usato: ov ? ov : null,
      };
      if (!isProgressivo) return base;
      const st = stadi.get(cid);
      if (!st) {
        saltatiCreazione += 1;
        return { ...base, stato: "saltato_no_scaduto", motivo_salto: "Cliente non accessibile o non trovato" };
      }
      const esito = classificaDestinatarioProgressivo(st);
      if (esito.stato !== "da_inviare") {
        saltatiCreazione += 1;
        return { ...base, stato: esito.stato, motivo_salto: esito.motivo_salto };
      }
      return { ...base, livello: esito.livello, template_id: templatesProg![esito.livello].id };
    });
    const INSERT_BATCH = 500;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const slice = rows.slice(i, i + INSERT_BATCH);
      const { error: e2 } = await supabase
        .from("campagne_sollecito_destinatari")
        .insert(slice as never);
      if (e2) {
        // Rollback parziale: aggiorna la campagna come errore e propaga
        await supabase
          .from("campagne_sollecito")
          .update({ stato: "completata_con_errori", note: `Insert destinatari fallito: ${e2.message}` } as never)
          .eq("id", camp.id);
        throw new Error(`Insert destinatari fallito: ${e2.message}`);
      }
    }

    if (saltatiCreazione > 0) {
      await supabase
        .from("campagne_sollecito")
        .update({ saltati: saltatiCreazione } as never)
        .eq("id", camp.id);
    }

    // Invia evento Inngest dal server (chiavi disponibili in process.env)
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const INNGEST_API_KEY = process.env.INNGEST_API_KEY;
    if (!LOVABLE_API_KEY || !INNGEST_API_KEY) {
      await supabase
        .from("campagne_sollecito")
        .update({ stato: "completata_con_errori", note: "Inngest non configurato (chiavi mancanti)" } as never)
        .eq("id", camp.id);
      throw new Error("Inngest non configurato");
    }

    const res = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": INNGEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "sollecito/invio-massivo.requested",
        data: { campagna_id: camp.id },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      await supabase
        .from("campagne_sollecito")
        .update({ stato: "completata_con_errori", note: `Invio evento fallito: ${txt.slice(0, 200)}` } as never)
        .eq("id", camp.id);
      throw new Error(`Trigger Inngest fallito [${res.status}]`);
    }

    return { campagna_id: camp.id as string, totale: clienteIds.length };
  });

const RiprovaSchema = z.object({
  campagnaId: z.string().uuid(),
});

/**
 * Riporta a 'da_inviare' tutte le righe 'fallito' (e 'saltato_no_indirizzo'
 * che ora hanno un indirizzo valido per la preferenza configurata) e rilancia il job.
 */
export const riprovaCampagnaFalliti = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RiprovaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertPuoInviareRecupero(supabase);

    const { data: camp, error: ec } = await supabase
      .from("campagne_sollecito")
      .select("id, stato, preferenza_indirizzo")
      .eq("id", data.campagnaId)
      .maybeSingle();
    if (ec || !camp) throw new Error("Campagna non trovata");

    // Recupera righe da riprovare
    const { data: rows } = await supabase
      .from("campagne_sollecito_destinatari")
      .select("id, cliente_id, stato")
      .eq("campagna_id", data.campagnaId)
      .in("stato", ["fallito", "saltato_no_indirizzo"]);

    const toReset: string[] = [];
    const candidateIds = (rows ?? []).map((r) => r.cliente_id);
    if (candidateIds.length === 0) {
      return { riprovati: 0, campagna_id: data.campagnaId };
    }

    // Per i 'saltato_no_indirizzo' includo solo se ora ha un indirizzo
    const pref = camp.preferenza_indirizzo as "email" | "pec";
    const { data: clienti } = await supabase
      .from("clienti")
      .select("id, email, pec")
      .in("id", candidateIds);
    const map = new Map<string, { email: string | null; pec: string | null }>();
    (clienti ?? []).forEach((c) => map.set(c.id, { email: c.email, pec: c.pec }));

    for (const r of rows ?? []) {
      if (r.stato === "fallito") {
        toReset.push(r.id);
      } else {
        const ci = map.get(r.cliente_id);
        const primary = pref === "email" ? ci?.email : ci?.pec;
        const secondary = pref === "email" ? ci?.pec : ci?.email;
        if ((primary && primary.trim()) || (secondary && secondary.trim())) {
          toReset.push(r.id);
        }
      }
    }

    if (toReset.length === 0) {
      return { riprovati: 0, campagna_id: data.campagnaId };
    }

    // Reset stato → 'da_inviare' (e azzera errore/indirizzo cosi prepara() li ricalcola)
    const CHUNK = 200;
    for (let i = 0; i < toReset.length; i += CHUNK) {
      const slice = toReset.slice(i, i + CHUNK);
      await supabase
        .from("campagne_sollecito_destinatari")
        .update({ stato: "da_inviare", errore: null, indirizzo_usato: null } as never)
        .in("id", slice);
    }

    // Riallinea contatori della campagna ai destinatari attuali e riapri stato
    const { count: cInviati } = await supabase
      .from("campagne_sollecito_destinatari")
      .select("*", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "inviato");
    const { count: cSaltati } = await supabase
      .from("campagne_sollecito_destinatari")
      .select("*", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "saltato_no_indirizzo");
    const { count: cFalliti } = await supabase
      .from("campagne_sollecito_destinatari")
      .select("*", { count: "exact", head: true })
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "fallito");

    await supabase
      .from("campagne_sollecito")
      .update({
        stato: "in_coda",
        inviati: cInviati ?? 0,
        saltati: cSaltati ?? 0,
        falliti: cFalliti ?? 0,
        completata_at: null,
      } as never)
      .eq("id", data.campagnaId);

    // Trigger Inngest
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const INNGEST_API_KEY = process.env.INNGEST_API_KEY;
    if (!LOVABLE_API_KEY || !INNGEST_API_KEY) {
      throw new Error("Inngest non configurato");
    }
    const res = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": INNGEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "sollecito/invio-massivo.requested",
        data: { campagna_id: data.campagnaId },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Trigger Inngest fallito [${res.status}]: ${txt.slice(0, 200)}`);
    }

    return { riprovati: toReset.length, campagna_id: data.campagnaId };
  });

const IdSchema = z.object({ campagnaId: z.string().uuid() });

/**
 * Annulla una campagna in 'in_coda' o 'in_corso'.
 * - campagna.stato => 'annullata'
 * - destinatari 'da_inviare' => 'annullato' (gli 'inviato' restano intatti)
 * Il job Inngest, prima di ogni blocco e nello step prepara, verifica lo stato e si ferma.
 */
export const annullaCampagnaSollecito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: camp, error: ec } = await supabase
      .from("campagne_sollecito")
      .select("id, stato")
      .eq("id", data.campagnaId)
      .maybeSingle();
    if (ec || !camp) throw new Error("Campagna non trovata");
    if (camp.stato !== "in_coda" && camp.stato !== "in_corso") {
      throw new Error(`Impossibile annullare una campagna in stato "${camp.stato}"`);
    }

    // Marca campagna annullata (il job leggerà questo stato al guard)
    const { error: eu } = await supabase
      .from("campagne_sollecito")
      .update({ stato: "annullata", completata_at: new Date().toISOString() } as never)
      .eq("id", data.campagnaId);
    if (eu) throw new Error(`Annullamento fallito: ${eu.message}`);

    // Le righe ancora da inviare diventano 'annullato'. 'inviato' resta intatto.
    const { error: ed } = await supabase
      .from("campagne_sollecito_destinatari")
      .update({ stato: "annullato" } as never)
      .eq("campagna_id", data.campagnaId)
      .eq("stato", "da_inviare");
    if (ed) throw new Error(`Aggiornamento destinatari fallito: ${ed.message}`);

    return { ok: true, campagna_id: data.campagnaId };
  });

/**
 * Elimina una campagna in stato terminale (completata / completata_con_errori / annullata).
 * Cancella SOLO campagne_sollecito e campagne_sollecito_destinatari collegati.
 * Le azioni_recupero create dagli invii reali NON vengono toccate
 * (nessuna FK le collega: restano nella timeline del cliente).
 */
export const eliminaCampagnaSollecito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: camp, error: ec } = await supabase
      .from("campagne_sollecito")
      .select("id, stato")
      .eq("id", data.campagnaId)
      .maybeSingle();
    if (ec || !camp) throw new Error("Campagna non trovata");

    const terminali = ["completata", "completata_con_errori", "annullata"];
    if (!terminali.includes(camp.stato)) {
      throw new Error(
        `Impossibile eliminare: la campagna è in stato "${camp.stato}". Annullala prima.`,
      );
    }

    // 1) destinatari (le azioni_recupero referenziate restano vive: nessuna FK)
    const { error: e1 } = await supabase
      .from("campagne_sollecito_destinatari")
      .delete()
      .eq("campagna_id", data.campagnaId);
    if (e1) throw new Error(`Eliminazione destinatari fallita: ${e1.message}`);

    // 2) campagna
    const { error: e2 } = await supabase
      .from("campagne_sollecito")
      .delete()
      .eq("id", data.campagnaId);
    if (e2) throw new Error(`Eliminazione campagna fallita: ${e2.message}`);

    return { ok: true, campagna_id: data.campagnaId };
  });

