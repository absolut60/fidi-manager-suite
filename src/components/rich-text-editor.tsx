import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Link2, Link2Off, Image as ImageIcon, Undo2, Redo2, RemoveFormatting, Loader2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/**
 * Editor rich-text minimale basato su contentEditable + document.execCommand.
 * Produce HTML compatibile con i client di posta: tag semplici e stili inline.
 */

const COLORI: { label: string; value: string }[] = [
  { label: "Nero", value: "#1e293b" },
  { label: "Grigio", value: "#64748b" },
  { label: "Magenta", value: "#c94f8f" },
  { label: "Blu", value: "#1d4ed8" },
  { label: "Verde", value: "#15803d" },
  { label: "Rosso", value: "#b91c1c" },
];

/** Larghezza tipica del corpo email in pixel: riferimento per le percentuali. */
const LARGHEZZA_CORPO = 600;

/** Legge lo style inline di un elemento come mappa proprietà -> valore. */
function leggiStile(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of (el.getAttribute("style") ?? "").split(";")) {
    const i = p.indexOf(":");
    if (i > 0) out[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  }
  return out;
}

function serializzaStile(stile: Record<string, string>): string {
  return Object.entries(stile)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}:${v}`)
    .join(";") + ";";
}

function cmd(name: string, value?: string, useCss = false) {
  try {
    document.execCommand("styleWithCSS", false, useCss ? "true" : "false");
    document.execCommand(name, false, value);
  } catch {
    /* no-op */
  }
}

/** Rimuove classi/attributi non email-safe dall'HTML prodotto o incollato. */
export function pulisciHtmlEmail(html: string): string {
  if (typeof document === "undefined") return html;
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = html;
  doc.body.querySelectorAll("script,style,meta,link,iframe,object,embed").forEach((n) => n.remove());
  doc.body.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.removeAttribute("class");
    el.removeAttribute("id");
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || attr.name.startsWith("data-")) el.removeAttribute(attr.name);
    }
    if (el.tagName === "IMG") {
      const img = el as HTMLImageElement;
      const style = img.getAttribute("style") ?? "";
      if (!/max-width/.test(style)) img.setAttribute("style", `${style};max-width:100%;height:auto;`.replace(/^;/, ""));
    }
  });
  return doc.body.innerHTML;
}

export function RichTextEditor({
  value, onChange, onUploadImage, minHeight = 320, editorRef,
}: {
  value: string;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<string>;
  minHeight?: number;
  editorRef?: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const ref = editorRef ?? innerRef;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imgSelRef = useRef<HTMLImageElement | null>(null);
  const [imgSel, setImgSel] = useState<HTMLImageElement | null>(null);
  const [riquadro, setRiquadro] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [larghezzaDrag, setLarghezzaDrag] = useState<number | null>(null);
  // Sentinella: garantisce che al primo effetto (montaggio, anche dopo il
  // passaggio da "Modifica HTML") l'innerHTML venga sempre inizializzato.
  const lastHtml = useRef<string>("\u0000__non_inizializzato__");

  // Sincronizza il valore esterno solo quando differisce da quanto scritto qui
  // (evita di resettare il cursore ad ogni battuta). Il caso stringa vuota è
  // gestito esplicitamente: se il corpo viene svuotato dall'esterno, l'editor
  // deve svuotarsi davvero.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = value ?? "";
    if (next !== lastHtml.current) {
      el.innerHTML = next;
      lastHtml.current = next;
    }
  }, [value]);


  /**
   * Legge l'HTML corrente dal DOM e lo propaga a React.
   * Normalizza il "vuoto residuo" (<br>, <div><br></div>, &nbsp; lasciati dal
   * browser dopo Ctrl+A + Canc o dopo un undo) in stringa vuota, così
   * l'anteprima rispecchia sempre il contenuto reale.
   */
  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    let html = el.innerHTML;
    if (isEditorVuoto(el)) {
      html = "";
      if (el.innerHTML !== "") el.innerHTML = "";
    }
    if (html === lastHtml.current) return;
    lastHtml.current = html;
    onChange(html);
  }, [onChange]);

  // execCommand aggiorna il DOM in modo asincrono rispetto al gestore
  // dell'evento: rileggiamo l'innerHTML al frame successivo.
  const emitSoon = useCallback(() => {
    emit();
    requestAnimationFrame(emit);
  }, [emit]);

  const focusEditor = () => ref.current?.focus();

  const insertHtml = useCallback((html: string) => {
    focusEditor();
    document.execCommand("insertHTML", false, html);
    emitSoon();
  }, [emitSoon]);

  const caricaEInserisci = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      insertHtml(
        `<img src="${url}" alt="" style="width:100%;max-width:560px;height:auto;display:block;" />`,
      );
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert(e?.message ?? "Errore nel caricamento dell'immagine");
    } finally {
      setUploading(false);
    }
  }, [insertHtml, onUploadImage]);

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItem = items.find((i) => i.type.startsWith("image/"));
    if (imgItem) {
      const file = imgItem.getAsFile();
      if (file) {
        e.preventDefault();
        void caricaEInserisci(file);
        return;
      }
    }
    const html = e.clipboardData?.getData("text/html");
    if (html) {
      e.preventDefault();
      insertHtml(pulisciHtmlEmail(html));
    }
  }, [caricaEInserisci, insertHtml]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void caricaEInserisci(file);
    }
  }, [caricaEInserisci]);

  const applica = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    focusEditor();
    fn();
    emitSoon();
  };

  const inserisciLink = () => {
    const url = window.prompt("Indirizzo del link (https://...)");
    if (!url) return;
    cmd("createLink", url);
  };

  // ---- Selezione e ridimensionamento immagini ----------------------------
  const aggiornaRiquadro = useCallback(() => {
    const img = imgSelRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) { setRiquadro(null); return; }
    const r = img.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    setRiquadro({ left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height });
  }, []);

  const selezionaImmagine = useCallback((img: HTMLImageElement) => {
    imgSelRef.current = img;
    setImgSel(img);
    requestAnimationFrame(aggiornaRiquadro);
  }, [aggiornaRiquadro]);

  const deselezionaImmagine = useCallback(() => {
    imgSelRef.current = null;
    setImgSel(null);
    setRiquadro(null);
    setLarghezzaDrag(null);
  }, []);

  /** Scrive gli stili inline email-safe sull'immagine selezionata. */
  const scriviStile = useCallback((patch: Record<string, string>) => {
    const img = imgSelRef.current;
    if (!img) return;
    const stile = { ...leggiStile(img), ...patch };
    stile["max-width"] = stile["max-width"] || "100%";
    stile["height"] = "auto";
    img.setAttribute("style", serializzaStile(stile));
    emitSoon();
    requestAnimationFrame(aggiornaRiquadro);
  }, [emitSoon, aggiornaRiquadro]);

  const applicaAllineamento = useCallback((a: "left" | "center" | "right") => {
    const margine = a === "center" ? "0 auto" : a === "right" ? "0 0 0 auto" : "0 auto 0 0";
    scriviStile({ display: "block", margin: margine });
  }, [scriviStile]);

  const rimuoviImmagine = useCallback(() => {
    imgSelRef.current?.remove();
    deselezionaImmagine();
    emitSoon();
  }, [deselezionaImmagine, emitSoon]);

  /**
   * Trascinamento di una delle 8 maniglie. Le proporzioni sono sempre
   * mantenute (email-safe): si calcola solo la larghezza.
   */
  const iniziaTrascinamento = useCallback((dir: Maniglia) => (e: React.PointerEvent) => {
    const img = imgSelRef.current;
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const r = img.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = r.width;
    const rapporto = r.height > 0 ? r.width / r.height : 1;
    const segnoX = dir.includes("e") ? 1 : dir.includes("w") ? -1 : 0;
    const segnoY = dir.includes("s") ? 1 : dir.includes("n") ? -1 : 0;

    const calcola = (ev: PointerEvent) => {
      const delta = segnoX !== 0
        ? segnoX * (ev.clientX - startX)
        : segnoY * (ev.clientY - startY) * rapporto;
      return Math.max(40, Math.min(LARGHEZZA_CORPO, Math.round(startW + delta)));
    };

    const onMove = (ev: PointerEvent) => {
      const v = calcola(ev);
      setLarghezzaDrag(v);
      // Durante il trascinamento tocchiamo solo il DOM, per fluidità.
      const stile = { ...leggiStile(img), width: `${v}px`, "max-width": `${v}px`, height: "auto", display: "block" };
      img.setAttribute("style", serializzaStile(stile));
      aggiornaRiquadro();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setLarghezzaDrag(null);
      emitSoon();
      requestAnimationFrame(aggiornaRiquadro);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [aggiornaRiquadro, emitSoon]);

  // Se il contenuto cambia dall'esterno l'immagine selezionata può non esistere più.
  useEffect(() => {
    if (imgSelRef.current && !imgSelRef.current.isConnected) deselezionaImmagine();
  }, [value, deselezionaImmagine]);

  const btn = "h-8 w-8 p-0";

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b p-1">
        <Button type="button" variant="ghost" size="sm" className={btn} title="Grassetto" onMouseDown={applica(() => cmd("bold"))}><Bold className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Corsivo" onMouseDown={applica(() => cmd("italic"))}><Italic className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Sottolineato" onMouseDown={applica(() => cmd("underline"))}><Underline className="size-4" /></Button>
        <Separator orientation="vertical" className="mx-1 h-6" />

        <Select onValueChange={(v) => { focusEditor(); cmd("formatBlock", v); emitSoon(); }}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Testo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="p">Paragrafo</SelectItem>
            <SelectItem value="h2">Titolo grande</SelectItem>
            <SelectItem value="h3">Titolo piccolo</SelectItem>
          </SelectContent>
        </Select>

        <Select onValueChange={(v) => { focusEditor(); cmd("foreColor", v, true); emitSoon(); }}>
          <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Colore" /></SelectTrigger>
          <SelectContent>
            {COLORI.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block size-3 rounded-full border" style={{ background: c.value }} />
                  {c.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button type="button" variant="ghost" size="sm" className={btn} title="Elenco puntato" onMouseDown={applica(() => cmd("insertUnorderedList"))}><List className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Elenco numerato" onMouseDown={applica(() => cmd("insertOrderedList"))}><ListOrdered className="size-4" /></Button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button type="button" variant="ghost" size="sm" className={btn} title="Allinea a sinistra" onMouseDown={applica(() => cmd("justifyLeft", undefined, true))}><AlignLeft className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Centra" onMouseDown={applica(() => cmd("justifyCenter", undefined, true))}><AlignCenter className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Allinea a destra" onMouseDown={applica(() => cmd("justifyRight", undefined, true))}><AlignRight className="size-4" /></Button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button type="button" variant="ghost" size="sm" className={btn} title="Inserisci link" onMouseDown={applica(inserisciLink)}><Link2 className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Rimuovi link" onMouseDown={applica(() => cmd("unlink"))}><Link2Off className="size-4" /></Button>
        <Button
          type="button" variant="ghost" size="sm" className={btn} title="Inserisci immagine"
          disabled={uploading}
          onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); }}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
        </Button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button type="button" variant="ghost" size="sm" className={btn} title="Annulla" onMouseDown={applica(() => cmd("undo"))}><Undo2 className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Ripristina" onMouseDown={applica(() => cmd("redo"))}><Redo2 className="size-4" /></Button>
        <Button type="button" variant="ghost" size="sm" className={btn} title="Rimuovi formattazione" onMouseDown={applica(() => cmd("removeFormat"))}><RemoveFormatting className="size-4" /></Button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void caricaEInserisci(f);
          }}
        />
      </div>

      {imgSel && (
        <div
          contentEditable={false}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 p-1.5 text-xs"
        >
          <span className="px-1 font-medium text-muted-foreground">Immagine:</span>
          <Button type="button" size="sm" variant="outline" className="h-7 w-7 p-0" title="Allinea a sinistra"
            onMouseDown={(e) => { e.preventDefault(); applicaAllineamento("left"); }}><AlignLeft className="size-3.5" /></Button>
          <Button type="button" size="sm" variant="outline" className="h-7 w-7 p-0" title="Centra"
            onMouseDown={(e) => { e.preventDefault(); applicaAllineamento("center"); }}><AlignCenter className="size-3.5" /></Button>
          <Button type="button" size="sm" variant="outline" className="h-7 w-7 p-0" title="Allinea a destra"
            onMouseDown={(e) => { e.preventDefault(); applicaAllineamento("right"); }}><AlignRight className="size-3.5" /></Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive"
            onMouseDown={(e) => { e.preventDefault(); rimuoviImmagine(); }}>
            <Trash2 className="mr-1 size-3.5" /> Rimuovi immagine
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2"
            onMouseDown={(e) => { e.preventDefault(); deselezionaImmagine(); }}>
            Chiudi
          </Button>
          <span className="ml-auto px-1 text-muted-foreground">Trascina le maniglie per ridimensionare</span>
        </div>
      )}

      <div className="relative" ref={wrapRef}>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Corpo email"
          className="prose prose-sm max-w-none overflow-y-auto p-3 text-sm outline-none"
          style={{ minHeight, maxHeight: 460 }}
          onInput={emit}
          onKeyUp={emit}
          onCut={emitSoon}
          onBlur={emit}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onScroll={aggiornaRiquadro}
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t?.tagName === "IMG") selezionaImmagine(t as HTMLImageElement);
            else deselezionaImmagine();
          }}
        />

        {imgSel && riquadro && (
          <div
            className="pointer-events-none absolute z-10 rounded-sm"
            style={{
              left: riquadro.left, top: riquadro.top, width: riquadro.width, height: riquadro.height,
              outline: "2px solid #c94f8f", outlineOffset: 1,
            }}
          >
            {MANIGLIE.map((m) => (
              <div
                key={m.dir}
                className="pointer-events-auto absolute rounded-[2px] border border-white shadow"
                style={{ ...m.pos, width: 10, height: 10, background: "#c94f8f", cursor: m.cursor, touchAction: "none" }}
                onPointerDown={iniziaTrascinamento(m.dir)}
                title="Trascina per ridimensionare"
              />
            ))}
            {larghezzaDrag !== null && (
              <div
                className="absolute rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                style={{ left: "50%", top: -24, transform: "translateX(-50%)", background: "#c94f8f" }}
              >
                {larghezzaDrag} px
              </div>
            )}
          </div>
        )}
      </div>


      {uploading && (
        <div className="flex items-center gap-2 border-t px-3 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Caricamento immagine in corso…
        </div>
      )}
    </div>
  );
}

/** True se l'editor non contiene nulla di significativo (solo <br>/spazi). */
function isEditorVuoto(el: HTMLElement): boolean {
  if (el.querySelector("img,hr,table,video,iframe")) return false;
  return el.textContent?.replace(/\u00a0/g, " ").trim() === "";
}

/** Inserisce testo semplice (es. placeholder) nel punto del cursore dell'editor. */
export function inserisciTestoNellEditor(container: HTMLElement | null, testo: string): boolean {
  if (!container) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !container.contains(sel.anchorNode)) return false;
  container.focus();
  document.execCommand("insertText", false, testo);
  return true;
}
