import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BackButton } from "@/components/back-button";
import type { StileVoce } from "./stili";

/** Cerchietto colorato con icona (fonte colori: stili.ts). */
export function IconaCerchio({ stile, size = "md", className }: { stile: StileVoce; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icona = stile.icona;
  const dim = size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10";
  const ico = size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5";
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full", dim, stile.tinta, className)}>
      <Icona className={ico} aria-hidden />
    </span>
  );
}

/**
 * Intestazione comune delle pagine Richieste interne.
 * Azioni a destra su desktop, sotto il titolo a tutta larghezza su mobile.
 */
export function IntestazioneRichieste({
  stile, titolo, sottotitolo, azioni, sopra, indietroA = "/richieste-interne",
}: {
  stile: StileVoce; titolo: ReactNode; sottotitolo?: ReactNode; azioni?: ReactNode; sopra?: ReactNode;
  /** Destinazione dell'Indietro quando non c'è cronologia (arrivo diretto). Dashboard → home. */
  indietroA?: "/" | "/richieste-interne";
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-start">
        <BackButton
          fallbackTo={indietroA}
          fallbackLabel={indietroA === "/" ? "Home" : "Richieste interne"}
          className="min-h-10"
        />
      </div>
      {sopra}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IconaCerchio stile={stile} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold break-words">{titolo}</h1>
            {sottotitolo && <div className="text-sm text-muted-foreground break-words">{sottotitolo}</div>}
          </div>
        </div>
        {azioni && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:shrink-0 [&_button]:min-h-10 [&>*]:w-full sm:[&>*]:w-auto">{azioni}</div>}
      </div>
    </div>
  );
}

/** Titolo card coerente: icona in cerchietto + testo. */
export function TitoloCard({ stile, children }: { stile: StileVoce; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold">
      <IconaCerchio stile={stile} size="sm" />
      {children}
    </span>
  );
}
