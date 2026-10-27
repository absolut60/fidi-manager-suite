/**
 * Anteprima allegati stile WhatsApp, riutilizzabile (chat, task, richieste, schede).
 * - MiniaturaAllegato: immagine, prima pagina PDF (pdf.js) o riga file.
 * - VisualizzatoreAllegato: visualizzazione a schermo intero + "Scarica / Condividi".
 * pdf.js è configurato solo in src/lib/pdfjs.ts; il salvataggio passa da src/lib/salva-file.ts.
 */
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { loadPdfJs } from "@/lib/pdfjs";
import { salvaFileDaUrl } from "@/lib/salva-file";

const BUCKET_DEFAULT = "allegati";
const SCADENZA_URL_S = 600; // 10 minuti
const LARGHEZZA_MINIATURA = 220;

export function formatBytes(b: number | null | undefined) {
  if (!b && b !== 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function tipoAllegato(mimeType: string | null | undefined, nomeFile: string): "img" | "pdf" | "altro" {
  const m = mimeType ?? "";
  if (m.startsWith("image/")) return "img";
  if (m === "application/pdf" || /\.pdf$/i.test(nomeFile)) return "pdf";
  return "altro";
}

// ---------- URL firmati (cache con rinnovo) ----------
const cacheUrl = new Map<string, { url: string; scade: number }>();

export async function urlFirmatoAllegato(path: string, bucket: string = BUCKET_DEFAULT): Promise<string> {
  const chiave = `${bucket}::${path}`;
  const c = cacheUrl.get(chiave);
  if (c && c.scade - Date.now() > 30_000) return c.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SCADENZA_URL_S);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "URL non disponibile");
  cacheUrl.set(chiave, { url: data.signedUrl, scade: Date.now() + SCADENZA_URL_S * 1000 });
  return data.signedUrl;
}

// ---------- Miniatura prima pagina PDF (cache in memoria) ----------
type MiniPdf = { dataUrl: string; pagine: number; ratio: number };
const cacheMiniPdf = new Map<string, Promise<MiniPdf>>();
const cacheMiniPdfLocale = new WeakMap<File, Promise<MiniPdf>>();

async function renderPrimaPagina(data: ArrayBuffer): Promise<MiniPdf> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (LARGHEZZA_MINIATURA / base.width) * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    page.cleanup();
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), pagine: doc.numPages, ratio: base.height / base.width };
  } finally {
    (doc as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
  }
}

function miniPdfRemota(path: string, bucket: string): Promise<MiniPdf> {
  const chiave = `${bucket}::${path}`;
  let p = cacheMiniPdf.get(chiave);
  if (!p) {
    p = (async () => {
      const res = await fetch(await urlFirmatoAllegato(path, bucket));
      if (!res.ok) throw new Error("fetch");
      return renderPrimaPagina(await res.arrayBuffer());
    })();
    p.catch(() => cacheMiniPdf.delete(chiave));
    cacheMiniPdf.set(chiave, p);
  }
  return p;
}

function miniPdfLocale(file: File): Promise<MiniPdf> {
  let p = cacheMiniPdfLocale.get(file);
  if (!p) {
    p = file.arrayBuffer().then(renderPrimaPagina);
    cacheMiniPdfLocale.set(file, p);
  }
  return p;
}

function useInVista<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    if (visto || !ref.current) return;
    if (typeof IntersectionObserver === "undefined") { setVisto(true); return; }
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisto(true); obs.disconnect(); }
    }, { rootMargin: "200px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visto]);
  return { ref, visto };
}

// ---------- UI di base ----------
function RigaFile({ nomeFile, dimensione, onClick }: { nomeFile: string; dimensione?: number | null; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full max-w-full items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-left text-foreground min-h-10"
    >
      <FileText className="size-4 shrink-0" />
      <span className="text-xs break-all line-clamp-2 min-w-0 flex-1">{nomeFile}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(dimensione)}</span>
    </button>
  );
}

