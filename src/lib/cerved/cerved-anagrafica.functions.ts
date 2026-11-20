import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { puoAccedereLead, nomeLead } from "@/lib/lead-costanti";
import { pivaCifre } from "./cerved-entita";
import { inizioAnnoRicercheCerved, type RisultatoAnagraficaCerved } from "./cerved-anagrafica";

export const ricercaAnagraficaCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partitaIva: string; escludiLeadId?: string }) => z.object({
    partitaIva: z.string().max(40), escludiLeadId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<RisultatoAnagraficaCerved> => {
    // Identica guardia di accesso della pagina che offre Nuovo lead. Ruoli letti con RLS,
    // non dal browser: has_lead_module_access + agente/showroom/auth_preventivista.
    const [ruoli, mfa] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.rpc("auth_mfa_ok"),
    ]);
    if (ruoli.error || mfa.error || !mfa.data || !puoAccedereLead((ruoli.data ?? []).map(r => r.role))) {
      throw new Error("Non hai il permesso di creare lead");
    }
    const piva = pivaCifre(data.partitaIva);
    if (piva.length !== 11) throw new Error("Inserisci una partita IVA valida di 11 cifre");
    const m = await import("./cerved.server");
    const r = await m.cercaSoggettoPerPiva(piva, { utenteId: context.userId, clienteId: null });
    if (r.esito !== "ok" && r.http_status !== 404) throw new Error("Ricerca anagrafica Cerved non riuscita. Riprova più tardi");
    const scelta = r.esito === "ok" ? m.scegliAziendaPerPiva(r.risposta, piva) : null;

    // I wildcard generano solo candidati; il confronto finale avviene sulle cifre.
    // Paginazione completa e client dell'utente: nessun duplicato invisibile viene esposto.
    const pattern = `%${piva.split("").join("%")}%`;
    const clienti: RisultatoAnagraficaCerved["duplicati"]["clienti"] = [];
    const lead: RisultatoAnagraficaCerved["duplicati"]["lead"] = [];
    await Promise.all([
      (async () => {
        for (let offset = 0; ; offset += 500) {
          const { data: rows, error } = await context.supabase.from("clienti")
            .select("id, ragione_sociale, partita_iva").ilike("partita_iva", pattern).order("id").range(offset, offset + 499);
          if (error) throw new Error("Impossibile verificare i clienti con questa partita IVA");
          for (const row of rows ?? []) if (pivaCifre(row.partita_iva) === piva) clienti.push({ id: row.id, ragione_sociale: row.ragione_sociale });
          if (!rows || rows.length < 500) break;
        }
      })(),
      (async () => {
        for (let offset = 0; ; offset += 500) {
          const { data: rows, error } = await context.supabase.from("lead")
            .select("id, ragione_sociale, nome, cognome, partita_iva").ilike("partita_iva", pattern).order("id").range(offset, offset + 499);
          if (error) throw new Error("Impossibile verificare i lead con questa partita IVA");
          for (const row of rows ?? []) if (row.id !== data.escludiLeadId && pivaCifre(row.partita_iva) === piva) lead.push({ id: row.id, nome: nomeLead(row) });
          if (!rows || rows.length < 500) break;
        }
      })(),
    ]);
    if (!scelta) return { trovata: false, anagrafica: null, duplicati: { clienti, lead } };
    const a = m.normalizzaAziendaCerved(scelta);
    return { trovata: true, anagrafica: {
      denominazione: a.denominazione, partita_iva: a.partita_iva, codice_fiscale: a.codice_fiscale,
      indirizzo: a.sede?.indirizzo ?? null, cap: a.sede?.cap ?? null, comune: a.sede?.comune ?? null, provincia: a.sede?.provincia ?? null,
      forma_giuridica: a.forma_giuridica, ateco_2025_codice: a.ateco_2025_codice, ateco_2025_descrizione: a.ateco_2025_descrizione,
      stato_attivita_descrizione: a.stato_attivita_descrizione, operativa: a.operativa,
    }, duplicati: { clienti, lead } };
  });

/** Solo aggregato, dopo la guardia della card: nessuna risposta del registro viene esposta. */
export const contaRicercheAnagraficheCerved = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [permesso, mfa] = await Promise.all([
      context.supabase.rpc("auth_puo_aggiornare_cerved"), context.supabase.rpc("auth_mfa_ok"),
    ]);
    if (permesso.error || !permesso.data || mfa.error || !mfa.data) throw new Error("Non hai il permesso di leggere il contatore Cerved");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin.from("cerved_chiamate").select("id", { count: "exact", head: true })
      .eq("operazione", "entity_search").gte("created_at", inizioAnnoRicercheCerved());
    if (error || count === null) throw new Error("Impossibile leggere il contatore Cerved");
    return count;
  });