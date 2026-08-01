// Valutazione CENTRALIZZATA dell'esito di una risposta della edge function
// `send-email`. Unica implementazione usata da TUTTI i canali (marketing,
// solleciti, promemoria, invii singoli, email libera, credenziali utente...).
//
// Regola: successo SOLO se
//   - status HTTP === 200 (la edge risponde 207 quando almeno un destinatario
//     fallisce: 207 è 2xx, quindi `res.ok` da solo NON basta), E
//   - body.ok === true, E
//   - nessun results[i].ok === false.
// Altrimenti errore, col messaggio più specifico disponibile.

export interface EsitoEmail {
  ok: boolean;
  err?: string;
  /**
   * Identificativo assegnato dal server di posta al momento dell'accettazione
   * del messaggio (prova di ACCETTAZIONE, non di consegna in casella).
   * Se i destinatari sono più di uno, i message-id sono uniti da ", ".
   */
  messageId?: string;
}

export interface CorpoRispostaEmail {
  ok?: boolean;
  error?: string;
  message?: string;
  results?: Array<{ email?: string; ok?: boolean; err?: string; messageId?: string }>;
}

/** Interpreta status + corpo (già parsato o testo grezzo) della edge send-email. */
export function valutaEsitoEmail(
  status: number,
  body: unknown,
  rawText?: string,
): EsitoEmail {
  let parsed: unknown = body;
  if (parsed == null && rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  const b = (parsed ?? {}) as CorpoRispostaEmail;
  const results = Array.isArray(b.results) ? b.results : [];
  const primoFallito = results.find((r) => r?.ok === false);

  if (status === 200 && b.ok === true && !primoFallito) {
    const ids = results
      .map((r) => (r?.messageId ? String(r.messageId).trim() : ""))
      .filter((s) => s.length > 0);
    return ids.length ? { ok: true, messageId: ids.join(", ") } : { ok: true };
  }

  const err =
    primoFallito?.err ??
    b.error ??
    b.message ??
    `HTTP ${status}: ${(rawText ?? "").slice(0, 300)}`;
  const dest = primoFallito?.email ? ` (${primoFallito.email})` : "";
  return { ok: false, err: `${String(err).slice(0, 400)}${dest}` };
}