function SchedaPdf({
  mini, errore, nomeFile, dimensione, onClick,
}: { mini: MiniPdf | null; errore: boolean; nomeFile: string; dimensione?: number | null; onClick?: () => void }) {
  if (errore) return <RigaFile nomeFile={nomeFile} dimensione={dimensione} onClick={onClick} />;
  const info = [mini ? `${mini.pagine} ${mini.pagine === 1 ? "pagina" : "pagine"}` : null, formatBytes(dimensione) || null]
    .filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 block w-[220px] max-w-full overflow-hidden rounded-md border bg-background text-left text-foreground"
    >
      {mini ? (
        <img src={mini.dataUrl} alt={`Prima pagina di ${nomeFile}`} className="block w-full h-auto bg-white" style={{ aspectRatio: `1 / ${mini.ratio}` }} />
      ) : (
        <div className="w-full aspect-[1/1.414] bg-muted animate-pulse" />
      )}
      <div className="flex items-start gap-2 border-t px-2 py-1.5">
        <FileText className="size-4 shrink-0 text-destructive mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium break-all line-clamp-2">{nomeFile}</div>
          {info && <div className="text-[10px] text-muted-foreground">{info}</div>}
        </div>
      </div>
    </button>
  );
}

// ---------- Miniatura da storage ----------
export function MiniaturaAllegato({
  storagePath, nomeFile, mimeType, dimensione, bucket = BUCKET_DEFAULT,
}: { storagePath: string; nomeFile: string; mimeType?: string | null; dimensione?: number | null; bucket?: string }) {
  const tipo = tipoAllegato(mimeType, nomeFile);
  const { ref, visto } = useInVista<HTMLDivElement>();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [mini, setMini] = useState<MiniPdf | null>(null);
  const [errore, setErrore] = useState(false);
  const [aperto, setAperto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visto || tipo === "altro") return;
    let attivo = true;
    (async () => {
      try {
        if (tipo === "img") {
          const u = await urlFirmatoAllegato(storagePath, bucket);
          if (attivo) setImgUrl(u);
        } else {
          const m = await miniPdfRemota(storagePath, bucket);
          if (attivo) setMini(m);
        }
      } catch {
        if (attivo) setErrore(true);
      }
    })();
    return () => { attivo = false; };
  }, [visto, tipo, storagePath, bucket]);

  async function salvaDiretto() {
    if (salvando) return;
    setSalvando(true);
    try {
      await salvaFileDaUrl(await urlFirmatoAllegato(storagePath, bucket), nomeFile);
    } catch {
      toast.error("Impossibile scaricare il file");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div ref={ref} className="max-w-full min-w-0">
      {tipo === "img" ? (
        imgUrl && !errore ? (
          <img
            src={imgUrl}
            alt={nomeFile}
            onClick={() => setAperto(true)}
            onError={() => cacheUrl.delete(`${bucket}::${storagePath}`)}
            className="mt-2 max-w-full sm:max-w-[220px] rounded-md cursor-pointer"
          />
        ) : errore ? (
          <RigaFile nomeFile={nomeFile} dimensione={dimensione} onClick={salvaDiretto} />
        ) : (
          <div className="mt-2 h-24 w-[220px] max-w-full rounded-md bg-background/30 animate-pulse" />
        )
      ) : tipo === "pdf" ? (
        <SchedaPdf mini={mini} errore={errore} nomeFile={nomeFile} dimensione={dimensione} onClick={() => setAperto(true)} />
      ) : (
        <RigaFile nomeFile={nomeFile} dimensione={dimensione} onClick={salvaDiretto} />
      )}
      {tipo !== "altro" && (
        <VisualizzatoreAllegato
          open={aperto}
          onOpenChange={setAperto}
          storagePath={storagePath}
          nomeFile={nomeFile}
          tipo={tipo}
          bucket={bucket}
        />
      )}
    </div>
  );
}

// ---------- Miniatura da File locale (composer) ----------
export function MiniaturaPdfLocale({ file }: { file: File }) {
  const [mini, setMini] = useState<MiniPdf | null>(null);
  const [errore, setErrore] = useState(false);
  useEffect(() => {
    let attivo = true;
    setMini(null); setErrore(false);
    miniPdfLocale(file).then((m) => attivo && setMini(m)).catch(() => attivo && setErrore(true));
    return () => { attivo = false; };
  }, [file]);
  if (errore) return <FileText className="size-4" />;
  return mini ? (
    <img src={mini.dataUrl} alt="" className="h-14 w-auto max-w-10 rounded border bg-white object-contain" />
  ) : (
    <div className="h-14 w-10 rounded bg-muted animate-pulse" />
  );
}

