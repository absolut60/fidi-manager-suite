import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ScoreCervedVista } from "@/lib/cerved-presentazione";

/** Per cliente: estratto dell'ultimo Light Report e dell'ultima fotografia 'score'. */
export type CervedCompattoCliente = {
  lightReport: { score_cgs: any; fido_certificato: any } | null;
  scores: ScoreCervedVista[] | null;
};

/** Chiave dedicata (forma: Record<clienteId, CervedCompattoCliente>), non condivisa con altre letture. */
export const chiaveCervedCompattoClienti = (ids: string[]) =>
  ["cerved-compatto-clienti-record", [...ids].sort().join(",")] as const;

const BLOCCO = 150;

/**
 * Lettura batch con RLS per la sezione Cerved compatta: una query per blocco di clienti
 * (non una per riga). Restituisce un oggetto semplice, sempre definito, mai una Map.
 */
export function useCervedCompattoClienti(ids: string[], enabled = true) {
  return useQuery({
    queryKey: chiaveCervedCompattoClienti(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, CervedCompattoCliente>> => {
      const out: Record<string, CervedCompattoCliente> = {};
      const unici = [...new Set(ids)];
      for (let i = 0; i < unici.length; i += BLOCCO) {
        const blocco = unici.slice(i, i + BLOCCO);
        const { data, error } = await supabase.from("cerved_fotografie")
          .select("cliente_id, tipo, letta_il, score_cgs:dati->score_cgs, fido_certificato:dati->fido_certificato, scores:dati->scores")
          .in("cliente_id", blocco).in("tipo", ["light_report", "score"])
          .order("letta_il", { ascending: false });
        if (error) throw error;
        for (const r of (data ?? []) as any[]) {
          const c = (out[r.cliente_id] ??= { lightReport: null, scores: null });
          if (r.tipo === "light_report" && c.lightReport == null) c.lightReport = { score_cgs: r.score_cgs, fido_certificato: r.fido_certificato };
          if (r.tipo === "score" && c.scores == null && Array.isArray(r.scores)) c.scores = r.scores;
        }
      }
      return out;
    },
  });
}
