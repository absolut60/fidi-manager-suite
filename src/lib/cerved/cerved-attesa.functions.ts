import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Recupero esclusivamente gratuito di un report esistente, con permesso e lettura RLS. */
export const riprovaReportCerved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reportId: string }) => z.object({ reportId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: puo, error: errPerm } = await context.supabase.rpc("auth_puo_aggiornare_cerved");
    if (errPerm || !puo) throw new Error("Non hai il permesso di aggiornare i dati Cerved");
    const { data: report, error } = await context.supabase.from("cerved_report")
      .select("id, cliente_id, lead_id, id_soggetto, request_id, stato").eq("id", data.reportId).maybeSingle();
    if (error || !report) throw new Error("Report Cerved non trovato");
    if (report.stato === "consegnato") return { xml_ok: true, errori: [] as string[] };
    const { recuperaESalvaLightReport } = await import("./cerved.server");
    return recuperaESalvaLightReport({ ...report, id_soggetto: Number(report.id_soggetto) }, {
      utenteId: context.userId, clienteId: report.cliente_id,
    });
  });