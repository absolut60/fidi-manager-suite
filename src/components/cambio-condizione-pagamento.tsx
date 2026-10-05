/**
 * Evidenza UNICA del "cambio condizioni di pagamento" di una richiesta fido.
 * Regola: condizionePagamentoCambiata (src/lib/fidi.ts). Descrizioni: useCodiciPagamento.
 * Se non c'è cambio non renderizza nulla.
 * Con la richiesta intera confronta con condPagRiferimento (condizione al momento della decisione)
 * e, se esito_condizione_pagamento è valorizzato, mostra l'esito della decisione.
 */
import { ArrowRight } from "lucide-react";
import { condizionePagamentoCambiata } from "@/lib/fidi";
import { mapRichiestaFido } from "@/lib/richieste-fido-data";
import { useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";
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

  const desc = (cod: string | null) =>
    cod ? (codici ?? []).find((c) => c.cod.toUpperCase() === cod.trim().toUpperCase())?.descrizione ?? null : null;
  const attuale = (att ?? "").trim() || "—";
  const proposta = (prop ?? "").trim();
  const descA = desc(att) ?? attDesc;
  const descP = desc(prop);

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
        <strong className="font-mono">{attuale}</strong> → <strong className="font-mono">{proposta}</strong>
      </p>
    );
  }

  return (
    <div
      className={`min-w-0 rounded-md border p-3 space-y-2 ${
        approvato
          ? "border-success/40 bg-success/10"
          : rifiutato
            ? "border-destructive/30 bg-destructive/5"
            : "border-warning/40 bg-warning/10"
      } ${className}`}
    >
      <p className={`text-sm font-semibold ${approvato ? "text-success" : rifiutato ? "text-destructive" : "text-warning"}`}>
        {approvato
          ? "Cambio condizione APPROVATO"
          : rifiutato
            ? "Cambio condizione NON approvato"
            : "Richiesta di cambio condizioni di pagamento"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-sm">
        <div className="min-w-0 break-words">
          <p className="text-xs text-muted-foreground">{esito ? "Precedente (al momento della decisione)" : "Attuale (gestionale)"}</p>
          <p><span className="font-mono font-medium">{attuale}</span>{descA ? ` — ${descA}` : ""}</p>
        </div>
        <ArrowRight className="hidden sm:block size-4 mt-5 text-warning" />
        <div className="min-w-0 break-words">
          <p className="text-xs text-muted-foreground">Nuova proposta</p>
          <p><span className="font-mono font-medium">{proposta}</span>{descP ? ` — ${descP}` : ""}</p>
        </div>
      </div>
    </div>
  );
}
