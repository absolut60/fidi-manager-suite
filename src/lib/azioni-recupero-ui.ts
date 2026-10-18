// Etichette e icone dei tipi di azione di recupero crediti (fonte unica:
// usate da cliente-attivita-recupero-tab.tsx e scadenziario.tsx).
import { Bell, CalendarClock, FileText, HandCoins, Mail, Phone, StickyNote } from "lucide-react";

export const TIPO_AZIONE_LABEL: Record<string, string> = {
  email: "Email",
  telefonata: "Telefonata",
  promemoria: "Promemoria",
  nota: "Nota",
  lettera: "Lettera",
  promemoria_scadenza: "Promemoria scadenza",
  promessa_pagamento: "Promessa di pagamento",
};

export const ESITO_AZIONE_LABEL: Record<string, string> = {
  da_fare: "Da fare",
  fatto: "Fatto",
  nessuna_risposta: "Nessuna risposta",
  contestazione: "Contestazione",
  pagato: "Pagato",
};

export const TIPO_AZIONE_ICON: Record<string, typeof Mail> = {
  email: Mail,
  telefonata: Phone,
  promemoria: Bell,
  nota: StickyNote,
  lettera: FileText,
  promemoria_scadenza: CalendarClock,
  promessa_pagamento: HandCoins,
};

// Esiti di un'azione di recupero (fonte unica per i dialog di modifica/chiusura).
// La promessa non è un esito: è un tipo di azione ('promessa_pagamento') con stato_promessa.
export type EsitoAzione = "da_fare" | "fatto" | "nessuna_risposta" | "contestazione" | "pagato";

export const ESITI_AZIONE: { value: EsitoAzione; label: string }[] = [
  { value: "da_fare", label: "Da fare" },
  { value: "fatto", label: "Fatto" },
  { value: "nessuna_risposta", label: "Nessuna risposta" },
  { value: "contestazione", label: "Contestazione" },
  { value: "pagato", label: "Pagato" },
];

/** Testo leggibile di un'azione (fonte unica): nota, altrimenti oggetto email, altrimenti null. */
export function testoAzione(a: { note: string | null; email_oggetto: string | null; tipo: string }): string | null {
  const nota = a.note?.trim();
  if (nota) return nota;
  const oggetto = a.email_oggetto?.trim();
  if (a.tipo === "email" && oggetto) return `Oggetto: ${oggetto}`;
  return null;
}

/**
 * Fonte unica TS: l'azione è una promessa di pagamento.
 * Gemello SQL: public.is_promessa_pagamento(tipo, esito). Se cambia uno, cambia l'altro.
 * Unica forma (FM45 P4): tipo 'promessa_pagamento'.
 */
export function isPromessaPagamento(a: { tipo?: string | null; esito?: string | null }): boolean {
  return a.tipo === TIPO_PROMESSA;
}

/** Tipo da mostrare (etichetta/icona/filtri). */
export function tipoAzioneVisualizzato(a: { tipo: string; esito?: string | null }): string {
  return a.tipo;
}

/** Valore del tipo azione "promessa di pagamento" (filtri PostgREST: .eq("tipo", TIPO_PROMESSA)). */
export const TIPO_PROMESSA = "promessa_pagamento";

/** Data odierna locale in formato ISO (aaaa-mm-gg), per i confronti con data_promessa_pagamento. */
export function oggiISOLocale(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Giorni trascorsi da una data ISO (aaaa-mm-gg) a oggi (locale). */
export function giorniDaOggi(iso: string): number {
  const a = new Date(iso.slice(0, 10) + "T00:00:00").getTime();
  const b = new Date(oggiISOLocale() + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

/**
 * Fonte unica TS: promessa "da verificare" = stato attiva (NULL vale attiva)
 * e scadenza promessa precedente a oggi. Usata da scheda Promesse del cliente,
 * pagina Promesse di pagamento e riquadro "Ultima promessa" di Attività recupero.
 */
export function isPromessaDaVerificare(
  a: { stato_promessa?: string | null; data_promessa_pagamento?: string | null },
  oggi: string = oggiISOLocale(),
): boolean {
  return (a.stato_promessa ?? "attiva") === "attiva"
    && !!a.data_promessa_pagamento
    && a.data_promessa_pagamento.slice(0, 10) < oggi;
}
