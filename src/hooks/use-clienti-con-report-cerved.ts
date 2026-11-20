import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { classeCgsDaCodice } from "@/lib/cerved-presentazione";
import { idSoggettiDiEntita } from "@/lib/cerved/cerved-letture";

/** Stato Cerved per cliente della pagina: report presente, classe CGS (1–8) e score dell'ultimo Light Report. */
export type CervedClienteLista = { classe: number | null; score: number | null };

/** Chiave dedicata (forma: Map cliente_id → classe/score), non condivisa con altre letture. */
export const chiaveClientiConReportCerved = (ids: string[]) =>
  ["clienti-con-report-cerved", "v3", [...ids].sort().join(",")] as const;

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
      let soggetti: Map<string, number>;
      try { soggetti = await idSoggettiDiEntita("cliente", ids); } catch { return out; }
      // FM90: report e fotografie appartengono al soggetto; più clienti possono condividerlo.
      const clientiDi = new Map<number, string[]>();
      for (const [c, s] of soggetti) clientiDi.set(s, [...(clientiDi.get(s) ?? []), c]);
      const idSoggetti = [...clientiDi.keys()];
      for (let i = 0; i < idSoggetti.length; i += BLOCCO) {
        const blocco = idSoggetti.slice(i, i + BLOCCO);
        const { data, error } = await supabase
          .from("cerved_report")
          .select("id_soggetto")
          .in("id_soggetto", blocco);
        if (error) return out;
        const conReport = [...new Set(((data ?? []) as { id_soggetto: number }[]).map((r) => r.id_soggetto))];
        for (const s of conReport) for (const c of clientiDi.get(s) ?? []) out.set(c, { classe: null, score: null });
        if (conReport.length === 0) continue;
        const { data: foto, error: errFoto } = await supabase
          .from("cerved_fotografie")
          .select("id_soggetto, letta_il, cgs_codice:dati->score_cgs->>codice, cgs_valore:dati->score_cgs->>valore")
          .eq("tipo", "light_report")
          .in("id_soggetto", conReport)
          .order("letta_il", { ascending: false });
        if (errFoto) continue; // report noto, classe non disponibile
        const visti = new Set<number>();
        for (const f of (foto ?? []) as any[]) {
          if (visti.has(f.id_soggetto)) continue;
          visti.add(f.id_soggetto);
          const n = f.cgs_valore == null ? null : Number(f.cgs_valore);
          const v = { classe: classeCgsDaCodice(f.cgs_codice), score: n != null && Number.isFinite(n) ? n : null };
          for (const c of clientiDi.get(f.id_soggetto) ?? []) out.set(c, v);
        }
      }
      return out;
    },
  });
}
