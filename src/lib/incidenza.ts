/**
 * Motore incidenze kit — calcola la quantità di articolo per unità base (es. per mq).
 *
 * Driver supportati:
 *  - CONSUMO:        incidenza = valore_driver / qta_confezione      (es. 3,5 kg/mq ÷ 25 kg/sacco = 0,14)
 *  - PASSO:          incidenza = 1 / valore_driver                    (es. passo 0,6 m → 1,67 ml/mq)
 *  - LATI:           incidenza = valore_driver                        (es. lastra × n. lati)
 *  - INCIDENZA_FISSA: incidenza = valore_driver                       (inserita a mano)
 *
 * L'incidenza calcolata è sempre sovrascrivibile a mano (override).
 */

import type { Database } from "@/integrations/supabase/types";

export type TipoDriver = Database["public"]["Enums"]["tipo_driver"];

export const TIPI_DRIVER: TipoDriver[] = ["CONSUMO", "PASSO", "LATI", "INCIDENZA_FISSA"];

const n = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

export interface IncidenzaInput {
  tipo_driver?: TipoDriver | null;
  valore_driver?: number | string | null;
  /** Quantità per confezione (qta_fornitore o qta_cliente) — usata solo per CONSUMO */
  qta_confezione?: number | string | null;
}

/** Restituisce l'incidenza calcolata dal driver, o null se non determinabile. */
export function calcIncidenzaFromDriver(input: IncidenzaInput): number | null {
  const v = n(input.valore_driver);
  switch (input.tipo_driver) {
    case "CONSUMO": {
      const q = n(input.qta_confezione);
      if (!q) return v || null;
      return v / q;
    }
    case "PASSO": {
      if (!v) return null;
      return 1 / v;
    }
    case "LATI":
    case "INCIDENZA_FISSA":
      return v || null;
    default:
      return null;
  }
}

export function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export const FAMIGLIE_KIT = [
  "PARETE",
  "CONTROPARETE",
  "CTS_CARTONGESSO",
  "CTS_MODULARE",
  "VELETTA",
  "ALTRO",
] as const;

export const FAMIGLIA_LABEL: Record<(typeof FAMIGLIE_KIT)[number], string> = {
  PARETE: "Parete",
  CONTROPARETE: "Controparete",
  CTS_CARTONGESSO: "CTS Cartongesso",
  CTS_MODULARE: "CTS Modulare",
  VELETTA: "Veletta",
  ALTRO: "Altro",
};
