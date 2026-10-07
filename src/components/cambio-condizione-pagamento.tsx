/**
 * Evidenza UNICA del "cambio condizioni di pagamento" di una richiesta fido.
 * Regola: condizionePagamentoCambiata (src/lib/fidi.ts). Descrizioni: useCodiciPagamento.
 * Se non c'è cambio non renderizza nulla.
 * Con la richiesta intera confronta con condPagRiferimento (condizione al momento della decisione)
 * e, se esito_condizione_pagamento è valorizzato, mostra l'esito della decisione.
 */
import { condizionePagamentoCambiata } from "@/lib/fidi";
import { mapRichiestaFido } from "@/lib/richieste-fido-data";
import { CondizionePagamentoTesto, etichettaCondizionePagamento, useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";
import { Badge } from "@/components/ui/badge";

type Props = {
  variant: "blocco" | "badge" | "riga";
  codProposta?: string | null;
  codAttuale?: string | null;
  descAttuale?: string | null;
  /** In alternativa ai codici: riga richieste_fido con join clienti (RICHIESTA_FIDO_SELECT). */
  richiesta?: Record<string, any> | null;
  /** Esito della decisione sulla condizione ('approvata'|'rifiutata'|null). Con `richiesta` viene letto da lì. */
  esito?: string | null;
  className?: string;
};

export function CambioCondizionePagamento({ variant, codProposta, codAttuale, descAttuale, richiesta, esito: esitoProp = null, className = "" }: Props) {
  const { data: codici } = useCodiciPagamento();
  let prop = codProposta ?? null;
  let att = codAttuale ?? null;
  let attDesc = descAttuale ?? null;
  let esito: string | null = esitoProp;
  if (richiesta) {
    const v = mapRichiestaFido(richiesta);
    prop = v.condPagProposta;
    att = v.condPagRiferimento;
    // la descrizione del gestionale vale solo se il riferimento è la condizione di oggi
    attDesc = v.condPagPrecedente ? null : v.condPagAttualeDesc;
    esito = v.esitoCondPag;
  }
  const approvato = esito === "approvata";
  const rifiutato = esito === "rifiutata";
  if (!condizionePagamentoCambiata(prop, att)) return null;

  const attuale = etichettaCondizionePagamento(codici, att, attDesc);
  const proposta = etichettaCondizionePagamento(codici, prop);

  if (variant === "badge") {
    return (
      <Badge
        variant="outline"
        className={`shrink-0 text-[10px] px-1.5 ${
          approvato
            ? "border-success/40 bg-success/10 text-success"
            : rifiutato
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-warning/40 bg-warning/10 text-warning"
        } ${className}`}
        title={`${attuale} → ${proposta}`}
      >
        {approvato ? "Cond. pag. approvata" : rifiutato ? "Cond. pag. rifiutata" : "Cambio cond. pag."}
      </Badge>
    );
  }

  if (variant === "riga") {
    return (
      <p className={`text-sm break-words ${className}`}>
        Questa richiesta propone anche il cambio della condizione di pagamento:{" "}
        <strong><CondizionePagamentoTesto cod={att} descFallback={attDesc} /></strong> → <strong><CondizionePagamentoTesto cod={prop} /></strong>
      </p>
    );
  }

  return (
    <div
      className={`grid min-w-0 grid-cols-1 gap-1 rounded-md border px-3 py-1.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-baseline sm:gap-3 ${
        approvato
          ? "border-success/40 bg-success/10"
          : rifiutato
            ? "border-destructive/30 bg-destructive/5"
            : "border-warning/40 bg-warning/10"
      } ${className}`}
    >
      <p className={`min-w-0 break-words text-xs font-semibold ${approvato ? "text-success" : rifiutato ? "text-destructive" : "text-warning"}`}>
        {approvato
          ? "Cambio condizione APPROVATO"
          : rifiutato
            ? "Cambio condizione NON approvato"
            : "Richiesta di cambio condizioni di pagamento"}
      </p>
      <p className="min-w-0 break-words text-xs">
        <span className="text-xs text-muted-foreground">{esito ? "Precedente" : "Attuale"}: </span>
        <CondizionePagamentoTesto cod={att} descFallback={attDesc} />
        {" → "}<span className="text-xs text-muted-foreground">Nuova proposta: </span>
        <CondizionePagamentoTesto cod={prop} />
      </p>
    </div>
  );
}
