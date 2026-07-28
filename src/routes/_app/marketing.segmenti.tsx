import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Save, Users, Mail, MailX, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { isEmailValida } from "@/lib/email-validazione";
import { MACROCATEGORIE, CATEGORIE } from "@/lib/macrocategorie";

export const Route = createFileRoute("/_app/marketing/segmenti")({
  component: MarketingSegmentiPage,
});

const MARKETING_ROLES = new Set(["amministratore", "amministrazione", "direzione"]);

// Stato filtri — stessi nomi/valori usati nella pagina Clienti (fonte unica),
// serializzabile su segmenti_marketing.filtri (jsonb).
type SemaforoValue = "tutti" | "rosso" | "arancione" | "giallo" | "verde";
type Filtri = {
  storeFiltro: string;                 // "tutti" | store_id
  filtroAgente: string;                // "tutti" | "__none__" | codice_agente
  macrocategoria: string;              // "tutti" | codice
  categoria: string;                   // "tutti" | codice
  semaforo: SemaforoValue;
  filtroBlocco: "tutti" | "bloccati" | "non_bloccati";
  filtroTipoSoggetto: "tutti" | "fisica" | "giuridica";
  fatturato: "tutti" | "nessuno" | "0_10k" | "10k_50k" | "50k_100k" | "oltre_100k";
  citta: string;
  provincia: string;
};

const FILTRI_DEFAULT: Filtri = {
  storeFiltro: "tutti",
  filtroAgente: "tutti",
  macrocategoria: "tutti",
  categoria: "tutti",
  semaforo: "tutti",
  filtroBlocco: "tutti",
  filtroTipoSoggetto: "giuridica",
  fatturato: "tutti",
  citta: "",
  provincia: "",
};

function calcSemaforo(c: {
  fido_residuo?: number | null;
  fido_gestionale?: number | null;
  scaduto?: number | null;
}): "rosso" | "arancione" | "giallo" | "verde" {
  const residuo = c.fido_residuo == null ? null : Number(c.fido_residuo);
  const fidoGest = c.fido_gestionale == null ? null : Number(c.fido_gestionale);
  const scaduto = c.scaduto == null ? null : Number(c.scaduto);
  if (residuo != null && residuo < 0) return "rosso";
  if (residuo != null && fidoGest != null && fidoGest > 0 && residuo < fidoGest * 0.1) return "arancione";
  if (scaduto != null && scaduto > 0) return "giallo";
  return "verde";
}

