/**
 * Riprova e ripresa del ricalcolo del fido teorico (FM55 fetta 4b).
 * Modulo senza import, usato dai passi server (pulsante e job Inngest) e dalla
 * pagina per la ripresa: una sola definizione di dimensione blocco, timeout e riprova.
 *
 * Il tempo di un blocco è variabile (misurati 2,9 s – 24,2 s sullo stesso blocco da 500)
 * contro il limite di 8 s per istruzione del Data API: blocchi da 200 e riprova
 * dello STESSO blocco (idempotente) in caso di timeout.
 */

export const DIMENSIONE_BLOCCO_FIDO_TEORICO = 200;
/** Tentativi totali per passo: il primo più 2 riprove. */
export const TENTATIVI_RICALCOLO = 3;
export const ATTESA_RIPROVA_MS = 1_500;
export const MAX_BLOCCHI_RICALCOLO = 400;

type ErroreDb = { message?: string; code?: string };

/** Timeout di istruzione Postgres: codice 57014 o messaggio corrispondente. */
export function eTimeoutIstruzione(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, message } = e as ErroreDb;
  if (code === "57014") return true;
  return typeof message === "string" && /statement timeout|canceling statement/i.test(message);
}

const attesaReale = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type OpzioniRiprova = {
  tentativi?: number;
  attesaMs?: number;
  attendi?: (ms: number) => Promise<void>;
};

/** Ripete fn solo se fallisce per timeout di istruzione; ogni altro errore esce subito. */
export async function conRiprovaTimeout<T>(fn: () => Promise<T>, opz: OpzioniRiprova = {}): Promise<T> {
  const tentativi = opz.tentativi ?? TENTATIVI_RICALCOLO;
  const attendi = opz.attendi ?? attesaReale;
  const attesaMs = opz.attesaMs ?? ATTESA_RIPROVA_MS;
  let ultimo: unknown;
  for (let t = 1; t <= tentativi; t++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (!eTimeoutIstruzione(e) || t === tentativi) break;
      await attendi(attesaMs * t);
    }
  }
  throw ultimo;
}

export type ClienteRpc = {
  rpc: (fn: never, args?: never) => PromiseLike<{ data: unknown; error: ErroreDb | null }>;
};

function messaggio(passo: string, e: unknown, tentativi: number): Error {
  const m = (e as ErroreDb | null)?.message ?? String(e);
  const dopo = eTimeoutIstruzione(e) ? ` (dopo ${tentativi} tentativi)` : "";
  const err = new Error(`Ricalcolo fido teorico, passo "${passo}"${dopo}: ${m}`);
  (err as Error & { code?: string }).code = (e as ErroreDb | null)?.code;
  return err;
}

/** Chiama una RPC con la riprova sui timeout; errore finale con il nome del passo. */
export async function rpcConRiprova(
  client: ClienteRpc,
  passo: string,
  fn: string,
  args?: Record<string, unknown>,
  opz: OpzioniRiprova = {},
): Promise<unknown> {
  const tentativi = opz.tentativi ?? TENTATIVI_RICALCOLO;
  try {
    return await conRiprovaTimeout(async () => {
      const res = await client.rpc(fn as never, args as never);
      if (res.error) throw res.error;
      return res.data;
    }, opz);
  } catch (e) {
    throw messaggio(passo, e, tentativi);
  }
}

/** Un blocco: restituisce l'ultimo id elaborato, oppure null se non ci sono altri clienti. */
export async function bloccoConRiprova(
  client: ClienteRpc,
  dopoId: string | null,
  opz: OpzioniRiprova = {},
): Promise<string | null> {
  const data = await rpcConRiprova(
    client,
    "blocco",
    "ricalcola_fido_teorico_blocco",
    { _dopo_id: dopoId, _dimensione: DIMENSIONE_BLOCCO_FIDO_TEORICO },
    opz,
  );
  return (data as string | null) ?? null;
}
