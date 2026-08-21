import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  FASCE,
  type FasciaListino,
  type ListinoAcquisto,
  type ListinoVendita,
} from "@/lib/articoli-api";
import {
  calcCosto,
  prezzoFromRicarico,
  ricaricoFromPrezzo,
  margineFromPrezzo,
  round2,
} from "@/lib/pricing";
import { EditableNumberCell } from "@/components/preventivatore/EditableNumberCell";
import { toast } from "sonner";
import { parseNumeroIt } from "@/lib/numero-it";
import { Search, Wand2, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

interface ArticoloLite {
  id: string;
  cod_gamma: string | null;
  descrizione: string;
  categoria: string | null;
  tipologia: string | null;
  fornitore_id: string | null;
}

const ANY = "__any";

export function ListinoVenditaView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [fascia, setFascia] = useState<FasciaListino>("A");
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const nFiltriAttivi = [categoria].filter(Boolean).length;


  useEffect(() => {
    const t = setTimeout(() => setDSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["listini-vendita-view", fascia, dSearch, categoria],
    queryFn: async () => {
      let aq = supabase
        .from("articoli")
        .select("id, cod_gamma, descrizione, categoria, tipologia, fornitore_id")
        .order("cod_gamma", { ascending: true })
        .limit(500);
      if (dSearch.trim()) {
        const s = dSearch.trim().replace(/[%,]/g, " ");
        aq = aq.or(`cod_gamma.ilike.%${s}%,descrizione.ilike.%${s}%`);
      }
      if (categoria) aq = aq.eq("categoria", categoria);
      const { data: arts, error: aErr } = await aq;
      if (aErr) {
        console.error("ListinoVenditaView articoli error:", aErr);
        throw aErr;
      }
      const articoli = (arts ?? []) as ArticoloLite[];
      if (!articoli.length)
        return {
          articoli: [],
          costoByArt: new Map<string, number>(),
          vendByArt: new Map<string, ListinoVendita>(),
        };

      const ids = articoli.map((a) => a.id);
      const CHUNK = 100;
      const acqAll: ListinoAcquisto[] = [];
      const vendAll: ListinoVendita[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const [acqRes, vendRes] = await Promise.all([
          supabase.from("listini_acquisto").select("*").in("articolo_id", chunk),
          supabase
            .from("listini_vendita")
            .select("*")
            .eq("fascia", fascia)
            .in("articolo_id", chunk),
        ]);
        if (acqRes.error) {
          console.error("ListinoVenditaView listini_acquisto chunk error:", acqRes.error);
        } else if (Array.isArray(acqRes.data)) {
          acqAll.push(...(acqRes.data as ListinoAcquisto[]));
        }
        if (vendRes.error) {
          console.error("ListinoVenditaView listini_vendita chunk error:", vendRes.error);
        } else if (Array.isArray(vendRes.data)) {
          vendAll.push(...(vendRes.data as ListinoVendita[]));
        }
      }

      const costoByArt = new Map<string, number>();
      const latest = new Map<string, ListinoAcquisto>();
      for (const r of acqAll) {
        const cur = latest.get(r.articolo_id);
        const ka = (r.data_validita ?? "") + r.created_at;
        const kb = cur ? (cur.data_validita ?? "") + cur.created_at : "";
        if (!cur || ka > kb) latest.set(r.articolo_id, r);
      }
      for (const [id, r] of latest) {
        const cn = Number(r.costo_netto ?? calcCosto(r).costo_netto) || 0;
        costoByArt.set(id, cn);
      }

      const vendByArt = new Map<string, ListinoVendita>();
      for (const v of vendAll) vendByArt.set(v.articolo_id, v);

      return { articoli, costoByArt, vendByArt };
    },
  });

  const { data: facets } = useQuery({
    queryKey: ["listini-vendita-categorie"],
    queryFn: async () => {
      const { data } = await supabase.from("articoli").select("categoria").limit(5000);
      const s = new Set<string>();
      for (const r of data ?? []) if (r.categoria) s.add(r.categoria);
      return [...s].sort();
    },
  });
  const categorie = Array.isArray(facets) ? facets : [];

  const articoli = data?.articoli ?? [];
  const costoByArt = data?.costoByArt ?? new Map<string, number>();
  const vendByArt = data?.vendByArt ?? new Map<string, ListinoVendita>();

  async function upsertVendita(articoloId: string, patch: Partial<ListinoVendita>) {
    const existing = vendByArt.get(articoloId);
    const cn = costoByArt.get(articoloId) ?? 0;
    const merged = { ...(existing ?? {}), ...patch } as Partial<ListinoVendita>;

    // Riallinea i tre valori in base a chi ha "guidato" l'edit
    if (patch.ricarico !== undefined && cn) {
      const p = prezzoFromRicarico(cn, Number(patch.ricarico ?? 0));
      merged.prezzo = p;
      merged.margine = margineFromPrezzo(cn, p);
    } else if (patch.prezzo !== undefined && cn) {
      const p = Number(patch.prezzo ?? 0);
      merged.ricarico = ricaricoFromPrezzo(cn, p);
      merged.margine = margineFromPrezzo(cn, p);
    }

    const payload = {
      articolo_id: articoloId,
      fascia,
      ricarico: merged.ricarico ?? null,
      prezzo: merged.prezzo ?? null,
      margine: merged.margine ?? null,
    };
    try {
      if (existing) {
        const { error } = await supabase
          .from("listini_vendita")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("listini_vendita").insert(payload);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["listini-vendita-view"] });
      qc.invalidateQueries({ queryKey: ["listini_vendita", articoloId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
      refetch();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filters */}
      <div className="border-b bg-card px-3 py-2 lg:px-6 lg:py-3">
        {/* Mobile: fascia + search + Filtri */}
        <div className="flex items-center gap-2 lg:hidden">
          <Select value={fascia} onValueChange={(v) => setFascia(v as FasciaListino)}>
            <SelectTrigger className="h-9 w-24 text-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FASCE.map((f) => (
                <SelectItem key={f} value={f}>Fascia {f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 font-mono text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setMostraFiltri((v) => !v)}
          >
            <SlidersHorizontal className="mr-1 h-4 w-4" /> Filtri
            {nFiltriAttivi > 0 && (
              <Badge className="ml-1 h-4 px-1.5 text-[10px]">{nFiltriAttivi}</Badge>
            )}
          </Button>
        </div>

        <div
          className={cn(
            "mt-2 gap-2 lg:mt-0 lg:grid lg:grid-cols-12",
            mostraFiltri ? "grid grid-cols-1" : "hidden",
          )}
        >
          <div className="hidden lg:col-span-2 lg:block">
            <Select value={fascia} onValueChange={(v) => setFascia(v as FasciaListino)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FASCE.map((f) => (
                  <SelectItem key={f} value={f}>
                    Fascia {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative hidden lg:col-span-4 lg:block">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca cod. GAMMA o descrizione…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 font-mono text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Select
              value={categoria ?? ANY}
              onValueChange={(v) => setCategoria(v === ANY ? null : v)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutte le categorie</SelectItem>
                {categorie.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-end gap-2 lg:col-span-3">
            <span className="hidden text-xs text-muted-foreground lg:inline">
              {isLoading ? "Caricamento…" : `${articoli.length} articoli`}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkOpen(true)}
              disabled={!articoli.length}
              className="w-full lg:w-auto"
            >
              <Wand2 className="mr-1 h-4 w-4" /> Modifica massiva
            </Button>
          </div>
        </div>
      </div>


      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col style={{ width: "104px" }} />
            <col />
            <col style={{ width: "140px" }} />
            <col style={{ width: "96px" }} />
            <col style={{ width: "88px" }} />
            <col style={{ width: "96px" }} />
            <col style={{ width: "80px" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-navy text-navy-foreground">
            <tr className="text-[11px] uppercase tracking-wide">
              <th className="px-2 py-2 text-left">Cod. GAMMA</th>
              <th className="px-3 py-2 text-left">Descrizione</th>
              <th className="px-2 py-2 text-left">Categoria</th>
              <th className="px-2 py-2 text-right">Costo netto</th>
              <th className="px-1 py-2 text-right">Ricarico %</th>
              <th className="px-1 py-2 text-right bg-navy/80">Prezzo €</th>
              <th className="px-2 py-2 text-right">Margine %</th>
            </tr>
          </thead>
          <tbody>
            {articoli.map((a) => {
              const cn = costoByArt.get(a.id) ?? 0;
              const v = vendByArt.get(a.id);
              return (
                <tr key={a.id} className="border-b hover:bg-muted/50">
                  <td
                    className="px-2 py-1 font-mono truncate cursor-pointer"
                    title={a.cod_gamma ?? ""}
                    onClick={() => navigate({ to: "/articoli/$id", params: { id: a.id }, search: { tab: "vendita" } })}
                  >
                    {a.cod_gamma ?? "—"}
                  </td>
                  <td
                    className="px-3 py-1 truncate cursor-pointer"
                    title={a.descrizione}
                    onClick={() => navigate({ to: "/articoli/$id", params: { id: a.id }, search: { tab: "vendita" } })}
                  >
                    {a.descrizione}
                  </td>
                  <td className="px-2 py-1 truncate" title={a.categoria ?? ""}>{a.categoria ?? "—"}</td>

                  <td className="px-2 py-1 text-right font-mono">
                    {cn ? `€ ${cn.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-1 py-0.5">
                    <EditableNumberCell
                      value={v?.ricarico ?? null}
                      disabled={!cn}
                      onCommit={(val) => upsertVendita(a.id, { ricarico: val })}
                    />
                  </td>
                  <td className="px-1 py-0.5 bg-muted/30">
                    <EditableNumberCell
                      value={v?.prezzo ?? null}
                      disabled={!cn}
                      onCommit={(val) => upsertVendita(a.id, { prezzo: val })}
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                    {v?.margine != null ? `${Number(v.margine).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            {error && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-red-600 font-mono text-xs">
                  Errore caricamento: {error instanceof Error ? error.message : String(error)}
                </td>
              </tr>
            )}
            {!isLoading && !error && !articoli.length && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  Nessun articolo
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BulkVenditaDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        fascia={fascia}
        scope={{ categoria }}
        scopeCount={articoli.length}
        onApply={async (delta) => {
          try {
            let ok = 0;
            for (const a of articoli) {
              const cn = costoByArt.get(a.id) ?? 0;
              if (!cn) continue;
              const existing = vendByArt.get(a.id);
              const currentRic = Number(existing?.ricarico ?? 0);
              const newRic = round2(currentRic + delta);
              const newPrezzo = prezzoFromRicarico(cn, newRic);
              const payload = {
                articolo_id: a.id,
                fascia,
                ricarico: newRic,
                prezzo: newPrezzo,
                margine: margineFromPrezzo(cn, newPrezzo),
              };
              if (existing) {
                await supabase.from("listini_vendita").update(payload).eq("id", existing.id);
              } else {
                await supabase.from("listini_vendita").insert(payload);
              }
              ok++;
            }
            toast.success(`Ricarico aggiornato su ${ok} articoli`);
            qc.invalidateQueries({ queryKey: ["listini-vendita-view"] });
            setBulkOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Errore");
          }
        }}
      />
    </div>
  );
}

function BulkVenditaDialog({
  open,
  onOpenChange,
  fascia,
  scope,
  scopeCount,
  onApply,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  fascia: FasciaListino;
  scope: { categoria: string | null };
  scopeCount: number;
  onApply: (delta: number) => void | Promise<void>;
}) {
  const [delta, setDelta] = useState("2");
  const [busy, setBusy] = useState(false);

  const scopeLabel = useMemo(() => {
    const parts = [`fascia ${fascia}`];
    if (scope.categoria) parts.push(`categoria "${scope.categoria}"`);
    else parts.push("tutte le categorie");
    return parts.join(" · ");
  }, [fascia, scope.categoria]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica massiva ricarico</DialogTitle>
          <DialogDescription>
            Applica un delta percentuale al ricarico degli articoli mostrati ({scopeCount}). Esempio:
            “+2” aggiunge 2 punti al ricarico corrente; “-1.5” lo riduce di 1.5.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded bg-muted/50 p-3 text-xs">
            <span className="text-muted-foreground">Ambito:</span>{" "}
            <span className="font-semibold">{scopeLabel}</span>
          </div>
          <div>
            <Label>Delta ricarico (%)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={delta}
              onChange={(e) => setDelta(e.target.value.replace(/[^0-9.,\-]/g, ""))}
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
          <Button
            disabled={busy || !delta}
            onClick={async () => {
              setBusy(true);
              try {
                await onApply(parseNumeroIt(delta) ?? 0);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Applico…" : "Applica"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
