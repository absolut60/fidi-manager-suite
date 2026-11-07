/**
 * Anteprima allegati stile WhatsApp, riutilizzabile (chat, task, richieste, schede).
 * - MiniaturaAllegato: immagine, prima pagina PDF (pdf.js) o riga file.
 * - VisualizzatoreAllegato: visualizzazione a schermo intero + "Scarica / Condividi".
 * pdf.js è configurato solo in src/lib/pdfjs.ts; il salvataggio passa da src/lib/salva-file.ts.
 */
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Mail, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apriPdf, canvasTuttoBianco } from "@/lib/pdfjs";
import { salvaFile, salvaFileDaUrl } from "@/lib/salva-file";
import { leggiEmailAllegato, type EmailAllegato } from "@/lib/email-allegato";

const BUCKET_DEFAULT = "allegati";
const SCADENZA_URL_S = 600; // 10 minuti
const LARGHEZZA_MINIATURA = 220;

export function formatBytes(b: number | null | undefined) {
  if (!b && b !== 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function tipoAllegato(mimeType: string | null | undefined, nomeFile: string): "img" | "pdf" | "email" | "altro" {
  const m = (mimeType ?? "").toLowerCase();
  if (/\.(msg|eml)$/i.test(nomeFile) || m === "application/vnd.ms-outlook" || m === "message/rfc822") return "email";
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
  const doc = await apriPdf(data);
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
    if (canvasTuttoBianco(canvas)) throw new Error("pagina bianca");
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
function RigaFile({ nomeFile, dimensione, onClick, email = false }: { nomeFile: string; dimensione?: number | null; onClick?: () => void; email?: boolean }) {
  return (
    <Button variant="ghost"
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full max-w-full items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-left text-foreground min-h-10"
    >
      {email ? <Mail className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
      <span className="text-xs break-all line-clamp-2 min-w-0 flex-1">{nomeFile}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(dimensione)}</span>
    </Button>
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
    if (!visto || tipo === "altro" || tipo === "email") return;
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
      ) : tipo === "email" ? (
        <RigaFile email nomeFile={nomeFile} dimensione={dimensione} onClick={() => setAperto(true)} />
      ) : (
        <RigaFile nomeFile={nomeFile} dimensione={dimensione} onClick={salvaDiretto} />
      )}
      {tipo !== "altro" && (
        <VisualizzatoreAllegato
          open={aperto}
          onOpenChange={setAperto}
          storagePath={storagePath}
          nomeFile={nomeFile}
          mimeType={mimeType}
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
  open, onOpenChange, storagePath, file, nomeFile, tipo, mimeType, bucket = BUCKET_DEFAULT,
}: {
  bucket?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Sorgente remota (allegato salvato)… */
  storagePath?: string;
  /** …oppure file locale scelto ma non ancora caricato. */
  file?: File;
  mimeType?: string | null;
  nomeFile: string;
  tipo: "img" | "pdf" | "email";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const paginaRef = useRef<HTMLDivElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState(false);
  const [dettaglioErrore, setDettaglioErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [email, setEmail] = useState<EmailAllegato | null>(null);
  const [htmlEmail, setHtmlEmail] = useState<string | null>(null);
  const [interno, setInterno] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    let annullato = false;
    let doc: import("pdfjs-dist").PDFDocumentProxy | null = null;
    let urlLocale: string | null = null;
    let fase: "download" | "lettura email" | "sanitizzazione" | "pdf" = "download";
    setErrore(false);
    setDettaglioErrore(null);
    setCaricamento(true);
    setEmail(null); setHtmlEmail(null); setInterno(null);

    (async () => {
      try {
        if (tipo === "img") {
          if (file) {
            urlLocale = URL.createObjectURL(file);
            if (!annullato) { setImgUrl(urlLocale); setCaricamento(false); }
            return;
          }
          if (!storagePath) throw new Error("Sorgente mancante");
          const url = await urlFirmatoAllegato(storagePath, bucket);
          if (!annullato) { setImgUrl(url); setCaricamento(false); }
          return;
        }
        let dati: ArrayBuffer;
        if (file) dati = await file.arrayBuffer();
        else {
          if (!storagePath) throw new Error("Sorgente mancante");
          const res = await fetch(await urlFirmatoAllegato(storagePath, bucket));
          if (!res.ok) throw new Error(`Download non riuscito (HTTP ${res.status})`);
          dati = await res.arrayBuffer();
        }
        if (annullato) return;
        if (tipo === "email") {
          fase = "lettura email";
          const letta = await leggiEmailAllegato(dati, nomeFile, file?.type || mimeType || "");
          let html: string | null = null;
          if (letta.corpoHtml) {
            fase = "sanitizzazione";
            const { default: DOMPurify } = await import("dompurify");
            const sicuro = DOMPurify.sanitize(letta.corpoHtml, {
              WHOLE_DOCUMENT: false,
              FORBID_TAGS: ["script", "style", "form", "input", "button", "iframe", "object", "embed", "img", "svg", "math", "link", "meta"],
              FORBID_ATTR: ["href", "src", "srcset", "background", "action", "formaction"],
            });
            html = `<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:14px Arial,sans-serif;margin:12px;overflow-wrap:anywhere}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${sicuro}</body></html>`;
          }
          if (!annullato) { setEmail(letta); setHtmlEmail(html); setCaricamento(false); }
          return;
        }
        fase = "pdf";
        doc = await apriPdf(dati);
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
          if (i === 1 && canvasTuttoBianco(canvas)) throw new Error("pagina bianca");
          if (i === 1 && !annullato) setCaricamento(false);
        }
        if (!annullato) setCaricamento(false);
      } catch (error) {
        console.error("Errore anteprima allegato", { fase, error });
        if (paginaRef.current) paginaRef.current.innerHTML = "";
        if (!annullato) {
          const messaggio = error instanceof Error ? error.message : String(error);
          setDettaglioErrore(`${fase} — ${messaggio}`);
          setErrore(true); setCaricamento(false);
        }
      }
    })();

    return () => {
      annullato = true;
      if (urlLocale) { URL.revokeObjectURL(urlLocale); setImgUrl(null); }
      (doc as { destroy?: () => Promise<void> } | null)?.destroy?.().catch(() => {});
      if (paginaRef.current) paginaRef.current.innerHTML = "";
    };
  }, [open, storagePath, file, tipo, bucket, nomeFile, mimeType]);

  async function salva() {
    if (!storagePath && !file) return;
    setSalvando(true);
    try {
      if (file) await salvaFile(file, nomeFile);
      else if (storagePath) await salvaFileDaUrl(await urlFirmatoAllegato(storagePath, bucket), nomeFile);
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
        className="flex flex-col gap-0 p-0 w-screen max-w-none h-[100dvh] rounded-none sm:rounded-lg sm:w-[95vw] sm:max-w-4xl sm:h-[90vh] overflow-hidden [&>button.absolute]:hidden"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2 min-w-0">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold break-all line-clamp-2" title={nomeFile}>{nomeFile}</DialogTitle>
            <DialogDescription className="sr-only">Anteprima dell'allegato</DialogDescription>
          </div>
          {file && tipo !== "email" ? (
            <DialogClose asChild>
              <Button size="sm" variant="secondary" className="shrink-0 h-10">Chiudi</Button>
            </DialogClose>
          ) : (
            <Button size="sm" onClick={salva} disabled={salvando} className="shrink-0 gap-1.5 h-10">
              {salvando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              <span className="hidden sm:inline">Scarica / Condividi</span>
              <span className="sm:hidden">Salva</span>
            </Button>
          )}
          <DialogClose asChild>
            <Button size="icon" variant="ghost" className="size-10 shrink-0" aria-label="Chiudi anteprima" title="Chiudi">
              <X className="size-5" />
            </Button>
          </DialogClose>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/40 p-2">
          {caricamento && (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin mr-2" /> Caricamento…
            </div>
          )}
          {errore && (
            <div className="p-6 text-center text-sm text-destructive">
              <p>Anteprima non disponibile.</p>
              {dettaglioErrore && <p className="mt-2 break-words text-xs text-muted-foreground">Dettaglio: {dettaglioErrore}</p>}
              {(!file || tipo === "email") && (
                <Button size="sm" onClick={salva} disabled={salvando} className="mt-3 gap-1.5 h-10">
                  {salvando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Scarica
                </Button>
              )}
            </div>
          )}
          {tipo === "img" && imgUrl && !errore && (
            <img src={imgUrl} alt={nomeFile} className="block w-full h-auto rounded-md" onError={() => {
              const error = new Error("Immagine non disponibile o formato non supportato");
              console.error("Errore anteprima allegato", { fase: "download", error });
              setDettaglioErrore(`download — ${error.message}`);
              setErrore(true); setCaricamento(false);
            }} />
          )}
          {tipo === "pdf" && <div ref={paginaRef} className="mx-auto w-full" />}
          {tipo === "email" && email && !errore && (
            <div className="min-w-0 space-y-4 p-1 sm:p-3">
              <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Oggetto</dt><dd className="break-words font-semibold">{email.oggetto}</dd>
                <dt className="text-muted-foreground">Da</dt><dd className="break-words">{email.mittente || "—"}</dd>
                <dt className="text-muted-foreground">A</dt><dd className="break-words">{email.destinatari.a.join(", ") || "—"}</dd>
                <dt className="text-muted-foreground">CC</dt><dd className="break-words">{email.destinatari.cc.join(", ") || "—"}</dd>
                <dt className="text-muted-foreground">Data</dt><dd className="break-words">{email.data && !Number.isNaN(Date.parse(email.data)) ? new Date(email.data).toLocaleString("it-IT") : "—"}</dd>
              </dl>
              {htmlEmail ? <iframe title="Corpo dell'email" sandbox="" referrerPolicy="no-referrer" srcDoc={htmlEmail} className="h-[55dvh] min-h-60 w-full rounded-md border bg-background" />
                : <div className="whitespace-pre-wrap break-words border-t pt-3 text-sm">{email.corpoTesto || "(Testo non disponibile)"}</div>}
              {email.allegati.length > 0 && <section className="border-t pt-3">
                <h3 className="mb-2 text-sm font-semibold">Allegati ({email.allegati.length})</h3>
                <ul className="space-y-2">{email.allegati.map((a, i) => {
                  const tipoInterno = tipoAllegato(a.mime, a.nome);
                  return <li key={i} className="flex min-w-0 items-center gap-2 rounded-md border p-2">
                    <FileText className="size-4 shrink-0" /><span className="min-w-0 flex-1 break-words text-sm">{a.nome}<span className="block text-xs text-muted-foreground">{formatBytes(a.byte.length)}</span></span>
                    <Button size="icon" variant="ghost" className="size-10 shrink-0" title={tipoInterno === "pdf" || tipoInterno === "img" ? "Apri anteprima" : "Scarica"} aria-label={`${tipoInterno === "pdf" || tipoInterno === "img" ? "Apri anteprima di" : "Scarica"} ${a.nome}`} onClick={async () => {
                      const locale = new File([new Uint8Array(a.byte)], a.nome, { type: a.mime });
                      if (tipoInterno === "pdf" || tipoInterno === "img") setInterno(locale);
                      else try { await salvaFile(locale, a.nome); } catch { toast.error("Impossibile scaricare il file"); }
                    }}>{tipoInterno === "pdf" || tipoInterno === "img" ? <ExternalLink className="size-4" /> : <Download className="size-4" />}</Button>
                  </li>;
                })}</ul>
              </section>}
            </div>
          )}
        </div>
        {interno && <VisualizzatoreAllegato open onOpenChange={(v) => { if (!v) setInterno(null); }} file={interno} nomeFile={interno.name} tipo={tipoAllegato(interno.type, interno.name) === "pdf" ? "pdf" : "img"} />}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Scheda in elenco (miniatura + dati + azioni sempre visibili) ----------
/** Griglia standard per elenchi di allegati: 1–2 per riga a 360 px, affiancati su desktop. */
export const GRIGLIA_ALLEGATI = "grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3";

/** Azioni standard di un allegato salvato: Apri, Scarica e (se permesso) Elimina. Solo icone, su una riga. */
function AzioniStandard({
  storagePath, nomeFile, mimeType, bucket = BUCKET_DEFAULT, onElimina,
}: { storagePath: string; nomeFile: string; mimeType?: string | null; bucket?: string; onElimina?: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const [aperto, setAperto] = useState(false);
  const tipo = tipoAllegato(mimeType, nomeFile);
  async function scarica() {
    setSalvando(true);
    try { await salvaFileDaUrl(await urlFirmatoAllegato(storagePath, bucket), nomeFile); }
    catch { toast.error("Impossibile scaricare il file"); }
    finally { setSalvando(false); }
  }
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-0.5">
      {tipo !== "altro" ? (
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8"
          onClick={() => setAperto(true)} aria-label={`Apri anteprima di ${nomeFile}`} title="Apri anteprima">
          <ExternalLink className="size-4" />
        </Button>
      ) : (
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8" onClick={scarica}
          disabled={salvando} aria-label={`Scarica ${nomeFile} (anteprima non disponibile)`} title="Anteprima non disponibile: scarica il file">
          <Download className="size-4" />
        </Button>
      )}
      {tipo !== "altro" && (
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8" onClick={scarica}
          disabled={salvando} aria-label={`Scarica ${nomeFile}`} title="Scarica">
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
      )}
      {onElimina && (
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive sm:h-8 sm:w-8"
          onClick={onElimina} aria-label={`Elimina ${nomeFile}`} title="Elimina">
          <Trash2 className="size-4" />
        </Button>
      )}
      {tipo !== "altro" && (
        <VisualizzatoreAllegato open={aperto} onOpenChange={setAperto} storagePath={storagePath}
          nomeFile={nomeFile} tipo={tipo} mimeType={mimeType} bucket={bucket} />
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
  const [aperto, setAperto] = useState(false);
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
          {tipo === "email" ? <Mail className="size-5" /> : <FileText className={tipo === "pdf" ? "size-5 text-destructive" : "size-5"} />}
        </span>
      )}
      <div className="min-w-[3.5rem] flex-1">
        {tipo === "email" ? <Button variant="ghost" className="h-auto min-h-10 w-full justify-start whitespace-normal p-0 text-left text-xs" onClick={() => setAperto(true)} aria-label={`Apri anteprima di ${nomeFile}`}><span className="break-all line-clamp-2">{nomeFile}</span></Button>
          : <div className="text-xs font-medium break-all line-clamp-2">{nomeFile}</div>}
        {dimensione != null && <div className="text-[10px] text-muted-foreground">{formatBytes(dimensione)}</div>}
      </div>
      {azioni && <div className="ml-auto flex shrink-0 flex-nowrap items-center">{azioni}</div>}
      {tipo === "email" && <VisualizzatoreAllegato open={aperto} onOpenChange={setAperto} storagePath={storagePath} nomeFile={nomeFile} mimeType={mimeType} tipo="email" bucket={bucket} />}
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
    <AzioniStandard storagePath={storagePath} nomeFile={nomeFile} mimeType={mimeType} bucket={bucket} onElimina={azioniStandard.onElimina} />
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
  const [aperto, setAperto] = useState(false);
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
        <span className="inline-flex h-14 w-10 shrink-0 items-center justify-center rounded border bg-muted/40">{tipo === "email" ? <Mail className="size-4" /> : <FileText className="size-4" />}</span>
      )}
      <span className="min-w-[3.5rem] flex-1">
        <span className="block break-all line-clamp-2">{file.name}</span>
        <span className="block text-xs text-muted-foreground">{formatBytes(file.size)}</span>
      </span>
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-0.5">
        {tipo !== "altro" && (
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8"
            onClick={() => setAperto(true)} aria-label={`Apri anteprima di ${file.name}`} title="Apri anteprima">
            <ExternalLink className="size-4" />
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
          onClick={onRimuovi} aria-label={`Rimuovi ${file.name}`} title="Rimuovi">
          <X className="size-4" />
        </Button>
      </div>
      {tipo !== "altro" && (
        <VisualizzatoreAllegato open={aperto} onOpenChange={setAperto} file={file} nomeFile={file.name} tipo={tipo} />
      )}
    </li>
  );
}
