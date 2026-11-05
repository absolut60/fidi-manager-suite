/**
 * Presentazione del semaforo affidabilita'.
 *
 * NON calcola nulla: la logica vive in public.calcola_semaforo_affidabilita_batch
 * ed e' materializzata in public.fido_teorico_cliente.semaforo_stadio/_motivo.
 * Qui si mappa solo lo stadio alle classi/label della UI.
 */
import { formatEuro } from "@/lib/fidi";

export type SemaforoStadio = "rosso" | "arancione" | "giallo" | "verde" | "spento" | null;

export interface SemaforoUI {
  stadio: SemaforoStadio;
  dotClass: string;
  toneClass: string;
  textClass: string;
  label: string;
  motivo: string;
}

const MAP: Record<Exclude<SemaforoStadio, null>, Omit<SemaforoUI, "stadio" | "motivo">> = {
  rosso: {
    dotClass: "bg-destructive",
    toneClass: "bg-destructive/15 text-destructive",
    textClass: "text-destructive",
    label: "Rosso",
  },
  arancione: {
    dotClass: "bg-orange-500",
    toneClass: "bg-orange-500/15 text-orange-600",
    textClass: "text-orange-600",
    label: "Arancione",
  },
  giallo: {
    dotClass: "bg-warning",
    toneClass: "bg-warning/15 text-warning",
    textClass: "text-warning",
    label: "Giallo",
  },
  verde: {
    dotClass: "bg-success",
    toneClass: "bg-success/15 text-success",
    textClass: "text-success",
    label: "Verde",
  },
  spento: {
    dotClass: "bg-muted-foreground/40 ring-1 ring-muted-foreground/40",
    toneClass: "bg-muted text-muted-foreground",
    textClass: "text-muted-foreground",
    label: "Spento",
  },
};

const NEUTRO: Omit<SemaforoUI, "stadio" | "motivo"> = {
  dotClass: "bg-muted-foreground",
  toneClass: "bg-muted text-muted-foreground",
  textClass: "text-muted-foreground",
  label: "—",
};

export function semaforoUI(stadio: SemaforoStadio, motivo?: string | null): SemaforoUI {
  const base = stadio && MAP[stadio] ? MAP[stadio] : NEUTRO;
  return { stadio: stadio && MAP[stadio] ? stadio : null, ...base, motivo: motivo ?? "—" };
}

type FtcLike = { semaforo_stadio?: string | null; semaforo_motivo?: string | null };

/** Estrae stadio/motivo dall'embed fido_teorico_cliente (oggetto o array PostgREST). */
export function semaforoDaCliente(
  cliente: { fido_teorico_cliente?: FtcLike | FtcLike[] | null } | null | undefined,
): { stadio: SemaforoStadio; motivo: string | null } {
  const raw = cliente?.fido_teorico_cliente;
  const ftc: FtcLike | null = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);
  const s = ftc?.semaforo_stadio ?? null;
  const stadio = (s === "rosso" || s === "arancione" || s === "giallo" || s === "verde" || s === "spento" ? s : null) as SemaforoStadio;
  return { stadio, motivo: ftc?.semaforo_motivo ?? null };
}

/** Legenda per stadio (tooltip): descrive la regola di calcola_semaforo_affidabilita_batch (FM58). */
export const LEGENDA_STADIO: Record<Exclude<SemaforoStadio, null>, string> = {
  verde: "Paga regolarmente: negli ultimi 12 mesi ritardo medio entro 15 giorni",
  giallo: "Da tenere d'occhio: negli ultimi 12 mesi paga in media oltre 15 giorni dopo la scadenza, oppure ha uno scaduto sotto i 1.000 €",
  arancione: "A rischio: scaduto tra 1.000 e 10.000 €, oppure scaduto fermo da oltre 60 giorni",
  rosso: "Critico: scaduto oltre 10.000 €, insoluti, cliente bloccato o in gestione legale",
  spento: "Nessun pagamento registrato: cliente nuovo o senza storico",
};

/** Testo del numero accanto al pallino (numero/numero_unita dal DB). null = non mostrare. */
export function testoNumeroSemaforo(numero: number | null | undefined, unita: string | null | undefined): string | null {
  if (!unita || numero == null || !Number.isFinite(numero) || numero <= 0) return null;
  if (unita === "eur") return formatEuro(numero);
  if (unita === "gg") return `${Math.round(numero)} gg`;
  return null;
}
