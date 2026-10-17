// Dashboard compatta dello Scadenziario: indicatori in griglia fitta (2/3/5 colonne).
// Riceve solo numeri già calcolati dalle RPC (get_scadenziario_totali): nessun calcolo di business qui.
import type { ReactNode } from "react";
import { formatEuro } from "@/lib/fidi";

const eur0 = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

export type KpiScadenziario = {
  totScad: number;
  totAScad: number;
  clientiScad: number;
  bloccati: number;
  inLegale: number;
  nCrediti: number;
  totCrediti: number;
};

function Indicatore({ etichetta, valore, sotto, tono, titolo }: {
  etichetta: string; valore: string; sotto?: ReactNode; tono?: "destructive" | "warning" | "info"; titolo?: string;
}) {
  const bordo = tono === "destructive" ? "border-l-destructive" : tono === "warning" ? "border-l-orange-500" : tono === "info" ? "border-l-primary" : "border-l-border";
  return (
    <div className={`min-w-0 rounded-md border border-l-4 ${bordo} bg-card p-2.5 sm:p-3`} title={titolo}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-tight break-words">{etichetta}</p>
      <p className="mt-0.5 text-base sm:text-lg font-semibold tabular-nums leading-tight break-words">{valore}</p>
      {sotto && <p className="mt-0.5 text-[11px] text-muted-foreground leading-tight break-words">{sotto}</p>}
    </div>
  );
}

export function ScadenziarioKpi({ kpi, mostraACredito, netto, lordo }: {
  kpi: KpiScadenziario;
  mostraACredito: boolean;
  netto: boolean;
  /** Totali a filtro spento: usati solo per le righe "lordo"/"su N" quando netto è acceso. */
  lordo?: { totScad: number; clientiScad: number; totCrediti: number } | null;
}) {
  const scad = mostraACredito ? kpi.totScad + kpi.totCrediti : kpi.totScad;
  const scadLordo = lordo ? (mostraACredito ? lordo.totScad + lordo.totCrediti : lordo.totScad) : null;
  const sottoScad = netto && scadLordo != null
    ? `lordo ${eur0(scadLordo)}`
    : mostraACredito ? "netto note di credito" : undefined;
  const sottoClienti = netto && lordo
    ? `su ${lordo.clientiScad}`
    : mostraACredito && kpi.nCrediti > 0 ? `di cui ${kpi.nCrediti} a credito` : undefined;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <Indicatore
        etichetta="Scaduto" valore={formatEuro(scad)} sotto={sottoScad} tono="destructive"
        titolo={mostraACredito ? `Scaduto debitori: ${formatEuro(kpi.totScad)} − Note di credito: ${formatEuro(Math.abs(kpi.totCrediti))}` : undefined}
      />
      <Indicatore etichetta="Clienti con scaduto" valore={String(kpi.clientiScad)} sotto={sottoClienti} tono="warning" />
      <Indicatore etichetta="A scadere" valore={formatEuro(kpi.totAScad)} tono="info" />
      <Indicatore etichetta="Bloccati" valore={String(kpi.bloccati)} tono="destructive" />
      <Indicatore etichetta="In legale" valore={String(kpi.inLegale)} tono="warning" />
    </div>
  );
}

/** Riga piccola sotto l'importo scaduto di un cliente (tabella e schede). */
export function DettaglioCoperturaRiga({ lordo, piani, promesse, netto }: {
  lordo: number; piani: number; promesse: number; netto: boolean;
}) {
  const parti: string[] = [];
  if (piani > 0) parti.push(`piano ${formatEuro(piani)}`);
  if (promesse > 0) parti.push(`promessa ${formatEuro(promesse)}`);
  if (!netto && parti.length === 0) return null;
  return (
    <span className="block text-[11px] font-normal text-muted-foreground leading-tight break-words">
      {netto && <span className="block">lordo {formatEuro(lordo)}</span>}
      {parti.length > 0 && <span className="block">di cui {parti.join(" · ")}</span>}
    </span>
  );
}
