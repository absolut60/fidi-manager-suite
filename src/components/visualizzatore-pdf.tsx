import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { apriPdf } from "@/lib/pdfjs";
import { Button } from "@/components/ui/button";

/**
 * Visualizzatore PDF riusabile: tutte le pagine una sotto l'altra, disegnate su canvas
 * alla larghezza del contenitore (funziona anche su iPhone, dove l'iframe mostra solo la prima pagina).
 */
export function VisualizzatorePdf({ url, nomeFile = "documento.pdf", className = "" }: { url: string; nomeFile?: string; className?: string }) {
  const contenitore = useRef<HTMLDivElement>(null);
  const [stato, setStato] = useState<"carico" | "ok" | "errore">("carico");
  const [pagine, setPagine] = useState(0);

  useEffect(() => {
    let annullato = false;
    let doc: Awaited<ReturnType<typeof apriPdf>> | null = null;
    const box = contenitore.current;
    if (!box) return;
    box.innerHTML = "";
    setStato("carico");
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        doc = await apriPdf(await res.arrayBuffer());
        if (annullato) return;
        setPagine(doc.numPages);
        const larghezza = Math.max(280, box.clientWidth);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages; i++) {
          if (annullato) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (larghezza / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "block rounded-sm border bg-background shadow-sm";
          canvas.setAttribute("aria-label", `Pagina ${i}`);
          box.appendChild(canvas);
          await page.render({ canvas, viewport: vp }).promise;
          if (i === 1 && !annullato) setStato("ok");
        }
      } catch {
        if (!annullato) setStato("errore");
      }
    })();
    return () => { annullato = true; doc?.destroy(); };
  }, [url]);

  async function scarica() {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nomeFile;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{pagine ? `${pagine} ${pagine === 1 ? "pagina" : "pagine"}` : ""}</span>
        <Button variant="ghost" size="sm" className="h-10 w-10 px-0" onClick={scarica} aria-label="Scarica PDF" title="Scarica">
          <Download className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded border bg-muted/40 p-2 [-webkit-overflow-scrolling:touch]">
        {stato === "carico" && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {stato === "errore" && <p className="p-4 text-sm text-destructive">Non riesco ad aprire il PDF. Prova con «Scarica».</p>}
        <div ref={contenitore} className="mx-auto flex w-full max-w-4xl flex-col gap-3" />
      </div>
    </div>
  );
}
