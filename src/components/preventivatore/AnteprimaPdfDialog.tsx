import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Mail, Maximize, MoveHorizontal, Printer, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { apriPdf, canvasTuttoBianco } from "@/lib/pdfjs";
import { salvaFile } from "@/lib/salva-file";

type Adatta = "larghezza" | "pagina" | null;
const ZOOM_MIN = 0.25, ZOOM_MAX = 4, PASSO = 1.25;

export function AnteprimaPdfDialog({
  open, onOpenChange, blob, fileName, onInviaEmail,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blob: Blob | null;
  fileName: string;
  /** Assente = pulsante "Invia per email" nascosto (es. sola consultazione). */
  onInviaEmail?: () => void;
}) {
  const pdfBlob = useMemo(
    () => (blob ? (blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" })) : null),
    [blob],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // Contenitore dei canvas gestito solo a mano: React non vi rende figli.
  const pagineRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [adatta, setAdatta] = useState<Adatta>("larghezza");
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState({ w: 0, h: 0 });

  const blobUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && pdfBlob) blobUrlRef.current = URL.createObjectURL(pdfBlob);
    return () => { if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; } };
  }, [open, pdfBlob]);

  // Apertura documento
  useEffect(() => {
    if (!open || !pdfBlob) return;
    let cancelled = false;
    let aperto: import("pdfjs-dist").PDFDocumentProxy | null = null;
    setLoading(true); setError(null); setNumPages(0); setDoc(null); setAdatta("larghezza");
    (async () => {
      try {
        aperto = await apriPdf(await pdfBlob.arrayBuffer());
        if (cancelled) return;
        setNumPages(aperto.numPages);
        setDoc(aperto);
      } catch (e) {
        console.error("PDF open error", e);
        if (!cancelled) { setError("Anteprima non disponibile."); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      if (aperto) (aperto as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
    };
  }, [open, pdfBlob]);

  // Dimensioni dell'area visibile (ridisegno su resize)
  useEffect(() => {
    const el = scrollRef.current;
    if (!open || !el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, doc]);

  // Disegno nitido: backing store = dimensione CSS × devicePixelRatio
  useEffect(() => {
    if (!doc || !area.w) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    (async () => {
      try {
        const primo = await doc.getPage(1);
        const base = primo.getViewport({ scale: 1 });
        const larghezzaUtile = Math.max(area.w - 32, 120);
        const altezzaUtile = Math.max(area.h - 32, 120);
        const scalaFit = adatta === "pagina"
          ? Math.min(larghezzaUtile / base.width, altezzaUtile / base.height)
          : larghezzaUtile / base.width;
        const scala = adatta ? scalaFit : zoom;
        if (adatta) setZoom(scalaFit);
        const dpr = window.devicePixelRatio || 1;
        const frag = document.createDocumentFragment();
        const canvases: { canvas: HTMLCanvasElement; n: number }[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = i === 1 ? primo : await doc.getPage(i);
          const vp = page.getViewport({ scale: scala });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width * dpr);
          canvas.height = Math.floor(vp.height * dpr);
          canvas.style.width = `${Math.floor(vp.width)}px`;
          canvas.style.height = `${Math.floor(vp.height)}px`;
          canvas.className = "mx-auto mb-4 block bg-card shadow-md";
          frag.appendChild(canvas);
          canvases.push({ canvas, n: i });
        }
        if (cancelled || !pagineRef.current) return;
        pagineRef.current.replaceChildren(frag);
        for (const { canvas, n } of canvases) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: scala });
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          const task = page.render({ canvasContext: ctx, viewport: vp, canvas, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
          tasks.push(task);
          await task.promise;
          if (n === 1) {
            if (canvasTuttoBianco(canvas)) throw new Error("pagina bianca");
            setLoading(false);
          }
        }
        setLoading(false);
      } catch (e) {
        if (cancelled || (e as { name?: string }).name === "RenderingCancelledException") return;
        console.error("PDF render error", e);
        pagineRef.current?.replaceChildren();
        setError("Anteprima non disponibile."); setLoading(false);
      }
    })();
    return () => { cancelled = true; tasks.forEach(t => t.cancel()); };
  }, [doc, area.w, area.h, adatta, zoom]);

  useEffect(() => { if (!open) pagineRef.current?.replaceChildren(); }, [open]);

  function cambiaZoom(fattore: number) {
    setAdatta(null);
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * fattore)));
  }

  function handleStampa() {
    const url = blobUrlRef.current;
    if (!url) return;
    const w = window.open(url, "_blank");
    if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* ignore */ } });
    else toast.error("Il browser ha bloccato la stampa. Consenti i popup e riprova.");
  }

  function handleEsporta() {
    if (pdfBlob) void salvaFile(pdfBlob, fileName);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 left-0 top-0 translate-x-0 translate-y-0 w-full max-w-none h-[100dvh] max-h-[100dvh] rounded-none overflow-hidden sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:w-[calc(100vw-2rem)] sm:h-[calc(100dvh-2rem)] sm:max-w-[1600px] sm:rounded-lg">
        <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 border-b border-border text-left shrink-0">
          <DialogTitle className="pr-8">Anteprima documento</DialogTitle>
          <DialogDescription className="break-all">
            {fileName}{numPages > 0 ? ` · ${numPages} pagin${numPages > 1 ? "e" : "a"}` : ""}
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-1 pt-2">
            <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Riduci" onClick={() => cambiaZoom(1 / PASSO)} disabled={!doc || zoom <= ZOOM_MIN}><ZoomOut className="h-4 w-4" /></Button>
            <span className="w-14 text-center text-sm tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Ingrandisci" onClick={() => cambiaZoom(PASSO)} disabled={!doc || zoom >= ZOOM_MAX}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant={adatta === "larghezza" ? "secondary" : "outline"} size="sm" className="h-10" onClick={() => setAdatta("larghezza")} disabled={!doc}><MoveHorizontal className="mr-1 h-4 w-4" />Adatta larghezza</Button>
            <Button variant={adatta === "pagina" ? "secondary" : "outline"} size="sm" className="h-10" onClick={() => setAdatta("pagina")} disabled={!doc}><Maximize className="mr-1 h-4 w-4" />Adatta pagina</Button>
          </div>
        </DialogHeader>

        <div ref={scrollRef} className="relative flex-1 min-h-0 overflow-auto bg-muted/40 p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-sm text-muted-foreground">Caricamento anteprima…</span>
            </div>
          )}
          {error && (
            <div className="rounded border bg-card p-6 text-center text-sm text-destructive">
              <p>{error}</p>
              <Button onClick={handleEsporta} className="mt-3">Scarica / Condividi</Button>
            </div>
          )}
          <div ref={pagineRef} className="w-max min-w-full" />
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 gap-2 sm:gap-2 border-t border-border shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          {onInviaEmail && (
            <Button variant="outline" onClick={onInviaEmail} disabled={!pdfBlob}>
              <Mail className="h-4 w-4 mr-2" />Invia per email
            </Button>
          )}
          <Button variant="outline" onClick={handleStampa}><Printer className="h-4 w-4 mr-2" />Stampa</Button>
          <Button onClick={handleEsporta}><Download className="h-4 w-4 mr-2" />Scarica / Condividi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
