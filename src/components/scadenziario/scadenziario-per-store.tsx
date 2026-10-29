// Dettaglio per punto vendita dello Scadenziario.
// Fonte: get_scadenziario_per_store (stessi parametri di get_scadenziario_totali);
// la somma delle righe coincide con i totali. Nessun ricalcolo qui, solo somme per la riga "Totale".
import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronDown, Info, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatEuro } from "@/lib/fidi";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const QK_SCADENZIARIO_PER_STORE = "scadenziario-per-store";

type RigaStore = {
  store_id: string | null;
  store_nome: string;
  n_clienti_scaduti: number;
  tot_scaduto: number;
  tot_a_scadere: number;
  n_bloccati: number;
  n_in_legale: number;
  tot_coperto_piani: number;
  tot_coperto_promesse: number;
};
type Chiave = keyof Omit<RigaStore, "store_id">;

const COLONNE: { k: Chiave; label: string; euro?: boolean }[] = [
  { k: "store_nome", label: "Negozio" },
  { k: "tot_scaduto", label: "Scaduto", euro: true },
  { k: "n_clienti_scaduti", label: "Clienti con scaduto" },
  { k: "tot_a_scadere", label: "A scadere", euro: true },
  { k: "tot_coperto_piani", label: "di cui piani", euro: true },
  { k: "tot_coperto_promesse", label: "di cui promesse", euro: true },
  { k: "n_bloccati", label: "Bloccati" },
  { k: "n_in_legale", label: "In legale" },
];

const TESTO_SENZA = "Clienti senza negozio in anagrafica Gamma";

function Barretta({ v, max }: { v: number; max: number }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden" aria-hidden>
      <div className="h-full bg-destructive/70" style={{ width: `${w}%` }} />
    </div>
  );
}

