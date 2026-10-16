/**
 * FONTE UNICA delle regole password (FM44, decisione di Andrea).
 * Usata da: cambio password dell'utente (/cambia-password, Il mio profilo),
 * pagina Utenti (creazione e reimpostazione) e server (creaUtente, aggiornaPassword).
 * Funzioni pure: nessun accesso al database.
 */

export type RequisitoPassword = { id: string; etichetta: string; verifica: (pwd: string) => boolean };

export const LUNGHEZZA_MINIMA_PASSWORD = 10;

export const REQUISITI_PASSWORD: RequisitoPassword[] = [
  { id: "lunghezza", etichetta: `Almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri`, verifica: (p) => p.length >= LUNGHEZZA_MINIMA_PASSWORD },
  { id: "minuscola", etichetta: "Almeno una lettera minuscola", verifica: (p) => /[a-z]/.test(p) },
  { id: "maiuscola", etichetta: "Almeno una lettera maiuscola", verifica: (p) => /[A-Z]/.test(p) },
  { id: "numero", etichetta: "Almeno un numero", verifica: (p) => /[0-9]/.test(p) },
  { id: "speciale", etichetta: "Almeno un carattere speciale (es. ! ? @ # $ %)", verifica: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function verificaPassword(pwd: string): { valida: boolean; mancanti: string[] } {
  const mancanti = REQUISITI_PASSWORD.filter((r) => !r.verifica(pwd ?? "")).map((r) => r.etichetta);
  return { valida: mancanti.length === 0, mancanti };
}

/** Messaggio unico per una password non conforme. */
export function messaggioPasswordNonValida(pwd: string): string | null {
  const { valida, mancanti } = verificaPassword(pwd);
  return valida ? null : `Password non valida: ${mancanti.join(", ").toLowerCase()}.`;
}

/** Traduce gli errori del sistema di accesso sul cambio password. */
export function messaggioErroreCambioPassword(err: { code?: string; message?: string } | null | undefined): string {
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (code === "same_password" || /different from the old password|same.*password/i.test(msg)) {
    return "La nuova password deve essere diversa da quella attuale.";
  }
  if (code === "weak_password" && /pwned|leak|breach|compromis/i.test(msg)) {
    return "Questa password compare in elenchi di password rubate: scegline un'altra.";
  }
  if (/pwned|leaked|breach|known to be weak/i.test(msg)) {
    return "Questa password compare in elenchi di password rubate: scegline un'altra.";
  }
  return msg || "Errore imprevisto";
}

export const SCADENZA_PASSWORD_GIORNI_DEFAULT = 180;

type ProfiloPassword = { deve_cambiare_password?: boolean | null; password_cambiata_il?: string | null } | null | undefined;

const GIORNO_MS = 24 * 60 * 60 * 1000;

/** Giorni mancanti alla scadenza (negativo = scaduta). null se mai cambiata o profilo assente. */
export function giorniAllaScadenza(profilo: ProfiloPassword, giorni: number, oggi: Date = new Date()): number | null {
  if (!profilo?.password_cambiata_il) return null;
  const t = new Date(profilo.password_cambiata_il).getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t + giorni * GIORNO_MS - oggi.getTime()) / GIORNO_MS);
}

/** true = l'utente deve cambiare la password prima di usare l'app. Profilo assente → false (in caricamento). */
export function passwordDaCambiare(profilo: ProfiloPassword, giorni: number, oggi: Date = new Date()): boolean {
  if (!profilo) return false;
  if (profilo.deve_cambiare_password === true) return true;
  if (!profilo.password_cambiata_il) return true;
  const g = giorniAllaScadenza(profilo, giorni, oggi);
  return g === null || g <= 0;
}

/** true = password scaduta per tempo (non primo accesso / reimpostazione). */
export function passwordScaduta(profilo: ProfiloPassword, giorni: number, oggi: Date = new Date()): boolean {
  if (!profilo || profilo.deve_cambiare_password === true || !profilo.password_cambiata_il) return false;
  const g = giorniAllaScadenza(profilo, giorni, oggi);
  return g !== null && g <= 0;
}
