import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { classeCgsDaCodice } from "@/lib/cerved-presentazione";

/** Stato Cerved per cliente della pagina: report presente, classe CGS (1–8) e score dell'ultimo Light Report. */
export type CervedClienteLista = { classe: number | null; score: number | null };

/** Chiave dedicata (forma: Map cliente_id → classe/score), non condivisa con altre letture. */
export const chiaveClientiConReportCerved = (ids: string[]) =>
  ["clienti-con-report-cerved", "v2", [...ids].sort().join(",")] as const;

const BLOCCO = 150;

/**
 * FM84: lookup leggero e separato dalla lista clienti, solo sugli id della pagina visibile,
 * con il client autenticato (RLS cerved_report_select / cerved_fotografie_select già allineate
 * a chi vede il cliente). La Map contiene solo i clienti con report; classe e score vengono
 * dall'ultima fotografia 'light_report' (letta_il più recente), campo dati->score_cgs.
 * Il semaforo non è usato. Se una query fallisce: nessun simbolo/dettaglio, nessun errore a schermo.
 */
export function useClientiConReportCerved(ids: string[], enabled = true) {
  return useQuery({
    queryKey: chiaveClientiConReportCerved(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<Map<string, CervedClienteLista>> => {
      const out = new Map<string, CervedClienteLista>();
      const unici = [...new Set(ids)];
      for (let i = 0; i < unici.length; i += BLOCCO) {
        const blocco = unici.slice(i, i + BLOCCO);
        const { data, error } = await supabase
          .from("cerved_report")
          .select("cliente_id")
          .in("cliente_id", blocco);
        if (error) return out;
        const conReport = [...new Set(((data ?? []) as { cliente_id: string }[]).map((r) => r.cliente_id))];
        for (const id of conReport) out.set(id, { classe: null, score: null });
        if (conReport.length === 0) continue;
        const { data: foto, error: errFoto } = await supabase
          .from("cerved_fotografie")
          .select("cliente_id, letta_il, cgs_codice:dati->score_cgs->>codice, cgs_valore:dati->score_cgs->>valore")
          .eq("tipo", "light_report")
          .in("cliente_id", conReport)
          .order("letta_il", { ascending: false });
        if (errFoto) continue; // report noto, classe non disponibile
        const visti = new Set<string>();
        for (const f of (foto ?? []) as any[]) {
          if (visti.has(f.cliente_id)) continue;
          visti.add(f.cliente_id);
          const n = f.cgs_valore == null ? null : Number(f.cgs_valore);
          out.set(f.cliente_id, {
            classe: classeCgsDaCodice(f.cgs_codice),
            score: n != null && Number.isFinite(n) ? n : null,
          });
        }
      }
      return out;
    },
  });
}
