import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { articoliAperturaPicker, cercaArticoliPreventivo } from "@/lib/articoli-preventivo.functions";
import { BadgePrezzoCantiere } from "@/components/badge-prezzi-dedicati";
import { FiltriCatalogoArticoli } from "@/components/articoli/FiltriCatalogoArticoli";
import { quantitaArticolo, ricercaPreventivoAttiva } from "@/lib/catalogo-articoli";
import type { ScelteCascata } from "@/lib/filtri-catalogo-articoli";

/** FM65 F4: filtri del selettore ricordati solo in memoria per il preventivo aperto (tutte le righe); un altro preventivo riparte vuoto. */
const NESSUN_FILTRO: ScelteCascata = { famiglie: [], coppie: [], marche: [] };
let filtriMemoria: { preventivoId: string | null; scelte: ScelteCascata } = { preventivoId: null, scelte: NESSUN_FILTRO };
const ascoltatori = new Set<() => void>();
function useFiltriPicker(preventivoId: string | null) {
  const scelte = useSyncExternalStore(
    (cb) => { ascoltatori.add(cb); return () => ascoltatori.delete(cb); },
    () => (filtriMemoria.preventivoId === preventivoId ? filtriMemoria.scelte : NESSUN_FILTRO),
    () => NESSUN_FILTRO,
  );
  const imposta = (s: ScelteCascata) => { filtriMemoria = { preventivoId, scelte: s }; ascoltatori.forEach((cb) => cb()); };
  return [scelte, imposta] as const;
}

export interface ArticoloGammaScelto { codice: string; descrizione: string | null; marca: string | null; um: string | null }

