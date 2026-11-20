import { Link } from "@tanstack/react-router";
import { nomeLead } from "@/lib/lead-costanti";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { puoAggiornareCerved } from "@/lib/permessi-cerved";
import { riprovaReportCerved } from "@/lib/cerved/cerved-attesa.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const chiave = ["cerved-report-in-attesa"];
const dataOra = (v: string | null) => v ? new Date(v).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";

export function ReportCervedAttesaCard() {
  const { roles, user } = useAuth();
  const puo = puoAggiornareCerved(roles);
  const qc = useQueryClient();
  const fn = useServerFn(riprovaReportCerved);
  const q = useQuery({
    queryKey: [...chiave, user?.id], enabled: puo,
    queryFn: async () => {
      const righe = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("cerved_report")
          .select("id, cliente_id, request_id, acquistato_il, tentativi_recupero, ultimo_tentativo_il, ultimo_esito_cerved, stato, lead_id, clienti(ragione_sociale), lead(ragione_sociale, nome, cognome)")
          .in("stato", ["in_attesa", "bloccato"]).order("acquistato_il").order("id").range(offset, offset + 499);
        if (error) throw error;
        righe.push(...(data ?? []));
        if (!data || data.length < 500) return righe;
      }
    },
  });
  const m = useMutation({
    mutationFn: (reportId: string) => fn({ data: { reportId } }),
    onSuccess: async r => {
      await qc.invalidateQueries({ queryKey: chiave });
      await qc.invalidateQueries({ queryKey: ["cerved-cliente"] });
      await qc.invalidateQueries({ queryKey: ["cerved-report"] });
      if (r.xml_ok) toast.success("Report Cerved consegnato");
      else if (r.errori.length) toast.error(r.errori.join(" · "));
      else toast.info("Report ancora in preparazione da Cerved");
    },
    onError: e => toast.error(e.message),
  });
  if (!puo) return null;
  return <Card className="min-w-0 p-4 sm:p-5">
    <h2 className="mb-3 font-semibold">Report Cerved in attesa</h2>
    {q.isPending ? <p className="text-sm text-muted-foreground">Caricamento…</p>
      : q.isError ? <p className="text-sm text-destructive">Impossibile leggere i report in attesa</p>
      : !q.data?.length ? <p className="text-sm text-muted-foreground">Nessun report in attesa</p>
      : <ul className="divide-y divide-border">{q.data.map(r => <li key={r.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {r.cliente_id
              ? <Link className="break-words font-medium text-primary hover:underline" to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} search={{ tab: "cerved" }}>{r.clienti?.ragione_sociale ?? "—"}</Link>
              : r.lead_id
                ? <Link className="break-words font-medium text-primary hover:underline" to="/lead/$leadId" params={{ leadId: r.lead_id }} search={{ tab: "cerved" }}>{r.lead ? nomeLead(r.lead) : "—"}</Link>
                : <p className="break-words font-medium">—</p>}
            <p className="break-words text-sm text-muted-foreground">Richiesta n. {r.request_id}</p>
          </div>
          <Badge variant={r.stato === "bloccato" ? "destructive" : "secondary"}>{r.stato === "bloccato" ? "Bloccato" : "In attesa"}</Badge>
        </div>
        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end">
          <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div><dt className="text-muted-foreground">Acquistato il</dt><dd>{dataOra(r.acquistato_il)}</dd></div>
            <div><dt className="text-muted-foreground">Tentativi</dt><dd>{r.tentativi_recupero.toLocaleString("it-IT")}</dd></div>
            <div><dt className="text-muted-foreground">Ultimo tentativo</dt><dd>{dataOra(r.ultimo_tentativo_il)}</dd></div>
            <div className="min-w-0"><dt className="text-muted-foreground">Ultimo esito Cerved</dt><dd className="break-words">{r.ultimo_esito_cerved ?? "—"}</dd></div>
          </dl>
          <Button variant="outline" className="h-11 shrink-0 gap-2" disabled={m.isPending} onClick={() => m.mutate(r.id)}><RefreshCw className="size-4" />{m.isPending && m.variables === r.id ? "Recupero…" : "Riprova ora"}</Button>
        </div>
      </li>)}</ul>}
  </Card>;
}