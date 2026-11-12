import { z } from "zod";
import { Phone, Users, StickyNote, Mail, FileText, CircleDot, type LucideIcon } from "lucide-react";

/** FM62 G2: tipi ammessi in public.attivita_fornitore (CHECK). Ordine = ordine nel modulo. */
export const TIPI_ATTIVITA_FORNITORE = ["telefonata", "incontro", "nota", "email", "lettera", "altro"] as const;
export type TipoAttivitaFornitore = typeof TIPI_ATTIVITA_FORNITORE[number];
export const TIPO_ATTIVITA_FORNITORE: Record<TipoAttivitaFornitore, { label: string; icona: LucideIcon; classe: string }> = {
  telefonata: { label: "Telefonata", icona: Phone, classe: "bg-info/10 text-info" },
  incontro: { label: "Incontro", icona: Users, classe: "bg-success/10 text-success" },
  nota: { label: "Nota", icona: StickyNote, classe: "bg-warning/10 text-warning" },
  email: { label: "Email", icona: Mail, classe: "bg-primary/10 text-primary" },
  lettera: { label: "Lettera", icona: FileText, classe: "bg-motivo-autorizzare/10 text-motivo-autorizzare" },
  altro: { label: "Altro", icona: CircleDot, classe: "bg-muted text-muted-foreground" },
};
export function tipoAttivita(value: string) {
  return TIPO_ATTIVITA_FORNITORE[(TIPI_ATTIVITA_FORNITORE as readonly string[]).includes(value) ? value as TipoAttivitaFornitore : "altro"];
}
const testo = (max: number) => z.string().max(max, `Massimo ${max} caratteri`).transform(v => v.trim() || null).nullable().optional();
export const elencoAttivitaFornitoreInput = z.object({
  fornitoreId: z.string().uuid(),
  tipi: z.array(z.enum(TIPI_ATTIVITA_FORNITORE)).max(6).optional(),
  limite: z.number().int().min(1).max(50).default(50),
  offset: z.number().int().min(0).default(0),
});
export const datiAttivitaFornitore = z.object({
  tipo: z.enum(TIPI_ATTIVITA_FORNITORE),
  dataAttivita: z.string().datetime({ offset: true }),
  oggetto: testo(300),
  corpo: testo(8000),
  esito: testo(1000),
});
export const creaAttivitaFornitoreInput = datiAttivitaFornitore.extend({ fornitoreId: z.string().uuid() });
export const aggiornaAttivitaFornitoreInput = datiAttivitaFornitore.extend({ id: z.string().uuid() });
export const eliminaAttivitaFornitoreInput = z.object({ id: z.string().uuid() });
export type FiltriAttivitaFornitore = z.input<typeof elencoAttivitaFornitoreInput>;
export type DatiAttivitaFornitore = z.input<typeof datiAttivitaFornitore>;
export type AttivitaFornitore = {
  id: string; fornitore_id: string; tipo: string; origine: "manuale" | "invio"; data_attivita: string;
  oggetto: string | null; corpo: string | null; esito: string | null; destinatari: string[] | null;
  stato: string; errore: string | null; creato_da: string | null; operatore: string | null; n_allegati: number;
};
/** Valore per <input type="datetime-local"> nell'ora locale. */
export function dataLocaleInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
