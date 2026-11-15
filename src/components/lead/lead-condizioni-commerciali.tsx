import { useQuery } from "@tanstack/react-query";
import { CondizionePagamentoRichiestaSelect, CondizionePagamentoTesto } from "@/components/condizione-pagamento-richiesta-select";
import { CondizioniRiferimento } from "@/components/preventivatore/CondizioniRiferimento";
import { Label } from "@/components/ui/label";
import { opzioniCataloghiRiferimento, testoRiferimentoPreventivo } from "@/lib/condizioni-riferimento";
import type { CondizioniCommercialiLead } from "@/lib/lead-condizioni-commerciali";

/** Montato solo nel perimetro puoConsultarePreventivi; cataloghi condivisi e RLS utente. */
export function LeadCondizioniCommerciali({ valori, modifica = false, onValori, onAttivo }: {
  valori: CondizioniCommercialiLead; modifica?: boolean;
  onValori?: (patch: Partial<CondizioniCommercialiLead>) => void;
  onAttivo?: (attivo: boolean) => void;
}) {
  const cataloghi = useQuery(opzioniCataloghiRiferimento);
  return <div className="min-w-0 space-y-3">
    <p className="text-xs text-muted-foreground">Precompilano i preventivi di questo lead</p>
    {modifica ? <>
      <div className="grid min-w-0 gap-1"><Label>Condizione di pagamento</Label><CondizionePagamentoRichiestaSelect size="sm" ariaLabel="Condizione di pagamento del lead" value={valori.condizione_pagamento_cod ?? ""} onChange={cod => onValori?.({ condizione_pagamento_cod: cod || null })}/></div>
      <CondizioniRiferimento riferimento={valori} cataloghi={cataloghi.data} caricamento={cataloghi.isPending} errore={cataloghi.error?.message} modificabile obbligatorio={false} onAttivo={onAttivo} onValori={onValori} onSave={async patch => { onValori?.(patch); }}/>
    </> : <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="min-w-0"><p className="text-xs font-medium uppercase text-muted-foreground">Condizione di pagamento</p><p className="mt-0.5 break-words text-sm"><CondizionePagamentoTesto cod={valori.condizione_pagamento_cod}/></p></div>
      <div className="min-w-0"><p className="text-xs font-medium uppercase text-muted-foreground">Condizioni di riferimento</p><p className="mt-0.5 break-words text-sm">{testoRiferimentoPreventivo(valori, cataloghi.data) ?? "—"}</p>{cataloghi.error && <p role="alert" className="text-xs text-destructive">{cataloghi.error.message}</p>}</div>
    </div>}
  </div>;
}