function MarketingSegmentiPage() {
  const { roles, loading } = useAuth();
  const qc = useQueryClient();
  const canSee = useMemo(
    () => (roles as string[]).some((r) => MARKETING_ROLES.has(r)),
    [roles],
  );

  const [filtri, setFiltri] = useState<Filtri>(FILTRI_DEFAULT);
  const [saveOpen, setSaveOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");

  // === Lookup ===
  const { data: stores } = useQuery({
    queryKey: ["stores", "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stores").select("id, nome, codice").eq("attivo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: agenti } = useQuery({
    queryKey: ["agenti-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agenti").select("codice, descrizione").order("descrizione");
      return (data ?? []) as { codice: string; descrizione: string }[];
    },
    staleTime: 5 * 60_000,
  });

  // === Mappa semaforo per filtro client-side ===
  const { data: classifList } = useQuery({
    queryKey: ["clienti-classificazione-marketing"],
    queryFn: async () => {
      const all: any[] = [];
      let offset = 0;
      const size = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("clienti")
          .select("id, fido_residuo, fido_gestionale, scaduto")
          .range(offset, offset + size - 1);
        if (error) throw error;
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < size) break;
        offset += size;
      }
      return all;
    },
    staleTime: 60_000,
    enabled: canSee,
  });

  const semaforoIds = useMemo<string[] | null>(() => {
    if (filtri.semaforo === "tutti" || !classifList) return null;
    return classifList
      .filter((c: any) => calcSemaforo(c) === filtri.semaforo)
      .map((c: any) => c.id);
  }, [classifList, filtri.semaforo]);

  // === Fatturato (fasce) ===
  const annoCorrente = useMemo(() => new Date().getFullYear(), []);
  const { data: fatturatoIds } = useQuery({
    queryKey: ["fatturato-ids-marketing", filtri.fatturato, annoCorrente],
    enabled: canSee && filtri.fatturato !== "tutti",
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fatturato_clienti")
        .select("cliente_id, fatturato")
        .eq("anno", annoCorrente);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ cliente_id: string | null; fatturato: number | null }>;
      const map = new Map<string, number>();
      for (const r of rows) if (r.cliente_id) map.set(r.cliente_id, Number(r.fatturato) || 0);
      if (filtri.fatturato === "nessuno") {
        // TUTTI gli id NON presenti nella mappa
        const all: string[] = [];
        let off = 0;
        const size = 1000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: cli, error: e2 } = await supabase
            .from("clienti").select("id").range(off, off + size - 1);
          if (e2) throw e2;
          const batch = (cli ?? []) as Array<{ id: string }>;
          for (const c of batch) if (!map.has(c.id)) all.push(c.id);
          if (batch.length < size) break;
          off += size;
        }
        return all;
      }
      const inRange = (v: number) => {
        if (filtri.fatturato === "0_10k") return v > 0 && v <= 10000;
        if (filtri.fatturato === "10k_50k") return v > 10000 && v <= 50000;
        if (filtri.fatturato === "50k_100k") return v > 50000 && v <= 100000;
        if (filtri.fatturato === "oltre_100k") return v > 100000;
        return false;
      };
      const ids: string[] = [];
      for (const [id, v] of map) if (inRange(v)) ids.push(id);
      return ids;
    },
  });

  // Intersezione id-filter set (semaforo ∩ fatturato)
  const includeIds = useMemo<string[] | null>(() => {
    const sources: string[][] = [];
    if (semaforoIds) sources.push(semaforoIds);
    if (fatturatoIds) sources.push(fatturatoIds);
    if (sources.length === 0) return null;
    const sets = sources.map((s) => new Set(s));
    return sources[0].filter((id) => sets.every((s) => s.has(id)));
  }, [semaforoIds, fatturatoIds]);

  // === Query builder — allineato a src/routes/_app/clienti.tsx (fonte unica) ===
  function buildQuery(select: string, count: "exact" | undefined) {
    let q = supabase.from("clienti").select(select, count ? { count } : undefined);
    // Solo clienti anagraficamente attivi (default coerente con clienti.tsx)
    q = q.eq("attivo", true);
    if (filtri.storeFiltro !== "tutti") q = q.eq("store_id", filtri.storeFiltro);
    if (filtri.filtroAgente === "__none__") q = q.is("codice_agente", null);
    else if (filtri.filtroAgente !== "tutti") q = q.eq("codice_agente", filtri.filtroAgente);
    if (filtri.macrocategoria !== "tutti") q = q.eq("codice_macrocategoria", filtri.macrocategoria);
    if (filtri.categoria !== "tutti") q = q.eq("codice_categoria", filtri.categoria);
    if (filtri.filtroBlocco === "bloccati") q = q.eq("bloccato", true);
    else if (filtri.filtroBlocco === "non_bloccati") q = q.eq("bloccato", false);
    if (filtri.filtroTipoSoggetto === "fisica") q = q.eq("tipo_soggetto", "persona_fisica");
    else if (filtri.filtroTipoSoggetto === "giuridica") q = q.eq("tipo_soggetto", "azienda");
    if (filtri.citta.trim()) q = q.ilike("citta", `%${filtri.citta.trim()}%`);
    if (filtri.provincia.trim()) q = q.ilike("provincia", `%${filtri.provincia.trim()}%`);
    if (includeIds) {
      if (includeIds.length === 0) return { empty: true as const };
      q = q.in("id", includeIds);
    }
    q = q.order("ragione_sociale", { ascending: true, nullsFirst: false });
    return { q };
  }

  const classifReady = filtri.semaforo === "tutti" || !!classifList;
  const fatturatoReady = filtri.fatturato === "tutti" || !!fatturatoIds;

  // === Conteggio segmento + lista (limitata a 100 per l'anteprima) ===
  const PREVIEW_LIMIT = 100;
  const { data: segmento, isLoading } = useQuery({
    queryKey: ["marketing-segmento", filtri, includeIds?.length ?? null],
    enabled: canSee && classifReady && fatturatoReady,
    queryFn: async () => {
      const built = buildQuery("id, ragione_sociale, citta, provincia, categoria, agente, codice_agente", "exact");
      if ("empty" in built) return { rows: [] as any[], count: 0 };
      const { data, error, count } = await built.q.range(0, PREVIEW_LIMIT - 1);
      if (error) throw error;
      return { rows: (data ?? []) as any[], count: count ?? 0 };
    },
  });

  const rows = segmento?.rows ?? [];
  const totale = segmento?.count ?? 0;

  // === Indicatore email valida su contatti (per la finestra pagina) ===
  const { data: emailValidaMap } = useQuery({
    queryKey: ["marketing-email-map", rows.map((r) => r.id).sort().join(",")],
    enabled: rows.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const ids = rows.map((r) => r.id);
      const { data, error } = await supabase
        .from("contatti")
        .select("cliente_id, email")
        .in("cliente_id", ids);
      if (error) throw error;
      const map = new Map<string, boolean>();
      for (const c of (data ?? []) as Array<{ cliente_id: string; email: string | null }>) {
        if (map.get(c.cliente_id)) continue;
        if (isEmailValida(c.email)) map.set(c.cliente_id, true);
      }
      return map;
    },
  });

  // === Segmenti salvati ===
  const { data: segmentiSalvati } = useQuery({
    queryKey: ["segmenti-marketing"],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("segmenti_marketing")
        .select("id, nome, descrizione, filtri, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; nome: string; descrizione: string | null;
        filtri: Filtri; created_at: string;
      }>;
    },
  });

  const salvaSegmento = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Il nome del segmento è obbligatorio");
      const { error } = await supabase.from("segmenti_marketing").insert({
        nome: nome.trim(),
        descrizione: descrizione.trim() || null,
        filtri: filtri as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Segmento salvato");
      setSaveOpen(false);
      setNome("");
      setDescrizione("");
      qc.invalidateQueries({ queryKey: ["segmenti-marketing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore nel salvataggio"),
  });

  const eliminaSegmento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("segmenti_marketing").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Segmento eliminato");
      qc.invalidateQueries({ queryKey: ["segmenti-marketing"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Errore nell'eliminazione"),
  });

  function caricaSegmento(f: Filtri) {
    // Merge con i default per essere robusti a salvataggi vecchi/parziali
    setFiltri({ ...FILTRI_DEFAULT, ...f });
    toast.info("Filtri del segmento caricati");
  }

  useEffect(() => {
    // no-op — reset esplicito solo da bottone
  }, []);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Caricamento...</div>;
  }
  if (!canSee) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="size-6 text-[#c94f8f]" />
            Segmenti Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filtra l'anagrafica clienti in gruppi target. I segmenti salvano i
            criteri, non l'elenco: restano sempre aggiornati.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setFiltri(FILTRI_DEFAULT)}>
            <RefreshCw className="size-4 mr-2" /> Azzera filtri
          </Button>
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <DialogTrigger asChild>
              <Button>
                <Save className="size-4 mr-2" /> Salva segmento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Salva segmento</DialogTitle>
                <DialogDescription>
                  Verranno salvati i criteri correnti; il segmento resta aggiornato al variare dell'anagrafica.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Imprese Lombardia con scaduto" />
                </div>
                <div>
                  <Label>Descrizione</Label>
                  <Textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveOpen(false)}>Annulla</Button>
                <Button onClick={() => salvaSegmento.mutate()} disabled={salvaSegmento.isPending || !nome.trim()}>
                  Salva
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filtri */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Punto vendita</Label>
            <Select value={filtri.storeFiltro} onValueChange={(v) => setFiltri((p) => ({ ...p, storeFiltro: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli store</SelectItem>
                {(stores ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Agente</Label>
            <Select value={filtri.filtroAgente} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroAgente: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti gli agenti</SelectItem>
                <SelectItem value="__none__">Senza agente</SelectItem>
                {(agenti ?? []).map((a) => (
                  <SelectItem key={a.codice} value={a.codice}>{a.descrizione}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Macrocategoria</Label>
            <Select value={filtri.macrocategoria} onValueChange={(v) => setFiltri((p) => ({ ...p, macrocategoria: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutte</SelectItem>
                {MACROCATEGORIE.map((m) => (
                  <SelectItem key={m.codice} value={m.codice}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={filtri.categoria} onValueChange={(v) => setFiltri((p) => ({ ...p, categoria: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutte</SelectItem>
                {CATEGORIE.map((c) => (
                  <SelectItem key={c.codice} value={c.codice}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Semaforo rischio</Label>
            <Select value={filtri.semaforo} onValueChange={(v) => setFiltri((p) => ({ ...p, semaforo: v as SemaforoValue }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="verde">Verde — regolari</SelectItem>
                <SelectItem value="giallo">Giallo — scaduto</SelectItem>
                <SelectItem value="arancione">Arancione — fido quasi esaurito</SelectItem>
                <SelectItem value="rosso">Rosso — critici</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Stato blocco</Label>
            <Select value={filtri.filtroBlocco} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroBlocco: v as Filtri["filtroBlocco"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="bloccati">Bloccati</SelectItem>
                <SelectItem value="non_bloccati">Non bloccati</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo soggetto</Label>
            <Select value={filtri.filtroTipoSoggetto} onValueChange={(v) => setFiltri((p) => ({ ...p, filtroTipoSoggetto: v as Filtri["filtroTipoSoggetto"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="giuridica">Solo imprese</SelectItem>
                <SelectItem value="fisica">Solo privati</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fatturato {annoCorrente}</Label>
            <Select value={filtri.fatturato} onValueChange={(v) => setFiltri((p) => ({ ...p, fatturato: v as Filtri["fatturato"] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti</SelectItem>
                <SelectItem value="nessuno">Nessun fatturato</SelectItem>
                <SelectItem value="0_10k">0 — 10k €</SelectItem>
                <SelectItem value="10k_50k">10k — 50k €</SelectItem>
                <SelectItem value="50k_100k">50k — 100k €</SelectItem>
                <SelectItem value="oltre_100k">Oltre 100k €</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Città</Label>
            <Input value={filtri.citta} onChange={(e) => setFiltri((p) => ({ ...p, citta: e.target.value }))} placeholder="Es. Milano" />
          </div>
          <div>
            <Label className="text-xs">Provincia</Label>
            <Input value={filtri.provincia} onChange={(e) => setFiltri((p) => ({ ...p, provincia: e.target.value }))} placeholder="Es. MI" />
          </div>
        </div>
      </Card>

      {/* Conteggio */}
      <Card className="p-4 flex items-center gap-3 bg-[#c94f8f]/5 border-[#c94f8f]/30">
        <Users className="size-6 text-[#c94f8f]" />
        <div>
          <div className="text-2xl font-semibold">
            {isLoading ? "…" : totale.toLocaleString("it-IT")}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              client{totale === 1 ? "e" : "i"} corrispondono a questi filtri
            </span>
          </div>
          {rows.length < totale && (
            <div className="text-xs text-muted-foreground">
              Anteprima dei primi {rows.length} risultati
            </div>
          )}
        </div>
      </Card>

      {/* Lista */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ragione sociale</TableHead>
              <TableHead>Città / Prov.</TableHead>
              <TableHead>Agente</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-center">Email valida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground text-center py-6">Caricamento...</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground text-center py-6">Nessun cliente corrisponde ai filtri</TableCell></TableRow>
            )}
            {rows.map((c: any) => {
              const hasEmail = !!emailValidaMap?.get(c.id);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.ragione_sociale}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[c.citta, c.provincia].filter(Boolean).join(" — ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">{c.agente || (c.codice_agente ? c.codice_agente : "—")}</TableCell>
                  <TableCell className="text-sm">{c.categoria || "—"}</TableCell>
                  <TableCell className="text-center">
                    {hasEmail ? (
                      <Badge variant="outline" className="border-success text-success gap-1">
                        <Mail className="size-3" /> Sì
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground gap-1">
                        <MailX className="size-3" /> No
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Segmenti salvati */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Segmenti salvati</h2>
        {(segmentiSalvati ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nessun segmento salvato.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(segmentiSalvati ?? []).map((s) => (
              <Card key={s.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.nome}</div>
                    {s.descrizione && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{s.descrizione}</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Eliminare il segmento "${s.nome}"?`)) {
                        eliminaSegmento.mutate(s.id);
                      }
                    }}
                    aria-label="Elimina segmento"
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => caricaSegmento(s.filtri)}>
                  Carica filtri
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
