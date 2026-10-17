// Riquadro "Coperture" dello Scadenziario: quanto dello scaduto è coperto da piani di rientro
// e promesse attive, più la previsione d'incasso per fascia.
// Fonti: get_scadenziario_totali (tot_coperto_*, n_clienti_coperti_*, n_promesse_da_verificare)
// e get_previsione_incassi_coperture (righe 'piano' / 'promessa'). Nessun ricalcolo qui.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, CalendarRange } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const QK_PREVISIONE_COPERTURE = "scadenziario-previsione-coperture";

const eur0 = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

type Previsione = {
  origine: string;
  totale_atteso: number | string | null;
  scaduto_non_incassato: number | string | null;
  entro_30: number | string | null;
  entro_60: number | string | null;
  entro_90: number | string | null;
  oltre_90: number | string | null;
  giorni_medi_rientro: number | string | null;
  n_data_passata: number | string | null;
  n_clienti: number | string | null;
};

export type CopertureTotali = {
  totCopertoPiani: number;
  totCopertoPromesse: number;
  nClientiPiani: number;
  nClientiPromesse: number;
  nDaVerificare: number;
};

const n = (v: unknown) => Number(v ?? 0) || 0;

function BarraPrevisione({ p, colore }: { p: Previsione | undefined; colore: "emerald" | "orange" }) {
  const toni = colore === "emerald"
    ? ["bg-emerald-700", "bg-emerald-500", "bg-emerald-400", "bg-emerald-300"]
    : ["bg-orange-700", "bg-orange-500", "bg-orange-400", "bg-orange-300"];
  const fasce = [
    { k: "Data passata", v: n(p?.scaduto_non_incassato), cls: "bg-destructive" },
    { k: "Entro 30 gg", v: n(p?.entro_30), cls: toni[0] },
    { k: "31-60 gg", v: n(p?.entro_60), cls: toni[1] },
    { k: "61-90 gg", v: n(p?.entro_90), cls: toni[2] },
    { k: "Oltre 90 gg", v: n(p?.oltre_90), cls: toni[3] },
  ];
  const tot = fasce.reduce((a, f) => a + f.v, 0);
  if (!p || tot <= 0) return <p className="text-[11px] text-muted-foreground">Nessun incasso previsto</p>;
  const giorni = p.giorni_medi_rientro != null ? Math.round(n(p.giorni_medi_rientro)) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Previsione d'incasso per fascia">
        {fasce.map((f) => f.v > 0 && <div key={f.k} className={f.cls} style={{ width: `${(f.v / tot) * 100}%` }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {fasce.filter((f) => f.v > 0).map((f) => (
          <li key={f.k} className="flex items-center gap-1 min-w-0">
            <span className={`size-2 rounded-full shrink-0 ${f.cls}`} />
            <span>{f.k}</span>
            <span className="tabular-nums text-foreground">{eur0(f.v)}</span>
            <span className="tabular-nums">({Math.round((f.v / tot) * 100)}%)</span>
          </li>
        ))}
      </ul>
      {giorni != null && <p className="text-[11px] text-muted-foreground">rientro medio {giorni} giorni</p>}
    </div>
  );
}

export function CopertureScadenziario({ totali, storeId, agente }: {
  totali: CopertureTotali;
  storeId: string | null;
  agente: string | null;
}) {
  const { data: previsione } = useQuery({
    queryKey: [QK_PREVISIONE_COPERTURE, storeId, agente],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_previsione_incassi_coperture" as never, { p_store_id: storeId, p_agente: agente } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Previsione[];
    },
  });
  const piano = previsione?.find((r) => r.origine === "piano");
  const promessa = previsione?.find((r) => r.origine === "promessa");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      <div className="min-w-0 rounded-md border bg-card p-2.5 sm:p-3 space-y-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <CalendarRange className="size-3.5 shrink-0" /> Piani di rientro
        </p>
        <div>
          <p className="text-sm break-words">
            <span className="font-semibold tabular-nums">{eur0(totali.totCopertoPiani)}</span> dello scaduto · {totali.nClientiPiani} {totali.nClientiPiani === 1 ? "cliente" : "clienti"}
          </p>
          <p className="text-[11px] text-muted-foreground">rate da incassare <span className="tabular-nums">{eur0(n(piano?.totale_atteso))}</span></p>
        </div>
        <BarraPrevisione p={piano} colore="emerald" />
      </div>
      <div className="min-w-0 rounded-md border bg-card p-2.5 sm:p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <HandCoins className="size-3.5 shrink-0" /> Promesse attive
          </p>
          {totali.nDaVerificare > 0 && (
            <Link
              to="/recupero-crediti-promesse"
              search={{ daVerificare: true } as never}
              className="text-xs font-medium text-destructive underline-offset-2 hover:underline py-1"
            >
              {totali.nDaVerificare} da verificare
            </Link>
          )}
        </div>
        <div>
          <p className="text-sm break-words">
            <span className="font-semibold tabular-nums">{eur0(totali.totCopertoPromesse)}</span> dello scaduto · {totali.nClientiPromesse} {totali.nClientiPromesse === 1 ? "cliente" : "clienti"}
          </p>
          <p className="text-[11px] text-muted-foreground">attese <span className="tabular-nums">{eur0(n(promessa?.totale_atteso))}</span></p>
        </div>
        <BarraPrevisione p={promessa} colore="orange" />
      </div>
    </div>
  );
}
