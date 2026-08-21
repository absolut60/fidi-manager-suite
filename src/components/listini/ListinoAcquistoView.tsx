import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchFornitori, type ListinoAcquisto } from "@/lib/articoli-api";
import { calcCosto } from "@/lib/pricing";
import { EditableNumberCell } from "@/components/preventivatore/EditableNumberCell";
import { toast } from "sonner";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

interface ArticoloLite {
  id: string;
  cod_gamma: string | null;
  descrizione: string;
  fornitore_id: string | null;
}
interface ListinoRow extends ListinoAcquisto {}

const ANY = "__any";

export function ListinoAcquistoView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dSearch, setDSearch] = useState("");
  const [fornId, setFornId] = useState<string | null>(null);
  const [dataFrom, setDataFrom] = useState<string>("");
  const [mostraFiltri, setMostraFiltri] = useState(false);
  const nFiltriAttivi = [fornId, dataFrom].filter(Boolean).length;

  useEffect(() => {
    const t = setTimeout(() => setDSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: fornitori = [] } = useQuery({
    queryKey: ["fornitori"],
    queryFn: fetchFornitori,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["listini-acquisto-view", dSearch, fornId, dataFrom],
    queryFn: async () => {
      // 1. Articoli filtrati
      let aq = supabase
        .from("articoli")
        .select("id, cod_gamma, descrizione, fornitore_id")
        .order("cod_gamma", { ascending: true })
        .limit(500);
      if (dSearch.trim()) {
        const s = dSearch.trim().replace(/[%,]/g, " ");
        aq = aq.or(`cod_gamma.ilike.%${s}%,descrizione.ilike.%${s}%`);
      }
      if (fornId) aq = aq.eq("fornitore_id", fornId);
      const { data: arts, error: aErr } = await aq;
      if (aErr) {
        console.error("ListinoAcquistoView articoli query error:", aErr);
        throw aErr;
      }
      const articoli = (arts ?? []) as ArticoloLite[];
      if (!articoli.length) return { articoli: [], byArt: new Map<string, ListinoRow>() };

      // 2. Listini acquisto per quegli articoli (chunk da 100 per evitare limite URL)
      const ids = articoli.map((a) => a.id);
      const CHUNK = 100;
      const all: ListinoRow[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        let lq = supabase.from("listini_acquisto").select("*").in("articolo_id", chunk);
        if (dataFrom) lq = lq.gte("data_validita", dataFrom);
        const { data: lists, error: lErr } = await lq;
        if (lErr) {
          // Non bloccare la pagina: logga e continua con array vuoto per questo chunk
          console.error("ListinoAcquistoView listini chunk error:", lErr);
          continue;
        }
        if (Array.isArray(lists)) all.push(...(lists as ListinoRow[]));
      }

      // 3. Mantieni solo la riga più recente per articolo
      const byArt = new Map<string, ListinoRow>();
      for (const r of all) {
        const cur = byArt.get(r.articolo_id);
        if (!cur) {
          byArt.set(r.articolo_id, r);
        } else {
          const a = (r.data_validita ?? "") + r.created_at;
          const b = (cur.data_validita ?? "") + cur.created_at;
          if (a > b) byArt.set(r.articolo_id, r);
        }
      }
      return { articoli, byArt };
    },
  });

  const fornitoriById = useMemo(
    () => new Map(fornitori.map((f) => [f.id, f.ragione_sociale])),
    [fornitori],
  );

  async function patchOrInsert(
    articoloId: string,
    existing: ListinoRow | undefined,
    patch: Partial<ListinoRow>,
  ) {
    const merged: Partial<ListinoRow> = { ...(existing ?? {}), ...patch };
    // Se l'utente ha toccato trasporto € o %, l'altro va azzerato per ricalcolo coerente
    if ("trasporto_eur" in patch) merged.trasporto_perc = null;
    if ("trasporto_perc" in patch) merged.trasporto_eur = null;
    const calc = calcCosto(merged);
    const payload = {
      articolo_id: articoloId,
      listino_for: merged.listino_for ?? null,
      sc1: merged.sc1 ?? null,
      sc2: merged.sc2 ?? null,
      sc3: merged.sc3 ?? null,
      sc4: merged.sc4 ?? null,
      sc5: merged.sc5 ?? null,
      trasporto_eur: calc.trasporto_eur || null,
      trasporto_perc: calc.trasporto_perc || null,
      prezzo_scontato: calc.prezzo_scontato,
      costo_netto: calc.costo_netto,
      data_validita: merged.data_validita ?? null,
      condizioni: merged.condizioni ?? null,
    };
    try {
      if (existing) {
        const { error } = await supabase
          .from("listini_acquisto")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("listini_acquisto").insert(payload);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["listini-acquisto-view"] });
      qc.invalidateQueries({ queryKey: ["listini_acquisto", articoloId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
      refetch();
    }
  }

  const articoli = data?.articoli ?? [];
  const byArt = data?.byArt ?? new Map<string, ListinoRow>();

  return (
    <div className="flex h-full flex-col">
      {/* Filters */}
      <div className="border-b bg-card px-3 py-2 lg:px-6 lg:py-3">
        {/* Search + Filtri toggle (mobile) */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca cod. o descrizione…"
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
            mostraFiltri ? "grid grid-cols-2" : "hidden",
          )}
        >
          <div className="relative hidden lg:col-span-5 lg:block">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca cod. GAMMA o descrizione…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 font-mono text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Select value={fornId ?? ANY} onValueChange={(v) => setFornId(v === ANY ? null : v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Fornitore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti i fornitori</SelectItem>
                {fornitori.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.ragione_sociale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Input
              type="date"
              value={dataFrom}
              onChange={(e) => setDataFrom(e.target.value)}
              className="h-9 font-mono text-xs"
              placeholder="Data da"
            />
          </div>
          <div className="hidden lg:col-span-2 lg:flex lg:items-center text-xs text-muted-foreground">
            {isLoading ? "Caricamento…" : `${articoli.length} articoli`}
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
            <col style={{ width: "80px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "56px" }} />
            <col style={{ width: "88px" }} />
            <col style={{ width: "68px" }} />
            <col style={{ width: "68px" }} />
            <col style={{ width: "104px" }} />
            <col style={{ width: "88px" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-navy text-navy-foreground">
            <tr className="text-[11px] uppercase tracking-wide">
              <th className="px-2 py-2 text-left">Cod. GAMMA</th>
              <th className="px-3 py-2 text-left">Descrizione</th>
              <th className="px-2 py-2 text-left">Fornitore</th>
              <th className="px-1 py-2 text-right">List. for.</th>
              <th className="px-1 py-2 text-right">SC1</th>
              <th className="px-1 py-2 text-right">SC2</th>
              <th className="px-1 py-2 text-right">SC3</th>
              <th className="px-1 py-2 text-right">SC4</th>
              <th className="px-1 py-2 text-right">SC5</th>
              <th className="px-1 py-2 text-right">Prezzo sc.</th>
              <th className="px-1 py-2 text-right">Trasp.€</th>
              <th className="px-1 py-2 text-right">Trasp.%</th>
              <th className="px-1 py-2 text-right bg-navy/80">COSTO NETTO</th>
              <th className="px-1 py-2 text-left">Data</th>
            </tr>
          </thead>
          <tbody>
            {articoli.map((a) => {
              const l = byArt.get(a.id);
              const live = l ? calcCosto(l) : { prezzo_scontato: 0, trasporto_eur: 0, trasporto_perc: 0, costo_netto: 0 };
              return (
                <tr key={a.id} className="border-b hover:bg-muted/50">
                  <td
                    className="px-2 py-1 font-mono truncate cursor-pointer"
                    title={a.cod_gamma ?? ""}
                    onClick={() => navigate({ to: "/articoli/$id", params: { id: a.id }, search: { tab: "acquisto" } })}
                  >
                    {a.cod_gamma ?? "—"}
                  </td>
                  <td
                    className="px-3 py-1 truncate cursor-pointer"
                    title={a.descrizione}
                    onClick={() => navigate({ to: "/articoli/$id", params: { id: a.id }, search: { tab: "acquisto" } })}
                  >
                    {a.descrizione}
                  </td>
                  <td className="px-2 py-1 truncate" title={a.fornitore_id ? fornitoriById.get(a.fornitore_id) ?? "" : ""}>
                    {a.fornitore_id ? fornitoriById.get(a.fornitore_id) ?? "—" : "—"}
                  </td>
                  <td className="px-1 py-0.5">
                    <EditableNumberCell
                      value={l?.listino_for != null ? Number(l.listino_for) : null}
                      onCommit={(v) => patchOrInsert(a.id, l, { listino_for: v == null ? null : String(v) })}
                    />
                  </td>
                  {(["sc1", "sc2", "sc3", "sc4", "sc5"] as const).map((k) => (
                    <td key={k} className="px-1 py-0.5">
                      <EditableNumberCell
                        value={(l?.[k] as number | null | undefined) ?? null}
                        onCommit={(v) => patchOrInsert(a.id, l, { [k]: v } as Partial<ListinoRow>)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                    {live.prezzo_scontato ? live.prezzo_scontato.toFixed(4) : "—"}
                  </td>
                  <td className="px-1 py-0.5">
                    <EditableNumberCell
                      value={l?.trasporto_eur ?? null}
                      onCommit={(v) => patchOrInsert(a.id, l, { trasporto_eur: v })}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <EditableNumberCell
                      value={l?.trasporto_perc ?? null}
                      onCommit={(v) => patchOrInsert(a.id, l, { trasporto_perc: v })}
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-bold bg-muted/30">
                    {live.costo_netto ? `€ ${live.costo_netto.toFixed(4)}` : "—"}
                  </td>
                  <td className="px-1 py-1 font-mono text-[11px] truncate" title={l?.data_validita ?? ""}>{l?.data_validita ?? "—"}</td>
                </tr>
              );
            })}
            {error && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-red-600 font-mono text-xs">
                  Errore caricamento: {error instanceof Error ? error.message : String(error)}
                </td>
              </tr>
            )}
            {!isLoading && !error && !articoli.length && (
              <tr>
                <td colSpan={13} className="px-3 py-12 text-center text-muted-foreground">
                  Nessun articolo
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
