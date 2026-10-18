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
  promessa_pagamento: HandCoins,
};

// Esiti di un'azione di recupero (fonte unica per i dialog di modifica/chiusura).
// 'promessa_pagamento' resta nel tipo e in ESITO_AZIONE_LABEL solo per i dati vecchi:
// non è più una scelta (la promessa è un tipo di azione, con stato_promessa).
export type EsitoAzione = "da_fare" | "fatto" | "nessuna_risposta" | "promessa_pagamento" | "contestazione" | "pagato";

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
 * Forma transitoria (FM45 P2): riconosce sia il tipo nuovo sia la forma vecchia
 * tipo 'nota' + esito 'promessa_pagamento'. In P4 diventerà solo il tipo.
 */
export function isPromessaPagamento(a: { tipo?: string | null; esito?: string | null }): boolean {
  return a.tipo === "promessa_pagamento" || a.esito === "promessa_pagamento";
}

/** Tipo da mostrare (etichetta/icona/filtri): una promessa vecchia (nota) appare come promessa. */
export function tipoAzioneVisualizzato(a: { tipo: string; esito?: string | null }): string {
  return isPromessaPagamento(a) ? "promessa_pagamento" : a.tipo;
}

/**
 * Filtro PostgREST (.or) che trova le promesse in entrambe le forme.
 * Gemello di isPromessaPagamento.
 */
export const FILTRO_OR_PROMESSA = "tipo.eq.promessa_pagamento,esito.eq.promessa_pagamento";
