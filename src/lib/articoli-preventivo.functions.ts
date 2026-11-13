import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parametriArticoliPreventivo } from "./catalogo-articoli";

/** FM65: articoli Gamma attivi per il selettore della riga preventivo (senza prezzo: il prezzo segue il cliente). */
export const cercaArticoliPreventivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { testo: string; famiglie?: string[]; coppie?: string[]; marche?: string[] }) => z.object({ testo: z.string().max(200),
    famiglie: z.array(z.string().max(100)).max(500).default([]), coppie: z.array(z.string().max(200)).max(2000).default([]), marche: z.array(z.string().max(100)).max(2000).default([]) }).parse(input))
  .handler(async ({ data, context }) => {
    // FM65 F4: filtri a cascata (famiglie/coppie/marche) tradotti da parametriRicerca dentro parametriArticoliPreventivo.
    const { data: rows, error } = await context.supabase.rpc("cerca_articoli", parametriArticoliPreventivo(data.testo, data));
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .filter((r) => r.origine === "gamma") // rete di sicurezza: con solo_gamma non arrivano altre righe
      .map((r) => ({ codice: r.codice, descrizione: r.descrizione, marca: r.marca, um: r.um }));
  });
