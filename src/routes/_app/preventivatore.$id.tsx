import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Check, Copy, FileDown, GripVertical, Pencil, Plus, RefreshCw, ShoppingCart, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addBloccoVuoto,
  applicaScontoPiedeARighe,
  aggiornaListiniPreventivo,
  buildPrezziSpecialiMap,
  calcolaBlocco, calcolaTotaliPreventivo, deleteBlocco, deletePreventivo, duplicaPreventivo, fetchAgenti, fetchCliente, fetchOrdiniCollegati, fetchPreventivo, fetchPreventivoOrigine,
  fractionalOrder,
  reorderBlocchi, ricalcolaBloccoSuNuovaQuantita, riapplicaPrezziSpecialiCantiere, STATI, STATI_LABEL, TIPI_DOC, TIPI_DOC_LABEL,
  updateBlocco, updatePreventivo,
  type BloccoConRighe, type PrezziSpecialiMap, type StatoPreventivo, type TipoDoc,
} from "@/lib/preventivi-api";
import { computeEvasione } from "@/lib/evasione";
import { EvasioneBadge } from "@/components/preventivatore/EvasioneBadge";


import { FASCE, type FasciaListino } from "@/lib/articoli-api";
import { round2 } from "@/lib/pricing";
import { parseNumeroIt } from "@/lib/numero-it";
import { cn } from "@/lib/utils";
import { AggiungiBloccoDialog } from "@/components/preventivatore/AggiungiBloccoDialog";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import { GeneraDocumentoDialog } from "@/components/preventivatore/GeneraDocumentoDialog";
import { ClientePicker } from "@/components/preventivatore/ClientePicker";
import { CantierePicker } from "@/components/preventivatore/CantierePicker";
import { TrasformaInOrdineDialog } from "@/components/preventivatore/TrasformaInOrdineDialog";

export const Route = createFileRoute("/_app/preventivatore/$id")({
  head: () => ({ meta: [{ title: "Editor Preventivo — Sistema MADE" }] }),
  component: PreventivoEditorPage,
});

function PreventivoEditorPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [addBloccoOpen, setAddBloccoOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editModeInitialized, setEditModeInitialized] = useState(false);
  const [trasformaOpen, setTrasformaOpen] = useState(false);
  const [modoCantiereEdit, setModoCantiereEdit] = useState<"cantiere" | "provvisorio">("cantiere");

  const { data: prev, isLoading } = useQuery({
    queryKey: ["preventivo", id],
    queryFn: () => fetchPreventivo(id),
  });

  const { data: agenti = [] } = useQuery({ queryKey: ["agenti"], queryFn: fetchAgenti });

  const { data: ordiniCollegati = [] } = useQuery({
    queryKey: ["ordini-collegati", id],
    queryFn: () => fetchOrdiniCollegati(id),
    enabled: !!prev && prev.tipo === "preventivo",
  });

  const { data: preventivoOrigine } = useQuery({
    queryKey: ["preventivo-origine", prev?.preventivo_origine_id],
    queryFn: () => fetchPreventivoOrigine(prev!.preventivo_origine_id!),
    enabled: !!prev?.preventivo_origine_id,
  });

  async function onChangeCliente(nuovoId: string | null) {
    if (!nuovoId) {
      save.mutate({ cliente_id: null, cantiere_id: null });
      return;
    }
    const c = await fetchCliente(nuovoId);
    save.mutate({
      cliente_id: nuovoId,
      cantiere_id: null,
      agente_codice: c?.codice_agente ?? null,
      ...(c?.fascia_listino_default ? { fascia_listino: c.fascia_listino_default } : {}),
    });
  }


  const invalidate = () => qc.invalidateQueries({ queryKey: ["preventivo", id] });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updatePreventivo>[1]) => updatePreventivo(id, patch),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const delPrev = useMutation({
    mutationFn: () => deletePreventivo(id),
    onSuccess: () => {
      const isOrd = prev?.tipo === "ordine";
      toast.success(isOrd ? "Ordine eliminato" : "Preventivo eliminato");
      navigate({ to: "/preventivatore" });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const [duplicaOpen, setDuplicaOpen] = useState(false);
  const [duplicaStep, setDuplicaStep] = useState<"scelta" | "seleziona-cliente">("scelta");
  const [duplicaClienteId, setDuplicaClienteId] = useState<string | null>(null);

  const duplica = useMutation({
    mutationFn: (args: { mode: "stesso_cliente" | "nuovo_cliente"; nuovoClienteId?: string | null }) =>
      duplicaPreventivo(id, { mode: args.mode, nuovoClienteId: args.nuovoClienteId ?? null }),
    onSuccess: (res) => {
      toast.success(`Preventivo duplicato: ${res.numero}`);
      if (res.allegatiFalliti.length > 0) {
        toast.warning(`Allegati non copiati: ${res.allegatiFalliti.join(", ")}`);
      }
      setDuplicaOpen(false);
      setDuplicaStep("scelta");
      setDuplicaClienteId(null);
      navigate({ to: "/preventivatore/$id", params: { id: res.id } });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });



  const aggiornaListini = useMutation({
    mutationFn: () => aggiornaListiniPreventivo(id),
    onSuccess: (res) => {
      const parts = [`${res.aggiornate} righe aggiornate`];
      if (res.saltate_manuali > 0) parts.push(`${res.saltate_manuali} manuali ignorate`);
      if (res.senza_listino > 0) parts.push(`${res.senza_listino} senza listino`);
      toast.success(`Listini aggiornati: ${parts.join(", ")}`);
      invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const riapplicaSpeciali = useMutation({
    mutationFn: () => riapplicaPrezziSpecialiCantiere(id),
    onSuccess: (res) => {
      if (res.aggiornate > 0) toast.success(`${res.aggiornate} righe aggiornate con prezzi speciali del cantiere`);
      invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });


  const applicaSconto = useMutation({
    mutationFn: async (perc: number) => {
      await applicaScontoPiedeARighe(id, perc);
      await updatePreventivo(id, { sconto_piede_perc: perc });
    },
    onSuccess: () => {
      toast.success("Sconto a piede applicato a tutte le righe");
      invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const addEmptyBlocco = useMutation({
    mutationFn: (ordine: number) => addBloccoVuoto(id, ordine),
    onSuccess: () => {
      invalidate();
      toast.success("Blocco aggiunto");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  function handleAddEmptyBlocco() {
    if (!prev) return;
    const last = prev.blocchi.length
      ? Number(prev.blocchi[prev.blocchi.length - 1].ordine ?? 0)
      : 0;
    addEmptyBlocco.mutate(fractionalOrder(last, null));
  }

  const totali = useMemo(() => {
    if (!prev) return { imponibile: 0, imponibile_lordo: 0, sconto_perc: 0, importo_sconto: 0, imponibile_netto: 0, iva: 0, totale: 0 };
    // Lo sconto è già applicato nelle righe (sconto_perc di riga). NON applicarlo di nuovo qui.
    return calcolaTotaliPreventivo(
      prev.blocchi.map((b) => ({
        righe: b.righe,
        quantita_base: b.quantita_base,
        prezzo_um: b.prezzo_um,
        importo: b.importo,
      })),
      Number(prev.iva_perc ?? 22),
      0,
    );
  }, [prev]);

  const margineTotale = useMemo(() => {
    let costo = 0, vendita = 0;
    for (const b of prev?.blocchi ?? []) {
      const c = calcolaBlocco(b.righe);
      costo += c.costo;
      vendita += c.totale; // già al netto dello sconto di riga
    }
    const euro = vendita - costo;
    const perc = vendita > 0 ? (euro / vendita) * 100 : 0;
    return { costo, vendita, euro: round2(euro), perc: round2(perc) };
  }, [prev]);

  const prezziSpecialiMap = useMemo<PrezziSpecialiMap>(
    () => buildPrezziSpecialiMap(prev?.prezziSpeciali ?? []),
    [prev?.prezziSpeciali],
  );


  // Persist totali in DB automaticamente quando cambiano
  const saveTotali = useMutation({
    mutationFn: (t: { imponibile: number; iva: number; totale: number }) =>
      updatePreventivo(id, {
        totale_imponibile: t.imponibile,
        iva_importo: t.iva,
        totale: t.totale,
      }),
  });

  useEffect(() => {
    if (!prev) return;
    const stored = {
      imp: Number(prev.totale_imponibile ?? 0),
      iva: Number(prev.iva_importo ?? 0),
      tot: Number(prev.totale ?? 0),
    };
    if (
      Math.abs(stored.imp - totali.imponibile) > 0.005 ||
      Math.abs(stored.iva - totali.iva) > 0.005 ||
      Math.abs(stored.tot - totali.totale) > 0.005
    ) {
      saveTotali.mutate(totali);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totali.imponibile, totali.iva, totali.totale, prev?.totale_imponibile, prev?.iva_importo, prev?.totale]);

  // Inizializza editMode: bozza vuota → modifica, altrimenti sola lettura
  useEffect(() => {
    if (!prev || editModeInitialized) return;
    setEditMode(prev.stato === "bozza" && prev.blocchi.length === 0);
    setEditModeInitialized(true);
  }, [prev, editModeInitialized]);

  useEffect(() => {
    if (prev) setModoCantiereEdit(((prev as { cantiere_descrizione?: string | null }).cantiere_descrizione) ? "provvisorio" : "cantiere");
  }, [prev?.id]);


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEndBlocchi(e: DragEndEvent) {
    if (!prev) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = prev.blocchi.findIndex((b) => b.id === active.id);
    const newIdx = prev.blocchi.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = [...prev.blocchi];
    const [m] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, m);
    reorderBlocchi(reordered.map((b, i) => ({ id: b.id, ordine: (i + 1) * 10 }))).then(invalidate);
  }

  if (isLoading || !prev) {
    return <div className="p-3 md:p-4 lg:p-6 text-sm text-muted-foreground">Caricamento…</div>;
  }

  const lastOrdine = prev.blocchi.length
    ? Number(prev.blocchi[prev.blocchi.length - 1].ordine ?? 0)
    : 0;

  const fmt = (n: number) =>
    n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cliente = prev.cliente;
  const cantiere = prev.cantiere;
  const cantiereDescrizione =
    (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione ?? null;
  const cantDescr = (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione ?? null;
  const cantiereLine = cantiere
    ? [cantiere.nome, cantiere.indirizzo, cantiere.comune?.nome].filter(Boolean).join(" · ")
    : null;

  return (
    <>
      <div className="flex flex-col gap-4 p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/preventivatore"><ArrowLeft className="mr-1 h-4 w-4" /> Preventivi</Link>
            </Button>
            <h1 className="text-xl font-semibold">
              {prev.numero ?? (prev.tipo === "ordine" ? "Nuovo ordine" : "Nuovo preventivo")}
            </h1>
            {prev.tipo === "preventivo" ? (
              <EvasioneBadge
                stato={computeEvasione(
                  prev.blocchi.flatMap((b) => b.righe ?? []),
                )}
              />
            ) : (
              <Badge variant={prev.stato === "confermato" ? "default" : prev.stato === "inviato" ? "secondary" : "outline"}>
                {STATI_LABEL[prev.stato]}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? (
                <><Check className="mr-1 h-4 w-4" /> Fine modifica</>
              ) : (
                <><Pencil className="mr-1 h-4 w-4" /> Modifica</>
              )}
            </Button>
            {editMode && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={aggiornaListini.isPending}>
                    <RefreshCw className={cn("mr-1 h-4 w-4", aggiornaListini.isPending && "animate-spin")} />
                    {aggiornaListini.isPending ? "Aggiornamento…" : "Aggiorna listini"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Aggiornare prezzi e costi dai listini attuali?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Le righe collegate ad articoli verranno aggiornate con prezzo di vendita (fascia {prev.fascia_listino ?? "—"}) e costo netto correnti. Eventuali prezzi e sconti modificati manualmente saranno SOVRASCRITTI. Lo sconto a piede, se presente, verrà riapplicato sui nuovi prezzi. Le righe manuali, note e separatori restano intatti. L'operazione non è reversibile.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={() => aggiornaListini.mutate()}>Aggiorna</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button size="sm" variant="outline" onClick={() => setOutputOpen(true)}>
              <FileDown className="mr-1 h-4 w-4" /> Genera documento
            </Button>
            {prev.tipo === "preventivo" && (
              <Dialog
                open={duplicaOpen}
                onOpenChange={(v) => {
                  setDuplicaOpen(v);
                  if (!v) {
                    setDuplicaStep("scelta");
                    setDuplicaClienteId(null);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={duplica.isPending}>
                    <Copy className="mr-1 h-4 w-4" /> {duplica.isPending ? "Duplicazione…" : "Duplica"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {duplicaStep === "scelta"
                        ? "Duplicare questo preventivo?"
                        : "Duplica preventivo — Seleziona cliente"}
                    </DialogTitle>
                    {duplicaStep === "scelta" && (
                      <DialogDescription>
                        Scegli come duplicare. In entrambi i casi verrà creato un nuovo numero progressivo, con data di oggi e stato bozza.
                        <br /><br />
                        <strong>Stesso cliente</strong>: copia completa di testata, blocchi, righe e allegati.
                        <br />
                        <strong>Nuovo cliente</strong>: copia blocchi e righe (prezzi inclusi), scegli il cliente di destinazione; agente e filiale vengono dal nuovo cliente, cantiere e allegati non vengono copiati.
                      </DialogDescription>
                    )}
                  </DialogHeader>

                  {duplicaStep === "scelta" ? (
                    <DialogFooter className="gap-2 sm:gap-2">
                      <Button variant="outline" onClick={() => setDuplicaOpen(false)}>Annulla</Button>
                      <Button variant="outline" onClick={() => setDuplicaStep("seleziona-cliente")}>
                        Nuovo cliente
                      </Button>
                      <Button onClick={() => duplica.mutate({ mode: "stesso_cliente" })}>
                        Stesso cliente
                      </Button>
                    </DialogFooter>
                  ) : (
                    <>
                      <div className="grid gap-2 py-2">
                        <Label>Cliente di destinazione</Label>
                        <ClientePicker value={duplicaClienteId} onChange={setDuplicaClienteId} />
                        <p className="text-xs text-muted-foreground">
                          Agente e filiale verranno presi dal cliente selezionato.
                        </p>
                      </div>
                      <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" onClick={() => setDuplicaStep("scelta")}>
                          Indietro
                        </Button>
                        <Button
                          disabled={!duplicaClienteId || duplica.isPending}
                          onClick={() =>
                            duplica.mutate({ mode: "nuovo_cliente", nuovoClienteId: duplicaClienteId })
                          }
                        >
                          {duplica.isPending ? "Duplicazione…" : "Duplica"}
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            )}


            {prev.tipo === "preventivo" && (
              <Button size="sm" onClick={() => setTrasformaOpen(true)}>
                <ShoppingCart className="mr-1 h-4 w-4" /> Trasforma in ordine
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 className="mr-1 h-4 w-4" /> {prev.tipo === "ordine" ? "Elimina ordine" : "Elimina preventivo"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{prev.tipo === "ordine" ? "Eliminare l'ordine?" : "Eliminare il preventivo?"}</AlertDialogTitle>
                  <AlertDialogDescription>Tutti i blocchi e le righe verranno eliminati. Irreversibile.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={() => delPrev.mutate()}>Elimina</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Link incrociati preventivo ↔ ordini */}
        {(ordiniCollegati.length > 0 || preventivoOrigine) && (
          <Card className="border-[#0d1f3c]/15 bg-[#f4f7fb]">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
              {preventivoOrigine && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Generato da preventivo:</span>
                  <Link
                    to="/preventivatore/$id"
                    params={{ id: preventivoOrigine.id }}
                    className="font-mono font-semibold text-[#2b5ea7] hover:underline"
                  >
                    {preventivoOrigine.numero ?? "—"}
                  </Link>
                </div>
              )}
              {ordiniCollegati.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">
                    Ordini collegati ({ordiniCollegati.length}):
                  </span>
                  {ordiniCollegati.map((o) => (
                    <Link
                      key={o.id}
                      to="/preventivatore/$id"
                      params={{ id: o.id }}
                      className="rounded bg-white px-1.5 py-0.5 font-mono text-[#2b5ea7] hover:underline"
                    >
                      {o.numero ?? "—"}{" "}
                      <span className="text-[10px] text-muted-foreground">
                        ({STATI_LABEL[o.stato]})
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className={cn("flex flex-col gap-5 pt-3", !editMode && "readonly-mode")}>
            <fieldset disabled={!editMode} className="contents">
            {/* ===== TESTATA ===== */}
            <section className="flex flex-col gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Testata</div>

              {!editMode ? (
                /* ===== BANNER RIASSUNTIVO (sola lettura) ===== */
                <Card className="overflow-hidden border-[#0d1f3c]/15">
                  <CardContent
                    className="p-3 md:p-3.5"
                    style={{ background: "linear-gradient(135deg, #f4f7fb 0%, #e8eef7 100%)" }}
                  >
                    {cliente ? (
                      <div className="flex flex-col space-y-0.5">
                        {cliente.id_cliente && (
                          <div className="font-mono text-xs text-[#2b5ea7]">Cliente n. {cliente.id_cliente}</div>
                        )}
                        <Link
                          to="/clienti/$clienteId"
                          params={{ clienteId: cliente.id }}
                          onClick={(e) => e.stopPropagation()}
                          title="Apri scheda cliente"
                          className="cursor-pointer self-start bg-transparent p-0 text-left text-base font-bold leading-tight text-[#0d1f3c] hover:text-[#2b5ea7] hover:underline"
                        >
                          {cliente.ragione_sociale}
                        </Link>
                        {cliente.piva && (
                          <div className="text-sm leading-snug text-[#0d1f3c]/80">P.IVA {cliente.piva}</div>
                        )}
                        {cliente.indirizzo && (
                          <div className="text-sm leading-snug text-[#0d1f3c]/80">{cliente.indirizzo}</div>
                        )}
                        {(cliente.cap || cliente.comune?.nome || cliente.provincia) && (
                          <div className="text-sm leading-snug text-[#0d1f3c]/80">
                            {[cliente.cap, cliente.comune?.nome].filter(Boolean).join(" ")}
                            {cliente.provincia ? ` (${cliente.provincia})` : ""}
                          </div>
                        )}
                        {cantiereLine ? (
                          <div className="pt-0.5 text-sm leading-snug text-[#0d1f3c]">📍 Cantiere: {cantiereLine}</div>
                        ) : cantiereDescrizione ? (
                          <div className="pt-0.5 text-sm leading-snug text-[#0d1f3c]">
                            📍 Cantiere (provvisorio): {cantiereDescrizione}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Nessun cliente selezionato</div>
                    )}

                    {/* Griglia campi aggiuntivi */}
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-[#0d1f3c]/10 pt-2 md:grid-cols-3">
                      {[
                        { label: "Numero", value: prev.numero || "—" },
                        { label: "Data", value: prev.data ? new Date(prev.data).toLocaleDateString("it-IT") : "—" },
                        { label: "Validità", value: prev.validita ? new Date(prev.validita).toLocaleDateString("it-IT") : "—" },
                        { label: "Agente", value: agenti.find((a) => a.id === prev.agente_codice)?.nome || "—" },
                        { label: "Filiale", value: prev.filiale || "—" },
                        { label: "Tipo documento", value: TIPI_DOC_LABEL[prev.tipo_doc] || "—" },
                        { label: "Fascia listino", value: prev.fascia_listino || "—" },
                        { label: "Stato", value: STATI_LABEL[prev.stato] || "—" },
                        { label: "IVA", value: `${Number(prev.iva_perc ?? 22)}%` },
                      ].map((f) => (
                        <div key={f.label} className="flex flex-col leading-tight">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</span>
                          <span className="text-sm font-medium text-[#0d1f3c]">{f.value}</span>
                        </div>
                      ))}
                    </div>
                    {prev.note && (
                      <div className="mt-2 border-t border-[#0d1f3c]/10 pt-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Note</div>
                        <div className="whitespace-pre-wrap text-sm leading-snug text-[#0d1f3c]">{prev.note}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Cliente / Cantiere pickers */}
                  <Card>
                    <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Cliente</Label>
                        <ClientePicker value={prev.cliente_id ?? null} onChange={onChangeCliente} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Cantiere</Label>
                        <CantierePicker
                          cliente_id={prev.cliente_id ?? null}
                          value={prev.cantiere_id ?? null}
                          onChange={(id) => save.mutate({ cantiere_id: id }, { onSuccess: () => riapplicaSpeciali.mutate() })}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Campi modificabili in griglia 2 colonne */}
                  <Card>
                    <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Numero</Label>
                        <Input defaultValue={prev.numero ?? ""}
                          onBlur={(e) => {
                            if ((e.target.value || null) !== prev.numero)
                              save.mutate({ numero: e.target.value || null });
                          }} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Agente</Label>
                        <Select
                          value={prev.agente_codice ?? ""}
                          onValueChange={(v) => save.mutate({ agente_codice: v || null })}
                        >
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {agenti.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Filiale</Label>
                        <Input
                          defaultValue={prev.filiale ?? ""}
                          key={`fil-${prev.filiale ?? ""}`}
                          onBlur={(e) => {
                            if ((e.target.value || null) !== prev.filiale)
                              save.mutate({ filiale: e.target.value || null });
                          }}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Data</Label>
                        <Input type="date" defaultValue={prev.data}
                          onBlur={(e) => { if (e.target.value && e.target.value !== prev.data) save.mutate({ data: e.target.value }); }} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Validità</Label>
                        <Input type="date" defaultValue={prev.validita ?? ""}
                          onBlur={(e) => { if ((e.target.value || null) !== prev.validita) save.mutate({ validita: e.target.value || null }); }} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Tipo documento</Label>
                        <Select value={prev.tipo_doc} onValueChange={(v) => save.mutate({ tipo_doc: v as TipoDoc })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIPI_DOC.map((t) => (
                              <SelectItem key={t} value={t}>{TIPI_DOC_LABEL[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Fascia listino</Label>
                        <Select value={prev.fascia_listino ?? "A"} onValueChange={(v) => save.mutate({ fascia_listino: v as FasciaListino })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FASCE.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Stato</Label>
                        <Select value={prev.stato} onValueChange={(v) => save.mutate({ stato: v as StatoPreventivo })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATI.map((s) => <SelectItem key={s} value={s}>{STATI_LABEL[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">IVA %</Label>
                        <Input type="text" inputMode="decimal" defaultValue={String(prev.iva_perc ?? 22).replace(".",",")}
                          onBlur={(e) => {
                            const v = parseNumeroIt(e.target.value);
                            if (v !== null && v !== Number(prev.iva_perc ?? 22)) save.mutate({ iva_perc: v });
                          }} />
                      </div>
                      <div className="grid gap-1.5 md:col-span-2">
                        <Label className="text-xs">Note</Label>
                        <Textarea rows={2} defaultValue={prev.note ?? ""}
                          onBlur={(e) => { if ((e.target.value || null) !== prev.note) save.mutate({ note: e.target.value || null }); }} />
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </section>

            {/* ===== CORPO ===== */}
            <section className="flex flex-col gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Corpo · Blocchi ({prev.blocchi.length})
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndBlocchi}>
                <SortableContext items={prev.blocchi.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-4">
                    {prev.blocchi.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
                          <p className="text-sm text-muted-foreground">Nessun blocco. {editMode ? "Aggiungine uno per iniziare." : "Premi Modifica per aggiungerne."}</p>
                          {editMode && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={handleAddEmptyBlocco} disabled={addEmptyBlocco.isPending}>
                                <Plus className="mr-1 h-4 w-4" /> Aggiungi blocco
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setAddBloccoOpen(true)}>
                                Da Kit
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      prev.blocchi.map((b, idx) => (
                        <BloccoCard key={b.id} blocco={b} index={idx} preventivoId={id} fascia={(prev.fascia_listino ?? "A") as FasciaListino} readOnly={!editMode} prezziSpecialiMap={prezziSpecialiMap} />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
              {editMode && prev.blocchi.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleAddEmptyBlocco} disabled={addEmptyBlocco.isPending}>
                    <Plus className="mr-1 h-4 w-4" /> Aggiungi blocco
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddBloccoOpen(true)}>
                    Da Kit
                  </Button>
                </div>
              )}
            </section>
            </fieldset>

            {/* ===== PIEDE ===== */}
            <section className="flex flex-col gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Piede</div>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between border-b py-2">
                    <span className="text-sm font-medium text-muted-foreground">Margine</span>
                    <span className={cn("font-mono text-base font-semibold", margineTotale.perc >= 0 ? "text-[#009246]" : "text-destructive")}>
                      {margineTotale.perc.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% · € {fmt(margineTotale.euro)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-1">
                    <Label className="text-sm text-muted-foreground" htmlFor="sconto-piede">Sconto a piede %</Label>
                    <Input
                      id="sconto-piede"
                      type="text"
                      inputMode="decimal"
                      disabled={!editMode || applicaSconto.isPending}
                      defaultValue={String(Number(prev.sconto_piede_perc ?? 0)).replace(".",",")}
                      key={`scp-${prev.sconto_piede_perc ?? 0}`}
                      className="h-8 w-28 text-right font-mono"
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const parsed = raw === "" ? 0 : parseNumeroIt(raw);
                        const v = parsed === null ? 0 : Math.max(0, parsed);
                        if (v !== Number(prev.sconto_piede_perc ?? 0)) {
                          applicaSconto.mutate(v);
                        }
                      }}
                    />
                  </div>
                  <p className="text-[11px] italic text-muted-foreground">
                    Applicando lo sconto a piede, la percentuale verrà impostata su tutte le righe.
                    {applicaSconto.isPending && " · Aggiornamento in corso…"}
                  </p>
                  {Number(prev.sconto_piede_perc ?? 0) > 0 && (
                    <div className="flex items-center justify-between border-t py-1 text-destructive">
                      <span className="text-sm">
                        Sconto applicato: {Number(prev.sconto_piede_perc).toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}% su tutte le righe
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between rounded-md bg-[#0d1f3c] px-4 py-3 text-white">
                    <span className="text-sm font-semibold uppercase tracking-wider">Totale</span>
                    <span className="font-mono text-2xl font-bold">€ {fmt(totali.imponibile_netto)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-muted-foreground">IVA {Number(prev.iva_perc ?? 22)}%</span>
                    <span className="font-mono text-base">€ {fmt(totali.iva)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-muted-foreground">Totale con IVA</span>
                    <span className="font-mono text-base">€ {fmt(totali.totale)}</span>
                  </div>
                  <p className="pt-2 text-[11px] italic text-muted-foreground">
                    Il presente preventivo si intende valido per il periodo di validità indicato. I prezzi sono espressi in Euro, IVA esclusa salvo diversa indicazione.
                  </p>

                </CardContent>
              </Card>
            </section>

        </div>
      </div>


      <AggiungiBloccoDialog
        open={addBloccoOpen}
        onOpenChange={setAddBloccoOpen}
        preventivoId={id}
        fascia={(prev.fascia_listino ?? "A") as FasciaListino}
        lastOrdine={lastOrdine}
      />

      <GeneraDocumentoDialog open={outputOpen} onOpenChange={setOutputOpen} prev={prev} />
      {prev.tipo === "preventivo" && (
        <TrasformaInOrdineDialog
          open={trasformaOpen}
          onOpenChange={setTrasformaOpen}
          prev={prev}
        />
      )}
    </>
  );
}

function BloccoCard({
  blocco, index, preventivoId, fascia, readOnly = false, prezziSpecialiMap,
}: { blocco: BloccoConRighe; index: number; preventivoId: string; fascia: FasciaListino; readOnly?: boolean; prezziSpecialiMap?: PrezziSpecialiMap | null }) {
  const qc = useQueryClient();
  const sortable = useSortable({ id: blocco.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  const calc = useMemo(() => calcolaBlocco(blocco.righe), [blocco.righe]);
  const totaleBlocco = calc.totale || Number(blocco.importo ?? 0);
  const prezzoUm =
    Number(blocco.quantita_base ?? 0) > 0
      ? round2(totaleBlocco / Number(blocco.quantita_base))
      : Number(blocco.prezzo_um ?? 0);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["preventivo", preventivoId] });

  const upd = useMutation({
    mutationFn: (patch: Parameters<typeof updateBlocco>[1]) => updateBlocco(blocco.id, patch),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const recalcQta = useMutation({
    mutationFn: (v: number | null) =>
      ricalcolaBloccoSuNuovaQuantita(blocco.id, v, blocco.righe),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: () => deleteBlocco(blocco.id),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <div ref={sortable.setNodeRef} style={style}>
      <Card>
        <CardContent className="space-y-3 p-0">
          {/* Header blocco */}
          <div className="flex flex-wrap items-start gap-3 border-b bg-muted/30 p-3">
            <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab pt-2" title="Trascina">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="text-sm font-semibold text-muted-foreground">#{index + 1}</div>
            <div className="grid w-24 gap-1">
              <Label className="text-[10px] uppercase">Rif.</Label>
              <Input
                defaultValue={blocco.rif_capitolato ?? ""}
                onBlur={(e) => { if ((e.target.value || null) !== blocco.rif_capitolato) upd.mutate({ rif_capitolato: e.target.value || null }); }}
                className="h-8 font-mono font-semibold"
                placeholder="Rif. (facoltativo)"
              />
            </div>
            <div className="grid flex-1 min-w-[200px] gap-1">
              <Label className="text-[10px] uppercase">Descrizione</Label>
              <Input
                defaultValue={blocco.descrizione ?? ""}
                onBlur={(e) => { if ((e.target.value || null) !== blocco.descrizione) upd.mutate({ descrizione: e.target.value || null }); }}
                className="h-8 font-medium"
              />
            </div>
            <div className="grid w-24 gap-1">
              <Label className="text-[10px] uppercase">Quantità</Label>
              <Input
                type="text" inputMode="decimal"
                defaultValue={String(blocco.quantita_base ?? 0).replace(".",",")}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : parseNumeroIt(e.target.value);
                  if (v !== (blocco.quantita_base == null ? null : Number(blocco.quantita_base)))
                    recalcQta.mutate(v);
                }}
                className="h-8 text-right font-mono"
              />
            </div>
            <div className="grid w-16 gap-1">
              <Label className="text-[10px] uppercase">U.M.</Label>
              <Input
                defaultValue={blocco.um_base ?? "mq"}
                onBlur={(e) => { if (e.target.value && e.target.value !== blocco.um_base) upd.mutate({ um_base: e.target.value }); }}
                className="h-8"
              />
            </div>
            <div className="grid w-24 gap-1 text-right">
              <Label className="text-[10px] uppercase">Prezzo / {blocco.um_base}</Label>
              <div className="h-8 rounded border bg-card px-2 py-1 text-right font-mono text-sm">
                € {prezzoUm.toFixed(2)}
              </div>
            </div>
            <div className="grid w-28 gap-1 text-right">
              <Label className="text-[10px] uppercase">Importo</Label>
              <div className="h-8 rounded border bg-primary/10 px-2 py-1 text-right font-mono text-sm font-semibold">
                € {totaleBlocco.toFixed(2)}
              </div>
            </div>
            {!readOnly && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="mt-5 h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare il blocco?</AlertDialogTitle>
                    <AlertDialogDescription>Verranno eliminate anche tutte le righe del blocco.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate()}>Elimina</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {blocco.note_tecniche && (
            <div className="px-3 text-xs italic text-muted-foreground">
              {blocco.note_tecniche}
            </div>
          )}

          <RigheTable blocco={blocco} preventivoId={preventivoId} fascia={fascia} readOnly={readOnly} prezziSpecialiMap={prezziSpecialiMap} />
        </CardContent>
      </Card>
    </div>
  );
}