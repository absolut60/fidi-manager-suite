import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recuperaESalvaLightReport } from "./cerved.server";
import { RUOLI_AGGIORNANO_CERVED } from "@/lib/permessi-cerved";

/** Rilegge lo stato prima del recupero; la transizione e gli avvisi sono atomici nel DB. */
export async function recuperaReportCervedInAttesa(id: string) {
  const { data: report, error } = await supabaseAdmin.from("cerved_report")
    .select("id, cliente_id, id_soggetto, request_id, stato").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!report || report.stato !== "in_attesa") return { saltato: true };
  let erroreRecupero: string | null = null;
  try {
    await recuperaESalvaLightReport({ ...report, id_soggetto: Number(report.id_soggetto) }, {
      utenteId: null, clienteId: report.cliente_id,
    });
  } catch (e) {
    erroreRecupero = e instanceof Error ? e.message : String(e);
    console.error("[cerved] recupero automatico fallito", id, erroreRecupero);
  }
  const { data: bloccato, error: eBlocco } = await supabaseAdmin.rpc("blocca_report_cerved_e_notifica", {
    _report_id: id, _ruoli: [...RUOLI_AGGIORNANO_CERVED],
  });
  if (eBlocco) throw new Error(eBlocco.message);
  return { saltato: false, bloccato, erroreRecupero };
}