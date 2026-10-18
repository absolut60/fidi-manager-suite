// Fonte unica del tooltip "testo dell'azione di recupero" (icone/etichette tipo + data).
// Le azioni si caricano solo all'apertura: il contenuto è montato solo a tooltip aperto,
// quindi useAzioniRecuperoCliente non parte al caricamento della pagina. Stessa cache
// del tab attività e della striscia dello scadenziario.
import { useMemo, type ReactNode } from "react";
import { TooltipDettaglio } from "@/components/tooltip-dettaglio";
import { useAzioniRecuperoCliente, useOperatoriAttivita, type Azione } from "@/hooks/use-azioni-recupero-cliente";
import { ESITO_AZIONE_LABEL, TIPO_AZIONE_LABEL, isPromessaPagamento, testoAzione, tipoAzioneVisualizzato } from "@/lib/azioni-recupero-ui";
import { formatEuro } from "@/lib/fidi";
import { labelStatoPromessa } from "@/components/stato-promessa";

export type CriterioAzioneRecupero =
  | { azione: Azione }
  | { clienteId: string; id: string }
  | { clienteId: string; tipo: string | null; data: string | null }
  | { clienteId: string; prossima: true }
  | { clienteId: string; ultimaFatta: true }
  | { clienteId: string; promessaData: string | null };

function fmtDataOra(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtGiorno(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, g] = iso.slice(0, 10).split("-");
  return y && m && g ? `${g}/${m}/${y}` : iso;
}

function ms(v: string | null | undefined) {
  return v ? new Date(v).getTime() : NaN;
}

function Dettaglio({ criterio, intestazione, etichetta }: {
  criterio: CriterioAzioneRecupero;
  intestazione?: ReactNode;
  etichetta?: string;
}) {
  const inMemoria = "azione" in criterio ? criterio.azione : null;
  const clienteId = inMemoria ? null : (criterio as { clienteId: string }).clienteId;
  // Con l'azione già in memoria la query non parte (clienteId null).
  const { azioni, isLoading, prossima, ultimaFatta } = useAzioniRecuperoCliente(clienteId);
  const { data: operatori } = useOperatoriAttivita();

  const azione = useMemo<Azione | null>(() => {
    if (inMemoria) return inMemoria;
    const lista = azioni ?? [];
    if ("id" in criterio) return lista.find((a) => a.id === criterio.id) ?? null;
    if ("prossima" in criterio) return prossima;
    if ("ultimaFatta" in criterio) return ultimaFatta;
    if ("promessaData" in criterio) {
      if (!criterio.promessaData) return null;
      const g = criterio.promessaData.slice(0, 10);
      return lista.find((a) => isPromessaPagamento(a) && (a.data_promessa_pagamento ?? "").slice(0, 10) === g) ?? null;
    }
    if ("tipo" in criterio) {
      if (!criterio.tipo) return null;
      const stessoTipo = lista.filter((a) => a.tipo === criterio.tipo || tipoAzioneVisualizzato(a) === criterio.tipo);
      const t = ms(criterio.data);
      const esatta = Number.isNaN(t) ? undefined : stessoTipo.find((a) => ms(a.data_azione) === t);
      if (esatta) return esatta;
      return [...stessoTipo].sort((a, b) => ms(b.data_azione) - ms(a.data_azione))[0] ?? null;
    }
    return null;
  }, [inMemoria, azioni, prossima, ultimaFatta, criterio]);

  const operatore = (() => {
    if (!azione?.operatore_id) return null;
    const o = (operatori ?? []).find((x) => x.id === azione.operatore_id);
    if (!o) return null;
    return `${o.nome ?? ""} ${o.cognome ?? ""}`.trim() || null;
  })();

  const isPromessa = "promessaData" in criterio || (azione != null && isPromessaPagamento(azione));
  const testo = azione ? testoAzione(azione) : null;
  const caricamento = !inMemoria && isLoading;

  return (
    <div className="space-y-1 text-left">
      {intestazione && <div className="font-medium">{intestazione}</div>}
      {isPromessa ? (
        <>
          <div className={intestazione ? "" : "font-medium"}>
            {etichetta && !("promessaData" in criterio) ? `${etichetta}: ` : ""}Promessa di pagamento{(() => { const d = "promessaData" in criterio ? criterio.promessaData : azione?.data_promessa_pagamento; return d ? ` · scadenza promessa ${fmtGiorno(d)}` : ""; })()}
          </div>
          {azione?.importo_riferimento != null && <div>Importo: {formatEuro(azione.importo_riferimento)}</div>}
          {azione && <div>Stato: {labelStatoPromessa(azione.stato_promessa)}</div>}
        </>
      ) : azione ? (
        <div>
          {etichetta ? `${etichetta}: ` : ""}
          {TIPO_AZIONE_LABEL[tipoAzioneVisualizzato(azione)] ?? azione.tipo}
          {azione.data_azione ? ` del ${fmtDataOra(azione.data_azione)}` : ""}
          {operatore ? ` · ${operatore}` : ""}
          {azione.esito ? ` · ${ESITO_AZIONE_LABEL[azione.esito] ?? azione.esito}` : ""}
        </div>
      ) : null}
      {caricamento ? (
        <div className="opacity-80">Caricamento…</div>
      ) : testo ? (
        <div className="line-clamp-6 whitespace-pre-line break-words opacity-90">{testo}</div>
      ) : !azione ? (
        <div className="opacity-80">Testo dell'azione non disponibile</div>
      ) : null}
    </div>
  );
}

export function TooltipAzioneRecupero({ criterio, children, intestazione, etichetta, side = "top" }: {
  criterio: CriterioAzioneRecupero;
  /** Trigger (icona/etichetta): un singolo elemento che accetta ref (asChild). */
  children: ReactNode;
  intestazione?: ReactNode;
  /** Prefisso della riga tipo/data, es. "Ultima", "Prossima". */
  etichetta?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipDettaglio side={side} contenuto={() => <Dettaglio criterio={criterio} intestazione={intestazione} etichetta={etichetta} />}>
      {children}
    </TooltipDettaglio>
  );
}
