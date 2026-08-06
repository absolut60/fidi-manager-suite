import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Mesi attivi negli ultimi 12 per cliente (numero di mesi con fatturato).
 *
 * La matview `fatturato_mensile_cliente` non e' esposta alla Data API, quindi
 * l'aggregazione avviene lato server. Il risultato viene filtrato agli id
 * clienti visibili al chiamante (RLS su `clienti` tramite context.supabase),
 * cosi' uno store manager non riceve dati fuori dal proprio ambito.
 * Sola lettura: nessuna scrittura sul database.
 */
export const getMesiAttiviUltimi12 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // 1) id clienti visibili al chiamante
    const visibili = new Set<string>();
    const PAGE = 1000;
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await supabase
        .from("clienti")
        .select("id")
        .range(off, off + PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = data ?? [];
      for (const r of batch) visibili.add(r.id as string);
      if (batch.length < PAGE) break;
      if (off > 200_000) break;
    }

    // 2) mesi con fatturato negli ultimi 12 mesi
    const oggi = new Date();
    const cutoff = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() - 11, 1))
      .toISOString()
      .slice(0, 10);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const conteggio: Record<string, number> = {};
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await (supabaseAdmin as any)
        .from("fatturato_mensile_cliente")
        .select("cliente_id")
        .gte("mese", cutoff)
        .gt("importo_lordo", 0)
        .range(off, off + PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = (data ?? []) as Array<{ cliente_id: string | null }>;
      for (const r of batch) {
        const id = r.cliente_id;
        if (id && visibili.has(id)) conteggio[id] = (conteggio[id] ?? 0) + 1;
      }
      if (batch.length < PAGE) break;
      if (off > 500_000) break;
    }

    return conteggio;
  });
