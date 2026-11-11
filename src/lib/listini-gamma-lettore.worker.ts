import { preparaFileListiniGamma } from "./listini-gamma-parser";

/** Web Worker: legge MADE_ARTICOLI_LISTINI_PQ.xlsx senza bloccare la pagina. */
const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<ArrayBuffer>) => void) | null };

ctx.onmessage = (e) => {
  try {
    ctx.postMessage({ ok: true, ...preparaFileListiniGamma(e.data) });
  } catch (err) {
    ctx.postMessage({ ok: false, errore: err instanceof Error ? err.message : String(err) });
  }
};
