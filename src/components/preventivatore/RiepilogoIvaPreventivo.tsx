import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { avvisiRegimeIva, regimeIvaValido, riepilogoIva } from "@/lib/calcolo-iva";
import { isRaccoglitorePosa } from "@/lib/riga-preventivo";
import type { BloccoConRighe } from "@/lib/preventivi-api";
import { formatNumeroIt } from "@/lib/numero-it";

const euro = (v: number) => `€ ${formatNumeroIt(v, { minDecimals: 2, maxDecimals: 2 })}`;

/** FM75 F3c: riepilogo IVA per aliquota, solo presentazione da riepilogoIva (i totali salvati restano su iva_perc fino a F3d). */
export function RiepilogoIvaPreventivo({ regime, ivaPerc, blocchi }: { regime: unknown; ivaPerc: number | null | undefined; blocchi: BloccoConRighe[] }) {
  const reg = regimeIvaValido(regime);
  const { r, avvisi } = useMemo(() => {
    const righe = blocchi.flatMap(b => b.righe);
    return {
      r: riepilogoIva({ regime: reg, ivaTestataPerc: ivaPerc, righe: righe.map(x => ({ importo: x.importo, bene_significativo: x.bene_significativo, aliquota_iva: x.aliquota_iva })) }),
      avvisi: avvisiRegimeIva(reg, righe.map(x => ({ bene_significativo: x.bene_significativo, posa: isRaccoglitorePosa(x.articolo_codice) }))),
    };
  }, [reg, ivaPerc, blocchi]);
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <p className="text-xs font-semibold text-muted-foreground">Riepilogo IVA</p>
      {r.voci.length === 0 && <p className="text-xs text-muted-foreground">Nessun importo.</p>}
      {r.voci.map(v => (
        <div key={v.aliquota} className="flex flex-wrap justify-between gap-x-3 border-b border-pv-azzurro-bordo py-1.5">
          <span className="text-muted-foreground">Imponibile al {formatNumeroIt(v.aliquota)}% {euro(v.imponibile)}</span>
          <strong className="tabular-nums">IVA {euro(v.iva)}</strong>
        </div>
      ))}
      {r.dettaglioBs && (
        <p className="text-xs text-muted-foreground break-words">
          Beni significativi {euro(r.dettaglioBs.totaleBeni)} su intervento {euro(r.dettaglioBs.totaleIntervento)} · quota al 22% = 2B − T = {euro(r.dettaglioBs.quota22)}
        </p>
      )}
      <div className="flex justify-between gap-3 py-1.5"><span className="text-muted-foreground">IVA totale</span><strong className="tabular-nums">{euro(r.ivaTotale)}</strong></div>
      <div className="flex justify-between gap-3 font-semibold"><span>Totale con IVA</span><span className="tabular-nums">{euro(r.totale)}</span></div>
      {avvisi.map(a => (
        <p key={a} role="status" className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-words">{a}</span>
        </p>
      ))}
    </div>
  );
}
