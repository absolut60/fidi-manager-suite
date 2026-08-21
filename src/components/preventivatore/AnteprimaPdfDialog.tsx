import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Mail, Printer, X } from "lucide-react";
import { toast } from "sonner";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
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

export function AnteprimaPdfDialog({
  open, onOpenChange, blob, fileName, onInviaEmail,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blob: Blob | null;
  fileName: string;
  onInviaEmail?: () => void;
}) {
  const pdfBlob = useMemo(
    () => (blob ? (blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" })) : null),
    [blob],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);

  // URL solo per stampa/esporta (non per rendering)
  const blobUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && pdfBlob) {
      const u = URL.createObjectURL(pdfBlob);
      blobUrlRef.current = u;
    }
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [open, pdfBlob]);

  // Render PDF su canvas via pdf.js
  useEffect(() => {
    if (!open || !pdfBlob) return;
    let cancelled = false;
    let pdfDoc: import("pdfjs-dist").PDFDocumentProxy | null = null;

    async function renderAll() {
      setLoading(true);
      setError(null);
      setNumPages(0);
      const container = canvasContainerRef.current;
      if (container) container.innerHTML = "";

      try {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await pdfBlob!.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        setNumPages(pdfDoc.numPages);

        const containerWidth = (scrollRef.current?.clientWidth ?? 760) - 24;
        const dpr = window.devicePixelRatio || 1;

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) return;
          const page = await pdfDoc.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = "mx-auto mb-3 shadow-sm bg-white";

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          if (dpr !== 1) ctx.scale(dpr, dpr);

          if (canvasContainerRef.current) {
            canvasContainerRef.current.appendChild(canvas);
          }

          await page.render({ canvasContext: ctx, viewport }).promise;
          page.cleanup();
          if (i === 1) setLoading(false);
        }
        setLoading(false);
      } catch (e) {
        console.error("PDF render error", e);
        if (!cancelled) {
          setError("Impossibile generare l'anteprima del PDF.");
          setLoading(false);
        }
      }
    }

    renderAll();
    return () => {
      cancelled = true;
      if (pdfDoc) pdfDoc.destroy().catch(() => {});
      if (canvasContainerRef.current) canvasContainerRef.current.innerHTML = "";
    };
  }, [open, pdfBlob]);

  function handleStampa() {
    const url = blobUrlRef.current;
    if (!url) return;
    const w = window.open(url, "_blank");
    if (w) {
      w.addEventListener("load", () => {
        try { w.print(); } catch { /* ignore */ }
      });
    } else {
      toast.error("Il browser ha bloccato la stampa. Consenti i popup e riprova.");
    }
  }

  function handleEsporta() {
    const url = blobUrlRef.current;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleEmail() {
    if (onInviaEmail) onInviaEmail();
    else toast.info("Invio email in arrivo prossimamente");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Anteprima documento</DialogTitle>
              <div className="text-sm text-muted-foreground mt-1">
                {fileName}
                {numPages > 0 ? ` · ${numPages} pagina${numPages > 1 ? "e" : ""}` : ""}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div ref={canvasContainerRef} className="py-2">
            {loading && (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-sm text-muted-foreground">Caricamento anteprima…</span>
              </div>
            )}
            {error && (
              <div className="rounded border p-6 text-center text-sm text-destructive">
                <p>{error}</p>
                <Button onClick={handleEsporta} className="mt-3">
                  Scarica PDF
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button variant="outline" onClick={handleEmail}>
            <Mail className="h-4 w-4 mr-2" />
            Invia per email
          </Button>
          <Button variant="outline" onClick={handleStampa}>
            <Printer className="h-4 w-4 mr-2" />
            Stampa
          </Button>
          <Button onClick={handleEsporta}>
            <Download className="h-4 w-4 mr-2" />
            Esporta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
