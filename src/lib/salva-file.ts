/**
 * Fonte unica per salvare un file dal browser.
 * Su telefoni/tablet (iPhone, iPad incluso iPadOS, Android; pointer coarse o
 * user agent mobile) usa il foglio "Condividi" → "Salva su File";
 * su PC sempre download classico, ultimo fallback apertura in nuova scheda.
 */
function isTelefonoOTablet(): boolean {
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS si presenta come Mac: lo riconosce lo schermo touch
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return true;
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

export async function salvaFile(blob: Blob, nomeFile: string): Promise<void> {
  const file = new File([blob], nomeFile, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
  };
  if (isTelefonoOTablet() && nav.canShare?.({ files: [file] })) {
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
