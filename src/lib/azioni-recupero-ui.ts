// Etichette e icone dei tipi di azione di recupero crediti (fonte unica:
// usate da cliente-attivita-recupero-tab.tsx e scadenziario.tsx).
import { Bell, CalendarClock, FileText, Mail, Phone, StickyNote } from "lucide-react";

export const TIPO_AZIONE_LABEL: Record<string, string> = {
  email: "Email",
  telefonata: "Telefonata",
  promemoria: "Promemoria",
  nota: "Nota",
  lettera: "Lettera",
  promemoria_scadenza: "Promemoria scadenza",
};

export const ESITO_AZIONE_LABEL: Record<string, string> = {
  da_fare: "Da fare",
  fatto: "Fatto",
  nessuna_risposta: "Nessuna risposta",
  promessa_pagamento: "Promessa pagamento",
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
};

// Esiti di un'azione di recupero (fonte unica per i dialog di modifica/chiusura).
export type EsitoAzione = "da_fare" | "fatto" | "nessuna_risposta" | "promessa_pagamento" | "contestazione" | "pagato";

export const ESITI_AZIONE: { value: EsitoAzione; label: string }[] = [
  { value: "da_fare", label: "Da fare" },
  { value: "fatto", label: "Fatto" },
  { value: "nessuna_risposta", label: "Nessuna risposta" },
  { value: "promessa_pagamento", label: "Promessa pagamento" },
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
