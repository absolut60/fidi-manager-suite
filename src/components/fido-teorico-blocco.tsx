/**
 * Blocco informativo "Fido teorico" (scheda cliente).
 * Solo lettura: riproduce la colonna FIDO PROPOSTO del file MD_FIDI tramite
 * la RPC canonica public.get_fido_teorico. NON modifica alcun fido esistente.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/lib/fidi";

const REGOLE: Record<string, string> = {
  sede_esclusa: "Sede esclusa dal calcolo — fido attuale invariato",
  esclusa_gruppo: "Società del gruppo esclusa dal calcolo — fido attuale invariato",
  condizione_mancante: "Condizione di pagamento mancante in anagrafica — impossibile calcolare",
  nessun_fatturato: "Nessun fatturato nella finestra di calcolo",
  minimo_500: "Fatturato solo nell'anno precedente — minimo 500 €",
  fascia_1000: "Fido base ≤ 5.000 € — arrotondato per eccesso a 1.000 €",
  fascia_5000: "Fido base > 5.000 € — arrotondato al multiplo di 5.000 € più vicino",
};

export function FidoTeoricoBlocco({ clienteId }: { clienteId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["fido-teorico", clienteId],
    enabled: !!clienteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_fido_teorico", {
        _cliente_ids: [clienteId],
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
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


  const regola = String(data.regola_applicata);
  const condizioneMancante = regola === "condizione_mancante";
  const giorniMancanti = !!data.giorni_mancanti;
  const scostamento = Number(data.scostamento ?? 0);
  const scostTone =
    scostamento > 0 ? "text-success" : scostamento < 0 ? "text-warning" : "text-muted-foreground";

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <h4 className="text-sm font-semibold">Fido teorico</h4>

      {condizioneMancante ? (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Cella label="Fatturato nella finestra" value={formatEuro(Number(data.fatturato_rolling ?? 0))} />
            <Cella label="Fido attuale" value={formatEuro(Number(data.fido_attuale ?? 0))} />
          </dl>
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            Condizione di pagamento mancante in anagrafica — impossibile calcolare il fido teorico.
          </div>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Cella label="Fatturato nella finestra" value={formatEuro(Number(data.fatturato_rolling ?? 0))} />
            <Cella
              label="Giorni di pagamento"
              value={giorniMancanti ? "—" : `${Number(data.giorni ?? 0)} gg`}
              hint={giorniMancanti ? "condizione di pagamento non riconosciuta" : undefined}
            />
            <Cella label="Fido teorico (base)" value={formatEuro(Number(data.fido_base ?? 0))} />
            <Cella label="Fido proposto" value={formatEuro(Number(data.fido_proposto ?? 0))} strong />
            <Cella label="Fido attuale" value={formatEuro(Number(data.fido_attuale ?? 0))} />
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scostamento</dt>
              <dd className={`mt-0.5 font-medium tabular-nums ${scostTone}`}>
                {scostamento > 0 ? "+" : ""}
                {formatEuro(scostamento)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">Regola applicata: {REGOLE[regola] ?? regola}</p>
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
