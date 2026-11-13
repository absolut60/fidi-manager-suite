import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** FM65: articoli Gamma attivi per il selettore della riga preventivo (senza prezzo: il prezzo segue il cliente). */
export const cercaArticoliPreventivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { testo: string }) => z.object({ testo: z.string().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("cerca_articoli", {
      testo: data.testo.trim(), famiglie: [], sottofamiglie: [], marche: [], fornitori: [],
      stati: ["in_uso", "in_esaurimento"], disponibile_in: [], disponibile_logistica: false,
      listino: null as unknown as number, _ordina: "codice", _direzione: "asc", limite: 30, offset: 0,
    });
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .filter((r) => r.origine === "gamma")
      .map((r) => ({ codice: r.codice, descrizione: r.descrizione, marca: r.marca, um: r.um }));
  });
