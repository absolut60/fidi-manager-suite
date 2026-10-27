/**
 * Fonte unica per pdf.js nel browser: worker e apertura documenti
 * (stessa versione del pacchetto installato, 6.2.108). Usato dal preventivatore
 * (AnteprimaPdfDialog) e dalle anteprime allegati. Nessun getDocument altrove.
 *
 * Le risorse di pdf.js (decoder wasm JPEG2000/JBIG2, profili ICC, CMap,
 * font standard) sono copiate da node_modules/pdfjs-dist nelle cartelle
 * public/pdfjs/6.2.108/ e servite in locale: se si aggiorna pdfjs-dist
 * vanno ricopiate nella cartella della nuova versione.
 */
type PdfJs = typeof import("pdfjs-dist");
type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;
let pdfjsPromise: Promise<PdfJs> | null = null;

const BASE_RISORSE = "/pdfjs/6.2.108/";

export function loadPdfJs(): Promise<PdfJs> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfjsPromise;
}

/** Apre un PDF con tutte le risorse locali necessarie (immagini JPX/JBIG2, ICC, CMap, font). */
export async function apriPdf(dati: ArrayBuffer): Promise<PdfDoc> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({
    data: dati,
    wasmUrl: `${BASE_RISORSE}wasm/`,
    iccUrl: `${BASE_RISORSE}iccs/`,
    cMapUrl: `${BASE_RISORSE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE_RISORSE}standard_fonts/`,
  }).promise;
}

/**
 * true se il canvas renderizzato è interamente bianco/trasparente
 * (campionamento a griglia): segnale di rendering non riuscito.
 */
export function canvasTuttoBianco(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) return true;
  let dati: Uint8ClampedArray;
  try {
    dati = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return false;
  }
  const passo = Math.max(1, Math.floor((canvas.width * canvas.height) / 40_000));
  for (let p = 0; p < dati.length / 4; p += passo) {
    const i = p * 4;
    if (dati[i + 3] > 0 && (dati[i] < 245 || dati[i + 1] < 245 || dati[i + 2] < 245)) return false;
  }
  return true;
}