export function ScadenziarioPerStore({ params, aperto, onToggle, storeSelezionato, onSelezionaStore, onMostraTutti, cliccabile }: {
  params: Record<string, unknown>;
  aperto: boolean;
  onToggle: () => void;
  storeSelezionato: string[];
  /** Toglie tutti gli store selezionati. */
  onMostraTutti: () => void;
  onSelezionaStore: (id: string) => void;
  cliccabile: boolean;
}) {
  const [ord, setOrd] = useState<{ k: Chiave; dir: "asc" | "desc" }>({ k: "tot_scaduto", dir: "desc" });
  const { data } = useQuery({
    queryKey: [QK_SCADENZIARIO_PER_STORE, params],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_scadenziario_per_store" as never, params as never);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, unknown>[]).map<RigaStore>((r) => ({
        store_id: (r.store_id as string | null) ?? null,
        store_nome: String(r.store_nome ?? "Senza negozio"),
        n_clienti_scaduti: Number(r.n_clienti_scaduti ?? 0),
        tot_scaduto: Number(r.tot_scaduto ?? 0),
        tot_a_scadere: Number(r.tot_a_scadere ?? 0),
        n_bloccati: Number(r.n_bloccati ?? 0),
        n_in_legale: Number(r.n_in_legale ?? 0),
        tot_coperto_piani: Number(r.tot_coperto_piani ?? 0),
        tot_coperto_promesse: Number(r.tot_coperto_promesse ?? 0),
      }));
    },
  });
  const righe = data ?? [];
  const ordinate = useMemo(() => {
    const out = [...righe];
    out.sort((a, b) => {
      const va = a[ord.k], vb = b[ord.k];
      const c = typeof va === "string" ? va.localeCompare(String(vb), "it") : Number(va) - Number(vb);
      return ord.dir === "asc" ? c : -c;
    });
    return out;
  }, [righe, ord]);
  const max = Math.max(0, ...righe.map((r) => r.tot_scaduto));
  const totale = useMemo(() => righe.reduce((t, r) => ({
    n_clienti_scaduti: t.n_clienti_scaduti + r.n_clienti_scaduti,
    tot_scaduto: t.tot_scaduto + r.tot_scaduto,
    tot_a_scadere: t.tot_a_scadere + r.tot_a_scadere,
    n_bloccati: t.n_bloccati + r.n_bloccati,
    n_in_legale: t.n_in_legale + r.n_in_legale,
    tot_coperto_piani: t.tot_coperto_piani + r.tot_coperto_piani,
    tot_coperto_promesse: t.tot_coperto_promesse + r.tot_coperto_promesse,
  }), { n_clienti_scaduti: 0, tot_scaduto: 0, tot_a_scadere: 0, n_bloccati: 0, n_in_legale: 0, tot_coperto_piani: 0, tot_coperto_promesse: 0 }), [righe]);

  if (righe.length < 2) return null;

  const clic = (r: RigaStore) => (cliccabile && r.store_id ? () => onSelezionaStore(r.store_id!) : undefined);
  const val = (r: Pick<RigaStore, Chiave>, c: (typeof COLONNE)[number]) =>
    c.euro ? formatEuro(Number(r[c.k])) : String(r[c.k]);
  const nomeCella = (r: RigaStore) => {
    const sel = !!r.store_id && storeSelezionato.includes(r.store_id);
    return (
      <span className="flex items-center gap-1 min-w-0">
        <span className="break-words min-w-0">{r.store_nome}</span>
        {sel && <Check className="size-3.5 shrink-0 text-primary" aria-label="negozio selezionato" />}
        {!r.store_id && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="shrink-0 p-1 text-muted-foreground" aria-label={TESTO_SENZA} onClick={(e) => e.stopPropagation()}>
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{TESTO_SENZA}</TooltipContent>
          </Tooltip>
        )}
      </span>
    );
  };

  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aperto}
        className="flex w-full min-h-10 items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Store className="size-3.5 shrink-0" /> Per punto vendita ({righe.length})
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${aperto ? "rotate-180" : ""}`} />
      </button>
      {aperto && (
        <div className="border-t">
          {cliccabile && storeSelezionato.length > 0 && (() => {
            const nomi = righe.filter((r) => !!r.store_id && storeSelezionato.includes(r.store_id)).map((r) => r.store_nome);
            const nome = nomi.length > 0 ? nomi.join(", ") : null;
            return nome ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-xs text-muted-foreground border-b min-w-0">
                <span className="min-w-0">Filtro: <span className="font-medium text-foreground break-words">{nome}</span></span>
                <button type="button" onClick={onMostraTutti} className="underline underline-offset-2 hover:text-foreground shrink-0">
                  Mostra tutti
                </button>
              </div>
            ) : null;
          })()}
          {/* Telefono: schede */}
          <ul className="md:hidden divide-y">
            {ordinate.map((r) => {
              const onClick = clic(r);
              const sel = !!r.store_id && storeSelezionato.includes(r.store_id);
              return (
                <li key={r.store_id ?? "senza"} className={sel ? "border-l-2 border-l-primary" : "border-l-2 border-l-transparent"}>
                  <div
                    {...(onClick ? { role: "button", tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } } : {})}
                    className={`px-3 py-2 ${onClick ? "cursor-pointer active:bg-muted/50" : ""} ${sel ? "bg-primary/10" : ""}`}
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <div className="text-sm font-medium">{nomeCella(r)}</div>
                      <span className="text-sm font-semibold tabular-nums text-destructive">{formatEuro(r.tot_scaduto)}</span>
                    </div>
                    <Barretta v={r.tot_scaduto} max={max} />
                    <p className="mt-1 text-[11px] text-muted-foreground tabular-nums break-words">
                      {r.n_clienti_scaduti} clienti · a scadere {formatEuro(r.tot_a_scadere)}
                      {r.tot_coperto_piani > 0 && <> · piani {formatEuro(r.tot_coperto_piani)}</>}
                      {r.tot_coperto_promesse > 0 && <> · promesse {formatEuro(r.tot_coperto_promesse)}</>}
                    </p>
                  </div>
                </li>
              );
            })}
            <li className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-sm font-semibold">
              <span>Totale negozi</span><span className="tabular-nums">{formatEuro(totale.tot_scaduto)}</span>
            </li>
          </ul>
          {/* Desktop: tabella */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  {COLONNE.map((c) => (
                    <th key={c.k} className={`px-3 py-2 font-medium ${c.k === "store_nome" ? "text-left" : "text-right"}`}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => setOrd((o) => ({ k: c.k, dir: o.k === c.k && o.dir === "desc" ? "asc" : "desc" }))}
                      >
                        {c.label}
                        {ord.k === c.k && (ord.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordinate.map((r) => {
                  const onClick = clic(r);
                  const sel = !!r.store_id && storeSelezionato.includes(r.store_id);
                  return (
                    <tr
                      key={r.store_id ?? "senza"}
                      onClick={onClick}
                      className={`border-b last:border-b-0 ${onClick ? "cursor-pointer hover:bg-muted/50" : ""} ${sel ? "bg-primary/10" : ""}`}
                    >
                      {COLONNE.map((c) => (
                        <td
                          key={c.k}
                          className={`px-3 py-1.5 ${c.k === "store_nome" ? `text-left border-l-2 ${sel ? "border-l-primary" : "border-l-transparent"}` : "text-right"} ${c.k === "tot_scaduto" ? "font-semibold text-destructive min-w-[120px]" : ""}`}
                        >
                          {c.k === "store_nome" ? nomeCella(r) : val(r, c)}
                          {c.k === "tot_scaduto" && <Barretta v={r.tot_scaduto} max={max} />}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="px-3 py-2">Totale negozi</td>
                  {COLONNE.slice(1).map((c) => (
                    <td key={c.k} className="px-3 py-2 text-right">{val({ store_nome: "", ...totale }, c)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
