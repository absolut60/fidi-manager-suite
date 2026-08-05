/**
 * Blocco informativo "Fido teorico" (tab Fido della scheda cliente).
 * Solo lettura: riproduce la colonna FIDO PROPOSTO del file MD_FIDI tramite
 * la RPC canonica public.get_fido_teorico. NON modifica alcun fido esistente.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/lib/fidi";
import { Card } from "@/components/ui/card";
import { fetchFidoTeorico, REGOLA_DESCRIZIONE } from "@/lib/fido-teorico";

export function FidoTeoricoBlocco({
  clienteId,
  variant = "inline",
}: {
  clienteId: string;
  /** "inline" = dentro un'altra card · "card" = card autonoma */
  variant?: "inline" | "card";
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["fido-teorico", clienteId],
    enabled: !!clienteId,
    staleTime: 5 * 60_000,
    queryFn: async () => (await fetchFidoTeorico([clienteId])).get(clienteId) ?? null,
  });

  const { data: ultimoRefresh } = useQuery({
    queryKey: ["fatturato-mensile-ultimo-refresh"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("configurazioni")
        .select("valore")
        .eq("chiave", "fatturato_mensile_ultimo_refresh")
        .maybeSingle();
      return data?.valore ?? null;
    },
  });

  if (isLoading || !data) return null;

  const regola = data.regola_applicata;
  const condizioneMancante = regola === "condizione_mancante";
  const giorniMancanti = data.giorni_mancanti;
  const scostamento = data.scostamento;
  const scostTone =
    scostamento > 0 ? "text-success" : scostamento < 0 ? "text-warning" : "text-muted-foreground";

  const contenuto = (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Fido teorico</h4>
        <p className="text-xs text-muted-foreground">
          Valore indicativo calcolato sul fatturato e sulla condizione di pagamento.
        </p>
      </div>

      {condizioneMancante ? (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Cella label="Fatturato nella finestra" value={formatEuro(data.fatturato_rolling)} />
            <Cella label="Fido attuale" value={formatEuro(data.fido_attuale)} />
          </dl>
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            Condizione di pagamento mancante in anagrafica — impossibile calcolare il fido teorico.
          </div>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Cella label="Fatturato nella finestra" value={formatEuro(data.fatturato_rolling)} />
            <Cella
              label="Giorni di pagamento"
              value={giorniMancanti ? "—" : `${data.giorni} gg`}
              hint={giorniMancanti ? "condizione di pagamento non riconosciuta" : undefined}
            />
            <Cella label="Fido teorico (base)" value={formatEuro(data.fido_base)} />
            <Cella label="Fido proposto" value={formatEuro(data.fido_proposto)} strong />
            <Cella label="Fido attuale" value={formatEuro(data.fido_attuale)} />
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scostamento</dt>
              <dd className={`mt-0.5 font-medium tabular-nums ${scostTone}`}>
                {scostamento > 0 ? "+" : ""}
                {formatEuro(scostamento)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Regola applicata: {REGOLA_DESCRIZIONE[regola] ?? regola}
          </p>
        </>
      )}

      <p className="text-xs text-muted-foreground italic">
        Calcolo indicativo. Non modifica il fido in essere.
        {ultimoRefresh
          ? ` Dati fatturato aggiornati al ${new Date(ultimoRefresh).toLocaleString("it-IT")}.`
          : ""}
      </p>
    </div>
  );

  if (variant === "card") return <Card className="p-4 sm:p-5">{contenuto}</Card>;
  return <div className="mt-4 pt-4 border-t">{contenuto}</div>;
}


function Cella({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
      {hint && <p className="text-xs text-warning mt-0.5">{hint}</p>}
    </div>
  );
}
