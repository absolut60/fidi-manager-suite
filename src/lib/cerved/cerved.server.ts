/**
 * UNICO punto dell'app che parla con Cerved. La chiave (CERVED_API_KEY) si legge
 * solo qui, al momento della chiamata, e non viene mai registrata né restituita.
 */
const BASE_URL = "https://api.cerved.com/cervedApi/v1";
const TIMEOUT_MS = 15_000;

export type EsitoCerved = {
  http_status: number | null;
  esito: "ok" | "errore";
  errore: string | null;
  risposta: unknown;
};

function messaggioErrore(status: number): string {
  if (status === 401) return "Chiave Cerved non valida (401).";
  if (status === 403) return "Accesso negato da Cerved (403): possibile filtro IP o API non abilitata.";
  if (status === 404) return "Nessun risultato trovato su Cerved (404).";
  return `Errore Cerved (HTTP ${status}).`;
}

async function chiamaCerved(opts: {
  operazione: string;
  percorso: string;
  parametri: Record<string, string>;
  utenteId: string | null;
  clienteId: string | null;
}): Promise<EsitoCerved> {
  const inizio = Date.now();
  let risultato: EsitoCerved;
  const apiKey = process.env["CERVED_API_KEY"];
  if (!apiKey) {
    risultato = { http_status: null, esito: "errore", errore: "Chiave Cerved non configurata.", risposta: null };
  } else {
    const url = `${BASE_URL}${opts.percorso}?${new URLSearchParams(opts.parametri).toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { apikey: apiKey, "Content-Type": "application/json", Accept: "*/*" },
        signal: controller.signal,
      });
      const testo = await res.text();
      let corpo: unknown = null;
      try { corpo = testo ? JSON.parse(testo) : null; } catch { corpo = { testo: testo.slice(0, 5000) }; }
      risultato = res.ok
        ? { http_status: res.status, esito: "ok", errore: null, risposta: corpo }
        : { http_status: res.status, esito: "errore", errore: messaggioErrore(res.status), risposta: corpo };
    } catch (e) {
      const timeout = e instanceof Error && e.name === "AbortError";
      risultato = {
        http_status: null,
        esito: "errore",
        errore: timeout ? "Cerved non ha risposto entro 15 secondi (timeout)." : "Errore di rete nella chiamata a Cerved.",
        risposta: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("cerved_chiamate").insert({
      utente_id: opts.utenteId,
      cliente_id: opts.clienteId,
      operazione: opts.operazione,
      parametri: opts.parametri,
      http_status: risultato.http_status,
      esito: risultato.esito,
      errore: risultato.errore,
      durata_ms: Date.now() - inizio,
      risposta: (risultato.risposta ?? null) as never,
    });
    if (error) console.error("[cerved] registro non salvato", error.message);
  } catch (e) {
    console.error("[cerved] registro non salvato", e instanceof Error ? e.message : "errore");
  }
  return risultato;
}

export function cercaSoggettoPerPiva(piva: string, ctx: { utenteId: string | null; clienteId: string | null }) {
  return chiamaCerved({
    operazione: "entity_search",
    percorso: "/entitySearch/live",
    parametri: { testoricerca: piva, filtroricerca: "COMPANIES_ONLY" },
    ...ctx,
  });
}
