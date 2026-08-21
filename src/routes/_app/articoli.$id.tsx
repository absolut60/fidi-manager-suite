import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInputIt } from "@/components/ui/number-input-it";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  fetchArticolo,
  fetchFornitori,
  fetchListiniAcquisto,
  updateArticolo,
  calcCostoNetto,
  type Articolo,
  type ArticoloUpdate,
} from "@/lib/articoli-api";
import { StatoBadge } from "@/components/articoli/StatoBadge";
import { ListinoAcquistoSection } from "@/components/articoli/ListinoAcquistoSection";
import { ListinoVenditaSection } from "@/components/articoli/ListinoVenditaSection";
import { ArrowLeft, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_app/articoli/$id")({
  head: () => ({ meta: [{ title: "Scheda articolo — Sistema MADE" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab:
      s.tab === "acquisto" || s.tab === "vendita" || s.tab === "anagrafica"
        ? (s.tab as "acquisto" | "vendita" | "anagrafica")
        : undefined,
  }),
  component: ArticoloDetailPage,
});

function ArticoloDetailPage() {
  const { id } = Route.useParams();
  const { tab: tabParam } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: articolo, isLoading } = useQuery({
    queryKey: ["articolo", id],
    queryFn: () => fetchArticolo(id),
  });

  const { data: fornitori = [] } = useQuery({
    queryKey: ["fornitori"],
    queryFn: fetchFornitori,
  });

  const { data: listiniAcq = [] } = useQuery({
    queryKey: ["listini_acquisto", id],
    queryFn: () => fetchListiniAcquisto(id),
  });

  const [form, setForm] = useState<Partial<Articolo>>({});

  const activeAcq = listiniAcq[0];
  const costoNetto = activeAcq
    ? Number(activeAcq.costo_netto ?? calcCostoNetto(activeAcq).costo_netto) || 0
    : 0;

  useEffect(() => {
    if (articolo) setForm(articolo);
  }, [articolo]);


  const saveMut = useMutation({
    mutationFn: (patch: ArticoloUpdate) => updateArticolo(id, patch),
    onSuccess: () => {
      toast.success("Articolo aggiornato");
      qc.invalidateQueries({ queryKey: ["articolo", id] });
      qc.invalidateQueries({ queryKey: ["articoli"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  if (isLoading || !articolo) {
    return <div className="p-8 text-muted-foreground">Caricamento…</div>;
  }

  function set<K extends keyof Articolo>(k: K, v: Articolo[K] | null) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleSave() {
    saveMut.mutate({
      cod_gamma: form.cod_gamma ?? null,
      cod_fornitore: form.cod_fornitore ?? null,
      fornitore_id: form.fornitore_id ?? null,
      descrizione: form.descrizione ?? articolo!.descrizione,
      um: form.um ?? null,
      categoria: form.categoria ?? null,
      tipologia: form.tipologia ?? null,
      componente: form.componente ?? null,
      peso_unit: form.peso_unit ?? null,
      qta_cliente: form.qta_cliente ?? null,
      qta_fornitore: form.qta_fornitore ?? null,
      note: form.note ?? null,
      note_acquisto: form.note_acquisto ?? null,
      stato: form.stato ?? articolo!.stato,
    });
  }

  function promuovi() {
    saveMut.mutate({ stato: "attivo" });
    setForm((f) => ({ ...f, stato: "attivo" }));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: "/articoli" })}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Elenco
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-navy">
                  <span className="font-mono">{articolo.cod_gamma ?? "—"}</span>{" "}
                  <span className="text-muted-foreground">·</span>{" "}
                  <span>{articolo.descrizione}</span>
                </h1>
                <StatoBadge stato={(form.stato ?? articolo.stato) as Articolo["stato"]} />
              </div>
              <p className="text-xs text-muted-foreground">Scheda articolo</p>
            </div>
          </div>
          <div className="flex gap-2">
            {(form.stato ?? articolo.stato) === "potenziale" && (
              <Button variant="outline" size="sm" onClick={promuovi}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Promuovi ad attivo
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {saveMut.isPending ? "Salvataggio…" : "Salva anagrafica"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 md:p-4 lg:p-6">
        <Tabs value={tabParam ?? "anagrafica"} onValueChange={(v) => navigate({ to: "/articoli/$id", params: { id }, search: { tab: v as "anagrafica" | "acquisto" | "vendita" }, replace: true })}>
          <TabsList>
            <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
            <TabsTrigger value="acquisto">Listino acquisto</TabsTrigger>
            <TabsTrigger value="vendita">Listino vendita</TabsTrigger>
          </TabsList>

          <TabsContent value="anagrafica" className="mt-4">
            <div className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-6 md:grid-cols-3">
              <Field label="Cod. GAMMA">
                <Input
                  value={form.cod_gamma ?? ""}
                  onChange={(e) => set("cod_gamma", e.target.value || null)}
                  className="font-mono"
                />
              </Field>
              <Field label="Cod. Fornitore">
                <Input
                  value={form.cod_fornitore ?? ""}
                  onChange={(e) => set("cod_fornitore", e.target.value || null)}
                  className="font-mono"
                />
              </Field>
              <Field label="Fornitore">
                <Select
                  value={form.fornitore_id ?? "__none"}
                  onValueChange={(v) => set("fornitore_id", v === "__none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— nessuno —</SelectItem>
                    {fornitori.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.ragione_sociale}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Descrizione" className="md:col-span-3">
                <Textarea
                  value={form.descrizione ?? ""}
                  onChange={(e) => set("descrizione", e.target.value)}
                  rows={2}
                />
              </Field>

              <Field label="U.M.">
                <Input
                  value={form.um ?? ""}
                  onChange={(e) => set("um", e.target.value || null)}
                  className="font-mono"
                />
              </Field>
              <Field label="Categoria">
                <Input
                  value={form.categoria ?? ""}
                  onChange={(e) => set("categoria", e.target.value || null)}
                />
              </Field>
              <Field label="Tipologia">
                <Input
                  value={form.tipologia ?? ""}
                  onChange={(e) => set("tipologia", e.target.value || null)}
                />
              </Field>

              <Field label="Componente">
                <Input
                  value={form.componente ?? ""}
                  onChange={(e) => set("componente", e.target.value || null)}
                />
              </Field>
              <Field label="Peso unitario">
                <NumberInputIt
                  value={form.peso_unit ?? null}
                  onChange={(v) => set("peso_unit", v)}
                  className="font-mono"
                />
              </Field>
              <Field label="Stato">
                <Select
                  value={(form.stato ?? articolo.stato) as string}
                  onValueChange={(v) => set("stato", v as Articolo["stato"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attivo">attivo</SelectItem>
                    <SelectItem value="potenziale">potenziale</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Q.tà cliente">
                <NumberInputIt
                  value={form.qta_cliente ?? null}
                  onChange={(v) => set("qta_cliente", v)}
                  className="font-mono"
                />
              </Field>
              <Field label="Q.tà fornitore">
                <NumberInputIt
                  value={form.qta_fornitore ?? null}
                  onChange={(v) => set("qta_fornitore", v)}
                  className="font-mono"
                />
              </Field>
              <div />

              <div className="md:col-span-3 space-y-4 border-t pt-4">
                <Field label="NOTE ACQUISTO">
                  <Textarea
                    value={form.note_acquisto ?? ""}
                    onChange={(e) => set("note_acquisto", e.target.value || null)}
                    rows={3}
                    placeholder="Note di acquisto (condizioni fornitore, sconti, minimi d'ordine...)"
                  />
                </Field>

                <Field label="NOTE">
                  <Textarea
                    value={form.note ?? ""}
                    onChange={(e) => set("note", e.target.value || null)}
                    rows={3}
                  />
                </Field>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="acquisto" className="mt-4">
            <ListinoAcquistoSection articoloId={id} />
          </TabsContent>


          <TabsContent value="vendita" className="mt-4">
            <ListinoVenditaSection articoloId={id} costoNetto={costoNetto} />
            <p className="mt-2 text-xs text-muted-foreground">
              Suggerimento: apri prima "Listino acquisto" per agganciare il costo netto e
              abilitare i calcoli automatici di prezzo e margine.
            </p>
            {!costoNetto && (
              <div className="mt-2 text-xs">
                <Link to="/articoli/$id" params={{ id }} className="text-navy underline">
                  Vai al listino acquisto →
                </Link>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
