import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHIAVI = ["dso_aggregato", "dso_serie_24", "dashboard_fatturato"] as const;

/**
 * FM47: ricalcolo dei risultati pronti (public.cache_cruscotti) per DSO,
 * grafico DSO 24 mesi e fatturato dashboard. Uno step per voce (chiave ×
 * ambito) così ogni chiamata resta sotto il limite di 8 s e Inngest ritenta
 * solo il pezzo fallito. Dopo ogni import scadenziario e ogni notte.
 */
export const aggiornaCacheCruscotti = inngest.createFunction(
  {
    id: "aggiorna-cache-cruscotti",
    name: "Aggiorna risultati pronti cruscotti (DSO, fatturato)",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: "cruscotti/cache.aggiorna" }, { cron: "30 4 * * *" }],
  },
  async ({ step }) => {
    const ambiti = await step.run("ambiti", async (): Promise<string[]> => {
      const { data, error } = await supabaseAdmin.rpc("ambiti_cache_cruscotti" as never);
      if (error) throw new Error(`ambiti_cache_cruscotti: ${error.message}`);
      return ((data ?? []) as unknown[]).map((a) => String(a));
    });

    for (const ambito of ambiti) {
      for (const chiave of CHIAVI) {
        await step.run(`${chiave}-${ambito}`, async () => {
          const { error } = await supabaseAdmin.rpc(
            "refresh_cache_cruscotti" as never,
            { _chiave: chiave, _ambito: ambito } as never,
          );
          if (error) throw new Error(`refresh_cache_cruscotti ${chiave}/${ambito}: ${error.message}`);
          return true;
        });
      }
    }

    return { ambiti: ambiti.length, voci: ambiti.length * CHIAVI.length };
  },
);
