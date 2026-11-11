import type { ManifestListini, PacchettoListini } from "./listini-gamma-parser";

export type FileListiniPreparato = { manifest: ManifestListini; pacchetti: PacchettoListini[] };

/**
 * Legge il file nel browser (in un Web Worker, così la pagina non si blocca) con i parser
 * condivisi di listini-gamma-parser. Da chiamare solo da un gestore di evento.
 */
export async function leggiFileListiniGamma(file: File): Promise<FileListiniPreparato> {
  const buf = await file.arrayBuffer();
  if (typeof Worker === "undefined") {
    const { preparaFileListiniGamma } = await import("./listini-gamma-parser");
    return preparaFileListiniGamma(buf);
  }
  return new Promise<FileListiniPreparato>((resolve, reject) => {
    const w = new Worker(new URL("./listini-gamma-lettore.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<({ ok: true } & FileListiniPreparato) | { ok: false; errore: string }>) => {
      w.terminate();
      if (e.data.ok) resolve({ manifest: e.data.manifest, pacchetti: e.data.pacchetti });
      else reject(new Error(`Lettura del file non riuscita: ${e.data.errore}`));
    };
    w.onerror = (ev) => {
      w.terminate();
      reject(new Error(`Lettura del file non riuscita: ${ev.message || "errore del lettore"}`));
    };
    w.postMessage(buf, [buf]);
  });
}