/** FM65: selettore articoli del catalogo Gamma per la riga preventivo. Non mostra prezzi (seguono il cliente). */
export function ArticoloGammaPicker({
  codice, descrizione, onChange, autoOpen = false, disabled = false, soloCodice = false, preventivoId = null, sedeGiacenzaId = null, sedeNome = null, cantiereId = null,
}: {
  /** FM65 F4: chiave della memoria dei filtri (per preventivo). */
  preventivoId?: string | null;
  sedeGiacenzaId?: string | null;
  sedeNome?: string | null;
  cantiereId?: string | null;
  codice: string | null;
  descrizione: string | null;
  onChange: (a: ArticoloGammaScelto) => void;
  autoOpen?: boolean;
  disabled?: boolean;
  soloCodice?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const cerca = useServerFn(cercaArticoliPreventivo);
  const apertura = useServerFn(articoliAperturaPicker);
  const [scelte, setScelte] = useFiltriPicker(preventivoId);
  const nFiltri = scelte.famiglie.length + scelte.coppie.length + scelte.marche.length;
  const attiva = ricercaPreventivoAttiva(qDeb, scelte);
  const { data: suggeriti = [], isFetching: caricaApertura, isError: erroreApertura } = useQuery({
    queryKey: ["articoli-picker-apertura", cantiereId, sedeGiacenzaId],
    queryFn: () => apertura({ data: { ...(cantiereId ? { cantiere_id: cantiereId } : {}), ...(sedeGiacenzaId ? { sede_giacenza: sedeGiacenzaId } : {}) } }),
    // Also load on a directly opened active search, so site-price badges are accurate.
    enabled: open && (!attiva || !!cantiereId),
    staleTime: 60_000,
  });
  const delCantiere = suggeriti.filter(a => a.gruppo === "cantiere");
  const recenti = suggeriti.filter(a => a.gruppo === "recente");
  const codiciCantiere = new Set(delCantiere.map(a => a.codice));

  // Responsive copies stay mounted; only a laid-out trigger may own a portal.
  // Observe layout, not a duplicated breakpoint (including landscape/tablet rules).
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    let autoOpenConsumed = false;
    const aggiorna = () => {
      const visibile = trigger.getClientRects().length > 0;
      if (!visibile) setOpen(false);
      else if (autoOpen && !disabled && !autoOpenConsumed) {
        autoOpenConsumed = true;
        setOpen(true);
      }
    };
    const observer = new ResizeObserver(aggiorna);
    observer.observe(trigger);
    aggiorna();
    return () => observer.disconnect();
  }, [autoOpen, disabled]);
  useEffect(() => {
    const t = window.setTimeout(() => setQDeb(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const { data, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, isError } = useInfiniteQuery({
    queryKey: ["articoli-gamma-preventivo", qDeb, scelte, sedeGiacenzaId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => cerca({ data: { testo: qDeb, ...scelte, ...(sedeGiacenzaId ? { sede_giacenza: sedeGiacenzaId } : {}), offset: pageParam } }),
    getNextPageParam: (lastPage, pages) => {
      const caricati = pages.reduce((n, p) => n + p.length, 0);
      return lastPage.length > 0 && caricati < Number(lastPage[0]?.totale ?? 0) ? caricati : undefined;
    },
    enabled: open && attiva,
    staleTime: 60_000,
  });
  const items = data?.pages.flat() ?? [];
  const totale = Number(data?.pages[0]?.[0]?.totale ?? 0);

  const label = codice ? (soloCodice ? codice : `${codice} · ${descrizione ?? ""}`) : null;
  const riga = (a: ArticoloGammaScelto & { giacenza_sede: number | null; giacenza_logistica: number | null }) => (
    <Button key={a.codice} type="button" variant="ghost"
      onClick={() => { onChange(a); setOpen(false); }}
      className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0 whitespace-normal rounded-none border-b px-2 py-1.5 text-left text-xs hover:bg-accent">
      <span className="min-w-0">
        <span className="font-mono font-semibold">{a.codice}</span>
        <span className="block break-words">{a.descrizione}{a.marca && <span className="font-semibold text-primary"> · {a.marca}</span>}{codiciCantiere.has(a.codice) && <> <BadgePrezzoCantiere /></>}</span>
      </span>
      <span className="min-w-16 shrink-0 whitespace-nowrap text-right text-muted-foreground">
        <span className="block">{a.um ?? ""}</span>
        {sedeGiacenzaId && <>
          <span className={`block whitespace-nowrap ${Number(a.giacenza_sede) > 0 ? "font-bold text-foreground" : "text-muted-foreground"}`}>{Number(a.giacenza_sede) > 0 ? quantitaArticolo(Number(a.giacenza_sede), a.um) : "0"}</span>
          {Number(a.giacenza_logistica) > 0 && <span className="block whitespace-nowrap text-[11px]">+{quantitaArticolo(Number(a.giacenza_logistica))} log.</span>}
        </>}
      </span>
    </Button>
  );

  return (
    <Popover modal open={open} onOpenChange={(next) => setOpen(next && !disabled && !!triggerRef.current?.getClientRects().length)}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} variant={soloCodice ? "ghost" : "outline"} role="combobox" disabled={disabled}
          title={label ?? undefined}
          className={soloCodice ? "h-auto min-h-[26px] w-full justify-start rounded border border-transparent bg-transparent whitespace-normal px-1.5 py-1 text-left font-mono text-xs shadow-none hover:border-input hover:bg-transparent focus:border-ring focus:bg-card focus-visible:ring-0" : "h-auto min-h-8 w-full justify-between whitespace-normal px-2 py-1 text-left font-mono text-xs"}>
          <span className={soloCodice ? "min-w-0 break-all whitespace-normal" : "line-clamp-2 min-w-0 break-words"}>{label ?? (soloCodice ? "Scegli codice…" : "Cerca articolo Gamma…")}</span>
          {!soloCodice && <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex max-h-[min(90dvh,var(--radix-popover-content-available-height))] w-[min(96vw,780px)] flex-col overflow-hidden p-0" align="start" collisionPadding={6}>
        <div className="shrink-0 border-b px-2 py-1.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 [&>*]:min-w-0">
            <FiltriCatalogoArticoli scelte={scelte} onChange={setScelte} />
          </div>
          {nFiltri > 0 && <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" className="min-h-10 px-2 text-xs" onClick={() => setScelte(NESSUN_FILTRO)}>Azzera filtri</Button></div>}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Codice, descrizione o marca…" aria-label="Cerca articolo Gamma"
            className="h-9 border-0 px-0 text-sm focus-visible:ring-0" />
        </div>
        {sedeNome && <div className="shrink-0 border-b px-2 py-1 text-xs text-muted-foreground break-words">Giacenze: {sedeNome}</div>}
        <div role="list" aria-label="Risultati articoli Gamma" className="min-h-0 max-h-[60dvh] overflow-y-auto overscroll-contain sm:max-h-[520px]">
          {!attiva ? (
            <>
              {delCantiere.length > 0 && <><p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Prezzi del cantiere</p>{delCantiere.map(riga)}</>}
              {recenti.length > 0 && <><p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Usati di recente</p>{recenti.map(riga)}</>}
              {suggeriti.length === 0 && <div className="p-3 text-xs text-muted-foreground">{caricaApertura ? "Caricamento…" : erroreApertura ? "Caricamento non riuscito." : "Scrivi almeno 2 caratteri o scegli un filtro."}</div>}
            </>
          ) : items.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">{isFetching ? "Ricerca…" : isError ? "Ricerca non riuscita." : "Nessun articolo trovato."}</div>
          ) : items.map(riga)}
        </div>
        {attiva && data && <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-t px-2 py-1 text-xs text-muted-foreground">
          <span role="status">{items.length.toLocaleString("it-IT")} di {totale.toLocaleString("it-IT")}</span>
          {hasNextPage && <Button type="button" variant="ghost" className="min-h-10 px-2 text-xs" disabled={isFetching} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Caricamento…" : "Mostra altri 30"}</Button>}
          {isError && <span role="alert">Caricamento non riuscito. Riprova.</span>}
        </div>}
      </PopoverContent>
    </Popover>
  );
}
