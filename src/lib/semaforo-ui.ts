/**
 * Presentazione del semaforo affidabilita'.
 *
 * NON calcola nulla: la logica vive in public.calcola_semaforo_affidabilita_batch
 * ed e' materializzata in public.fido_teorico_cliente.semaforo_stadio/_motivo.
 * Qui si mappa solo lo stadio alle classi/label della UI.
 */

export type SemaforoStadio = "rosso" | "arancione" | "giallo" | "verde" | null;

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
  const stadio = (s === "rosso" || s === "arancione" || s === "giallo" || s === "verde" ? s : null) as SemaforoStadio;
  return { stadio, motivo: ftc?.semaforo_motivo ?? null };
}
