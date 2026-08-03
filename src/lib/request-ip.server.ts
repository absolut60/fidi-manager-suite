import { getRequest } from "@tanstack/react-start/server";

/**
 * Estrae l'IP di provenienza della richiesta corrente.
 * Helper condiviso (§5) da tutti i flussi di raccolta consensi.
 */
export function estraiIp(): string | null {
  try {
    const req = getRequest();
    const h = req.headers;
    const raw =
      h.get("cf-connecting-ip") ??
      h.get("x-real-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    if (!raw) return null;
    return raw.slice(0, 100);
  } catch {
    return null;
  }
}
