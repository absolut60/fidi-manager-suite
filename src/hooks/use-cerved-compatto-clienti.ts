import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ScoreCervedVista } from "@/lib/cerved-presentazione";
import { idSoggettiDiEntita } from "@/lib/cerved/cerved-letture";

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
      // FM90: fotografie per id_soggetto; il risultato resta per cliente.
      const soggetti = await idSoggettiDiEntita("cliente", ids);
      const clientiDi = new Map<number, string[]>();
      for (const [c, s] of soggetti) clientiDi.set(s, [...(clientiDi.get(s) ?? []), c]);
      const idSoggetti = [...clientiDi.keys()];
      for (let i = 0; i < idSoggetti.length; i += BLOCCO) {
        const blocco = idSoggetti.slice(i, i + BLOCCO);
        const { data, error } = await supabase.from("cerved_fotografie")
          .select("id_soggetto, tipo, letta_il, score_cgs:dati->score_cgs, fido_certificato:dati->fido_certificato, scores:dati->scores")
          .in("id_soggetto", blocco).in("tipo", ["light_report", "score"])
          .order("letta_il", { ascending: false });
        if (error) throw error;
        for (const r of (data ?? []) as any[]) {
          for (const cliente of clientiDi.get(r.id_soggetto) ?? []) {
            const c = (out[cliente] ??= { lightReport: null, scores: null });
            if (r.tipo === "light_report" && c.lightReport == null) c.lightReport = { score_cgs: r.score_cgs, fido_certificato: r.fido_certificato };
            if (r.tipo === "score" && c.scores == null && Array.isArray(r.scores)) c.scores = r.scores;
          }
        }
      }
      return out;
    },
  });
}
