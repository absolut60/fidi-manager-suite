/**
 * Fonte unica per salvare un file dal browser.
 * Su telefono (incluso iPhone in PWA) usa il foglio "Condividi" → "Salva su File";
 * altrimenti download classico, ultimo fallback apertura in nuova scheda.
 */
export async function salvaFile(blob: Blob, nomeFile: string): Promise<void> {
  const file = new File([blob], nomeFile, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
  };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: nomeFile });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      // share non riuscito: proseguo con il download
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, "_blank");
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Scarica l'URL come blob e lo salva con salvaFile. Lancia errore se il fetch fallisce. */
export async function salvaFileDaUrl(url: string, nomeFile: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download non riuscito (${resp.status})`);
  const blob = await resp.blob();
  await salvaFile(blob, nomeFile);
}
