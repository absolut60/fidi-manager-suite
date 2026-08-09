/**
 * Card e pulsante per il ricalcolo del precalcolo persistente del fido teorico.
 * La logica di calcolo resta nella RPC canonica get_fido_teorico: qui si
 * innesca solo la funzione SQL public.ricalcola_fido_teorico().
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Calculator, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ricalcolaFidoTeorico } from "@/lib/fido-teorico-precalcolo.functions";

function formatData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} del ${d.toLocaleDateString("it-IT")}`;
}

function useStatoPrecalcolo() {
  return useQuery({
    queryKey: ["fido-teorico-precalcolo-stato"],
    queryFn: async () => {
      const [cfg, cnt, imp] = await Promise.all([
        supabase
          .from("configurazioni")
          .select("valore")
          .eq("chiave", "fido_teorico_ultimo_ricalcolo")
          .maybeSingle(),
        supabase
          .from("fido_teorico_cliente" as never)
          .select("cliente_id", { count: "exact", head: true }),
        supabase
          .from("importazioni")
          .select("created_at")
          .in("stato", ["completata", "completata_con_errori"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        ultimoRicalcolo: (cfg.data?.valore as string | undefined) ?? null,
        righe: cnt.count ?? 0,
        ultimoImport: (imp.data?.created_at as string | undefined) ?? null,
      };
    },
    staleTime: 30_000,
  });
}

function useRicalcolo() {
  const qc = useQueryClient();
  const fn = useServerFn(ricalcolaFidoTeorico);
  return useMutation({
    mutationFn: async () => await fn({ data: undefined as never }),
    onSuccess: () => {
      toast.success("Fido teorico ricalcolato");
      qc.invalidateQueries({ queryKey: ["fido-teorico-precalcolo-stato"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Ricalcolo non riuscito"),
  });
}

export function FidoTeoricoPrecalcoloCard() {
  const { data } = useStatoPrecalcolo();
  const ric = useRicalcolo();

  const ultimoRicalcolo = data?.ultimoRicalcolo ?? null;
  const ultimoImport = data?.ultimoImport ?? null;
  const daRicalcolare =
    !ultimoRicalcolo ||
    (!!ultimoImport && new Date(ultimoImport) > new Date(ultimoRicalcolo));

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Calculator className="size-5 text-primary mt-0.5 shrink-0" />
        <div>
          <h2 className="font-semibold">Fido teorico (precalcolo)</h2>
          <p className="text-sm text-muted-foreground">
            Calcola e conserva il fido teorico di tutti i clienti, a blocchi, usando la
            stessa regola della scheda cliente.
          </p>
        </div>
      </div>

      {daRicalcolare ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span>
            Sono stati importati dati più recenti dell'ultimo ricalcolo: conviene
            ricalcolare il fido teorico.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" /> Fido teorico già aggiornato
        </div>
      )}

      <div className="text-sm text-muted-foreground space-y-1">
        <p>
          {ultimoRicalcolo
            ? `Fido teorico aggiornato alle ${formatData(ultimoRicalcolo)}.`
            : "Nessun ricalcolo eseguito finora."}
        </p>
        <p>
          Clienti nel precalcolo:{" "}
          <span className="font-medium text-foreground tabular-nums">
            {(data?.righe ?? 0).toLocaleString("it-IT")}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant={daRicalcolare ? "default" : "secondary"}
          disabled={ric.isPending}
          onClick={() => ric.mutate()}
        >
          {ric.isPending && <Loader2 className="size-4 animate-spin" />}
          Ricalcola fido teorico ora
        </Button>
        {ric.isPending && (
          <span className="text-sm text-muted-foreground">
            Ricalcolo in corso… (può richiedere qualche secondo)
          </span>
        )}
      </div>
    </Card>
  );
}

/** Avviso compatto mostrato al termine di un import che incide sul fido. */
export function RicalcolaFidoTeoricoAvviso() {
  const ric = useRicalcolo();
  return (
    <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm space-y-2">
      <p>
        Import completato. I dati che influenzano il fido sono cambiati: vuoi ricalcolare
        il fido teorico ora?
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" disabled={ric.isPending} onClick={() => ric.mutate()}>
          {ric.isPending && <Loader2 className="size-4 animate-spin" />}
          Ricalcola fido teorico
        </Button>
        {ric.isPending && (
          <span className="text-xs text-muted-foreground">Ricalcolo in corso…</span>
        )}
        {ric.isSuccess && !ric.isPending && (
          <span className="text-xs text-success inline-flex items-center gap-1">
            <CheckCircle2 className="size-3.5" /> Fatto
          </span>
        )}
      </div>
    </div>
  );
}
