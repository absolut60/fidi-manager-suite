import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Collega (se serve) un cliente al suo soggetto Cerved e salva profilo e score
 * come nuove fotografie. Sola lettura verso Cerved: nessun acquisto.
 * Permesso: public.auth_puo_aggiornare_cerved() (gemello puoAggiornareCerved).
 */
export const aggiornaCervedCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clienteId: string }) => z.object({ clienteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
    if (errPerm || !puo) throw new Error("Non hai il permesso di aggiornare i dati Cerved");

    const { data: cli } = await context.supabase
      .from("clienti").select("id, ragione_sociale, partita_iva").eq("id", data.clienteId).maybeSingle();
    if (!cli) throw new Error("Cliente non trovato");

    const piva = String(cli.partita_iva ?? "").replace(/\D/g, "");
    if (piva.length !== 11) {
      throw new Error("Il cliente non ha una partita IVA valida: il collegamento a Cerved avviene tramite partita IVA");
    }

    const m = await import("./cerved.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const utente = context.userId;
    const ctx = { utenteId: utente, clienteId: cli.id };

    const { data: esistente, error: errLink } = await supabaseAdmin
      .from("cerved_soggetti").select("id_soggetto, denominazione_cerved").eq("cliente_id", cli.id).maybeSingle();
    if (errLink) throw new Error("Impossibile leggere il collegamento Cerved del cliente");

    let idSoggetto: number;
    let denominazione: string | null = esistente?.denominazione_cerved ?? null;
    let ricerca: null | { dati: ReturnType<typeof m.normalizzaAziendaCerved>; chiamata_id: string | null } = null;

    if (esistente) {
      idSoggetto = Number(esistente.id_soggetto);
    } else {
      const r = await m.cercaSoggettoPerPiva(piva, ctx);
      if (r.esito !== "ok") throw new Error(r.errore ?? "Ricerca su Cerved non riuscita");
      const scelta = m.scegliAziendaPerPiva(r.risposta, piva);
      if (!scelta) throw new Error("Nessuna azienda trovata su Cerved con questa partita IVA");
      const norm = m.normalizzaAziendaCerved(scelta);
      const id = Number(norm.id_soggetto);
      if (!norm.id_soggetto || !Number.isFinite(id)) throw new Error("Nessuna azienda trovata su Cerved con questa partita IVA");
      idSoggetto = id;
      denominazione = norm.denominazione;
      ricerca = { dati: norm, chiamata_id: r.chiamata_id };
    }

    const [p, s] = await Promise.all([
      m.leggiProfilo(String(idSoggetto), ctx),
      m.leggiScore(String(idSoggetto), ctx),
    ]);

    const ora = new Date().toISOString();
    if (esistente) {
      const { error } = await supabaseAdmin.from("cerved_soggetti")
        .update({ ultimo_aggiornamento: ora, aggiornato_da: utente }).eq("cliente_id", cli.id);
      if (error) throw new Error("Impossibile salvare l'aggiornamento Cerved del cliente");
    } else {
      const { error } = await supabaseAdmin.from("cerved_soggetti").insert({
        cliente_id: cli.id, id_soggetto: idSoggetto, partita_iva: piva, denominazione_cerved: denominazione,
        collegato_da: utente, ultimo_aggiornamento: ora, aggiornato_da: utente,
      });
      if (error) throw new Error("Impossibile salvare il collegamento Cerved del cliente");
    }

    const errori: string[] = [];
    const foto: { tipo: string; dati: unknown; chiamata_id: string | null }[] = [];
    if (ricerca) foto.push({ tipo: "ricerca", dati: ricerca.dati, chiamata_id: ricerca.chiamata_id });
    if (p.esito === "ok") foto.push({ tipo: "profilo", dati: m.normalizzaProfiloCerved(p.risposta), chiamata_id: p.chiamata_id });
    else errori.push(`Profilo: ${p.errore ?? "lettura non riuscita"}`);
    if (s.esito === "ok") foto.push({ tipo: "score", dati: { scores: m.normalizzaScoreCerved(s.risposta) }, chiamata_id: s.chiamata_id });
    else errori.push(`Score: ${s.errore ?? "lettura non riuscita"}`);

    if (foto.length) {
      const { error } = await supabaseAdmin.from("cerved_fotografie").insert(
        foto.map((f) => ({
          cliente_id: cli.id, id_soggetto: idSoggetto, tipo: f.tipo, dati: f.dati as never,
          chiamata_id: f.chiamata_id, letta_da: utente,
        })),
      );
      if (error) {
        console.error("[cerved] fotografie non salvate", error.message);
        errori.push("Non è stato possibile salvare i dati Cerved letti");
      }
    }

    return {
      nuovo_collegamento: !esistente,
      id_soggetto: idSoggetto,
      denominazione_cerved: denominazione,
      profilo_ok: p.esito === "ok",
      score_ok: s.esito === "ok",
      errori,
    };
  });
