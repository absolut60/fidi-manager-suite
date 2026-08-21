import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { EditableNumberCell } from "@/components/preventivatore/EditableNumberCell";
import { toast } from "sonner";
import { Wand2, Info } from "lucide-react";
import { FASCE, type FasciaListino, type ListinoAcquisto } from "@/lib/articoli-api";
import { calcCosto, round2 } from "@/lib/pricing";

const LETTERE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

interface MatriceRow {
  categoria: string;
  descrizione_categoria: string | null;
  macro_gruppo: string | null;
  ricarico_a: number | null;
  ricarico_b: number | null;
  ricarico_c: number | null;
  ricarico_soci: number | null;
}


export function MatriceRicarichiView() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("amministratore");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<{
    aggiornati: number;
    fasce: number;
    saltati_categoria: number;
    saltati_costo: number;
  } | null>(null);

  const { data: matrice = [], isLoading } = useQuery({
    queryKey: ["matrice-ricarichi"],
    queryFn: async (): Promise<MatriceRow[]> => {
      const { data, error } = await supabase
        .from("matrice_ricarichi")
        .select("*")
        .order("categoria");
      if (error) throw error;
      return (data ?? []) as MatriceRow[];
    },
  });

  const byCat = new Map(matrice.map((r) => [r.categoria, r]));
  const rows: MatriceRow[] = LETTERE.map(
    (l) =>
      byCat.get(l) ?? {
        categoria: l,
        descrizione_categoria: null,
        macro_gruppo: null,
        ricarico_a: null,
        ricarico_b: null,
        ricarico_c: null,
        ricarico_soci: null,
      },
  );

  async function updateCell(categoria: string, patch: Partial<MatriceRow>) {
    if (!isAdmin) return;
    try {
      const existing = byCat.get(categoria);
      const payload = { categoria, ...existing, ...patch };
      const { error } = await supabase
        .from("matrice_ricarichi")
        .upsert(payload, { onConflict: "categoria" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["matrice-ricarichi"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    }
  }

  async function applicaListini() {
    setApplying(true);
    setReport(null);
    try {
      const cats = matrice.filter(
        (m) =>
          m.ricarico_a != null ||
          m.ricarico_b != null ||
          m.ricarico_c != null ||
          m.ricarico_soci != null,
      );
      const catSet = new Set(cats.map((c) => c.categoria));
      const catMap = new Map(cats.map((c) => [c.categoria, c]));

      const { data: arts, error: aErr } = await supabase
        .from("articoli")
        .select("id, categoria")
        .in("categoria", [...catSet]);
      if (aErr) throw aErr;
      const articoli = (arts ?? []).filter((a) => a.categoria && catSet.has(a.categoria));

      const ids = articoli.map((a) => a.id);
      const CHUNK = 200;
      const acqAll: ListinoAcquisto[] = [];
      const vendAll: { id: string; articolo_id: string; fascia: FasciaListino }[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const [acqRes, vendRes] = await Promise.all([
          supabase.from("listini_acquisto").select("*").in("articolo_id", chunk),
          supabase
            .from("listini_vendita")
            .select("id, articolo_id, fascia")
            .in("articolo_id", chunk),
        ]);
        if (acqRes.error) throw acqRes.error;
        if (vendRes.error) throw vendRes.error;
        acqAll.push(...((acqRes.data ?? []) as ListinoAcquisto[]));
        vendAll.push(
          ...((vendRes.data ?? []) as { id: string; articolo_id: string; fascia: FasciaListino }[]),
        );
      }

      const latest = new Map<string, ListinoAcquisto>();
      for (const r of acqAll) {
        const cur = latest.get(r.articolo_id);
        const ka = (r.data_validita ?? "") + r.created_at;
        const kb = cur ? (cur.data_validita ?? "") + cur.created_at : "";
        if (!cur || ka > kb) latest.set(r.articolo_id, r);
      }

      const costoByArt = new Map<string, number>();
      for (const [aid, r] of latest) {
        const cn = Number(r.costo_netto ?? calcCosto(r).costo_netto) || 0;
        if (cn > 0) costoByArt.set(aid, cn);
      }

      const vendKey = (aid: string, f: FasciaListino) => `${aid}|${f}`;
      const vendIdx = new Map<string, string>();
      for (const v of vendAll) vendIdx.set(vendKey(v.articolo_id, v.fascia), v.id);

      type VendPayload = {
        articolo_id: string;
        fascia: FasciaListino;
        ricarico: number;
        prezzo: number;
        margine: number;
      };
      const toUpdate: { id: string; payload: VendPayload }[] = [];
      const toInsert: VendPayload[] = [];
      let saltati_categoria = 0;
      let saltati_costo = 0;
      let aggiornati = 0;
      let fasceCount = 0;

      for (const a of articoli) {
        const m = a.categoria ? catMap.get(a.categoria) : undefined;
        if (!m) {
          saltati_categoria++;
          continue;
        }
        const costo = costoByArt.get(a.id);
        if (!costo) {
          saltati_costo++;
          continue;
        }
        aggiornati++;
        const ricMap: Record<FasciaListino, number | null> = {
          A: m.ricarico_a,
          B: m.ricarico_b,
          C: m.ricarico_c,
          SOCI: m.ricarico_soci,
        };
        for (const f of FASCE) {
          const ric = ricMap[f];
          if (ric == null) continue;
          const prezzo = round2(costo * (1 + Number(ric) / 100));
          const margine = prezzo > 0 ? round2(((prezzo - costo) / prezzo) * 100) : 0;
          const payload: VendPayload = {
            articolo_id: a.id,
            fascia: f,
            ricarico: round2(Number(ric)),
            prezzo,
            margine,
          };
          const existingId = vendIdx.get(vendKey(a.id, f));
          if (existingId) toUpdate.push({ id: existingId, payload });
          else toInsert.push(payload);
          fasceCount++;
        }
      }

      const BATCH = 100;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const slice = toInsert.slice(i, i + BATCH);
        const { error } = await supabase.from("listini_vendita").insert(slice);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase
          .from("listini_vendita")
          .update(u.payload)
          .eq("id", u.id);
        if (error) throw error;
      }

      setReport({ aggiornati, fasce: fasceCount, saltati_categoria, saltati_costo });
      toast.success(`Applicato: ${aggiornati} articoli, ${fasceCount} fasce ricalcolate`);
      qc.invalidateQueries({ queryKey: ["listini-vendita-view"] });
      qc.invalidateQueries({ queryKey: ["listini_vendita"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore applicazione");
    } finally {
      setApplying(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-3 py-3 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground max-w-2xl">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-navy" />
            <p>
              Definisci il ricarico % per ogni categoria e fascia. Le modifiche alla matrice
              diventano effettive sui listini di vendita SOLO premendo{" "}
              <b>Applica ai listini di vendita</b>. Calcolo: <code>prezzo = costo netto × (1 + ricarico/100)</code>{" "}
              dove il costo è il <b>costo netto</b> del listino acquisto più recente.
              {!isAdmin && (
                <span className="mt-1 block text-orange-600">
                  Solo gli amministratori possono modificare la matrice e applicare i ricarichi.
                </span>
              )}
            </p>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!isAdmin || applying || isLoading}
            className="shrink-0"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            Applica ai listini di vendita
          </Button>
        </div>
        {report && (
          <div className="mt-3 rounded border bg-muted/40 p-3 text-xs">
            <b>Riepilogo applicazione:</b> {report.aggiornati} articoli aggiornati ·{" "}
            {report.fasce} fasce ricalcolate · {report.saltati_categoria} saltati (categoria non in
            matrice) · {report.saltati_costo} saltati (costo mancante)
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-navy text-navy-foreground">
            <tr className="text-[11px] uppercase tracking-wide">
              <th className="px-3 py-2 text-left w-14">Cat.</th>
              <th className="px-3 py-2 text-left">Descrizione</th>
              <th className="px-3 py-2 text-left">Macro gruppo</th>
              <th className="px-2 py-2 text-right">Ricarico A %</th>
              <th className="px-2 py-2 text-right">Ricarico B %</th>
              <th className="px-2 py-2 text-right">Ricarico C %</th>
              <th className="px-2 py-2 text-right">Ricarico SOCI %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.categoria} className="border-b hover:bg-muted/30">
                <td className="px-3 py-1 font-mono font-bold text-navy">{r.categoria}</td>
                <td className="px-2 py-0.5">
                  <Input
                    defaultValue={r.descrizione_categoria ?? ""}
                    disabled={!isAdmin}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== (r.descrizione_categoria ?? null))
                        updateCell(r.categoria, { descrizione_categoria: v });
                    }}
                    className="h-7 text-xs"
                    placeholder="—"
                    key={`d-${r.categoria}-${r.descrizione_categoria ?? ""}`}
                  />
                </td>
                <td className="px-2 py-0.5">
                  <Input
                    defaultValue={r.macro_gruppo ?? ""}
                    disabled={!isAdmin}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== (r.macro_gruppo ?? null))
                        updateCell(r.categoria, { macro_gruppo: v });
                    }}
                    className="h-7 text-xs"
                    placeholder="—"
                    key={`m-${r.categoria}-${r.macro_gruppo ?? ""}`}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <EditableNumberCell
                    value={r.ricarico_a}
                    disabled={!isAdmin}
                    onCommit={(v) => updateCell(r.categoria, { ricarico_a: v })}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <EditableNumberCell
                    value={r.ricarico_b}
                    disabled={!isAdmin}
                    onCommit={(v) => updateCell(r.categoria, { ricarico_b: v })}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <EditableNumberCell
                    value={r.ricarico_c}
                    disabled={!isAdmin}
                    onCommit={(v) => updateCell(r.categoria, { ricarico_c: v })}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <EditableNumberCell
                    value={r.ricarico_soci}
                    disabled={!isAdmin}
                    onCommit={(v) => updateCell(r.categoria, { ricarico_soci: v })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Applicare la matrice ai listini di vendita?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno ricalcolati i prezzi di vendita di tutti gli articoli con categoria
              presente in matrice. I listini di vendita esistenti per le fasce A, B, C, SOCI
              saranno <b>sovrascritti</b> dai nuovi prezzi calcolati (costo × (1 + ricarico%/100)).
              Articoli senza costo o categoria non gestita vengono saltati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={applicaListini} disabled={applying}>
              {applying ? "Applico…" : "Applica"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