// ---------- Visualizzatore ----------
export function VisualizzatoreAllegato({
  open, onOpenChange, storagePath, nomeFile, tipo, bucket = BUCKET_DEFAULT,
}: {
  bucket?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storagePath: string;
  nomeFile: string;
  tipo: "img" | "pdf";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const paginaRef = useRef<HTMLDivElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    let annullato = false;
    let doc: import("pdfjs-dist").PDFDocumentProxy | null = null;
    setErrore(false);
    setCaricamento(true);

    (async () => {
      try {
        const url = await urlFirmatoAllegato(storagePath, bucket);
        if (tipo === "img") {
          if (!annullato) { setImgUrl(url); setCaricamento(false); }
          return;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch");
        const pdfjs = await loadPdfJs();
        doc = await pdfjs.getDocument({ data: await res.arrayBuffer() }).promise;
        // attende il montaggio del contenitore nel Dialog
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const contenitore = paginaRef.current;
        if (!contenitore || annullato) return;
        contenitore.innerHTML = "";
        const larghezza = Math.max(200, (scrollRef.current?.clientWidth ?? 360) - 16);
        const dpr = window.devicePixelRatio || 1;
        for (let i = 1; i <= doc.numPages; i++) {
          if (annullato) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (larghezza / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "block mx-auto mb-3 bg-white shadow-sm";
          contenitore.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          page.cleanup();
          if (i === 1 && !annullato) setCaricamento(false);
        }
        if (!annullato) setCaricamento(false);
      } catch {
        if (!annullato) { setErrore(true); setCaricamento(false); }
      }
    })();

    return () => {
      annullato = true;
      (doc as { destroy?: () => Promise<void> } | null)?.destroy?.().catch(() => {});
      if (paginaRef.current) paginaRef.current.innerHTML = "";
    };
  }, [open, storagePath, tipo, bucket]);

  async function salva() {
    setSalvando(true);
    try {
      await salvaFileDaUrl(await urlFirmatoAllegato(storagePath, bucket), nomeFile);
    } catch {
      toast.error("Impossibile scaricare il file");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col gap-0 p-0 w-screen max-w-none h-[100dvh] rounded-none sm:rounded-lg sm:w-[95vw] sm:max-w-4xl sm:h-[90vh] overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2 pr-12 min-w-0">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold break-all line-clamp-2" title={nomeFile}>{nomeFile}</DialogTitle>
            <DialogDescription className="sr-only">Anteprima dell'allegato</DialogDescription>
          </div>
          <Button size="sm" onClick={salva} disabled={salvando} className="shrink-0 gap-1.5 h-10 sm:h-9">
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="hidden sm:inline">Scarica / Condividi</span>
            <span className="sm:hidden">Salva</span>
          </Button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/40 p-2">
          {caricamento && (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin mr-2" /> Caricamento…
            </div>
          )}
          {errore && (
            <div className="p-6 text-center text-sm text-destructive">
              Anteprima non disponibile. Usa "Scarica / Condividi".
            </div>
          )}
          {tipo === "img" && imgUrl && !errore && (
            <img src={imgUrl} alt={nomeFile} className="block w-full h-auto rounded-md" />
          )}
          {tipo === "pdf" && <div ref={paginaRef} className="mx-auto w-full" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Scheda in elenco (miniatura + dati + azioni sempre visibili) ----------
/** Griglia standard per elenchi di allegati: 1–2 per riga a 360 px, affiancati su desktop. */
export const GRIGLIA_ALLEGATI = "grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

/** Apre l'allegato salvato in una nuova scheda (finestra aperta subito, per non essere bloccata). */
export async function apriAllegatoInNuovaScheda(storagePath: string, bucket: string = BUCKET_DEFAULT) {
  const w = window.open("", "_blank");
  try {
    const url = await urlFirmatoAllegato(storagePath, bucket);
    if (w) w.location.href = url; else window.open(url, "_blank");
  } catch {
    w?.close();
    toast.error("Impossibile aprire il file");
  }
}

/** Azioni standard di un allegato salvato: Apri, Scarica e (se permesso) Elimina. Solo icone, su una riga. */
function AzioniStandard({
  storagePath, nomeFile, bucket = BUCKET_DEFAULT, onElimina,
}: { storagePath: string; nomeFile: string; bucket?: string; onElimina?: () => void }) {
  const [salvando, setSalvando] = useState(false);
  async function scarica() {
    setSalvando(true);
    try { await salvaFileDaUrl(await urlFirmatoAllegato(storagePath, bucket), nomeFile); }
    catch { toast.error("Impossibile scaricare il file"); }
    finally { setSalvando(false); }
  }
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8"
        onClick={() => void apriAllegatoInNuovaScheda(storagePath, bucket)} aria-label={`Apri ${nomeFile}`} title="Apri">
        <ExternalLink className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8" onClick={scarica}
        disabled={salvando} aria-label={`Scarica ${nomeFile}`} title="Scarica">
        {salvando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      </Button>
      {onElimina && (
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive sm:h-8 sm:w-8"
          onClick={onElimina} aria-label={`Elimina ${nomeFile}`} title="Elimina">
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

/** Riga compatta: icona/miniatura piccola + nome e dimensione (senza riquadro alto di anteprima). */
function RigaCompatta({
  storagePath, nomeFile, mimeType, dimensione, bucket = BUCKET_DEFAULT, azioni,
}: { storagePath: string; nomeFile: string; mimeType?: string | null; dimensione?: number | null; bucket?: string; azioni?: React.ReactNode }) {
  const tipo = tipoAllegato(mimeType, nomeFile);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (tipo !== "img") return;
    let attivo = true;
    urlFirmatoAllegato(storagePath, bucket).then((u) => attivo && setImgUrl(u)).catch(() => {});
    return () => { attivo = false; };
  }, [tipo, storagePath, bucket]);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {tipo === "img" && imgUrl ? (
        <img src={imgUrl} alt="" className="size-10 shrink-0 rounded border object-cover" />
      ) : (
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded border bg-muted/40">
          <FileText className={tipo === "pdf" ? "size-5 text-destructive" : "size-5"} />
        </span>
      )}
      <div className="min-w-[3.5rem] flex-1">
        <div className="text-xs font-medium break-all line-clamp-2">{nomeFile}</div>
        {dimensione != null && <div className="text-[10px] text-muted-foreground">{formatBytes(dimensione)}</div>}
      </div>
      {azioni && <div className="ml-auto flex shrink-0 flex-nowrap items-center">{azioni}</div>}
    </div>
  );
}

export function SchedaAllegato({
  storagePath, nomeFile, mimeType, dimensione, bucket, dettagli, azioni, azioniStandard, compatta,
}: {
  storagePath: string;
  nomeFile: string;
  mimeType?: string | null;
  dimensione?: number | null;
  bucket?: string;
  dettagli?: React.ReactNode;
  azioni?: React.ReactNode;
  /** Mostra Apri / Scarica e, se `onElimina` è presente, Elimina. */
  azioniStandard?: { onElimina?: () => void };
  /** Riga compatta senza miniatura grande. */
  compatta?: boolean;
}) {
  const azioniIcone = azioniStandard ? (
    <AzioniStandard storagePath={storagePath} nomeFile={nomeFile} bucket={bucket} onElimina={azioniStandard.onElimina} />
  ) : null;
  const azioniRiga = (azioni || (!compatta && azioniIcone)) ? (
    <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1">
      {azioni}
      {!compatta && azioniIcone}
    </div>
  ) : null;
  return (
    <li className="min-w-0 flex flex-col rounded-md border p-2">
      {compatta
        ? <RigaCompatta storagePath={storagePath} nomeFile={nomeFile} mimeType={mimeType} dimensione={dimensione} bucket={bucket}
            azioni={azioniIcone ?? undefined} />
        : <MiniaturaAllegato storagePath={storagePath} nomeFile={nomeFile} mimeType={mimeType} dimensione={dimensione} bucket={bucket} />}
      {(dettagli || azioniRiga) && (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
          {dettagli ? <div className="min-w-[3.5rem] flex-1 text-xs text-muted-foreground break-words">{dettagli}</div> : null}
          {azioniRiga}
        </div>
      )}
    </li>
  );
}

/** Scheda di un file scelto ma non ancora caricato: anteprima, nome, dimensione, Apri e Rimuovi. */
export function SchedaFileLocale({ file, onRimuovi }: { file: File; onRimuovi: () => void }) {
  const tipo = tipoAllegato(file.type, file.name);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      {tipo === "img" && url ? (
        <img src={url} alt="" className="h-14 w-10 shrink-0 rounded border object-cover" />
      ) : tipo === "pdf" ? (
        <span className="shrink-0"><MiniaturaPdfLocale file={file} /></span>
      ) : (
        <span className="inline-flex h-14 w-10 shrink-0 items-center justify-center rounded border bg-muted/40"><FileText className="size-4" /></span>
      )}
      <span className="min-w-[3.5rem] flex-1">
        <span className="block break-all line-clamp-2">{file.name}</span>
        <span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
      </span>
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-0.5">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8" disabled={!url}
          onClick={() => url && window.open(url, "_blank", "noopener")} aria-label={`Apri ${file.name}`} title="Apri">
          <ExternalLink className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
          onClick={onRimuovi} aria-label={`Rimuovi ${file.name}`} title="Rimuovi">
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}
