import { FasciaPreventivo, type RiepilogoPreventivo } from '@/components/preventivatore/FasciaPreventivo';
import { TestataPreventivo } from '@/components/preventivatore/TestataPreventivo';
import { PiedePreventivo } from '@/components/preventivatore/PiedePreventivo';
import { BadgeTestata } from '@/components/preventivatore/BadgeTestata';
import { ClientePreventivoDialog } from '@/components/preventivatore/ClientePreventivoDialog';
import { Tabs,TabsList,TabsTrigger,TabsContent } from '@/components/ui/tabs';
import { DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useCodiciPagamento } from '@/components/condizione-pagamento-richiesta-select';
import { fetchDatiClientePreventivo, fetchCondizioniPreventivoCliente } from '@/lib/preventivi-api';
import { formatDate } from '@/lib/fidi';
import { MoreHorizontal } from 'lucide-react';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
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
import { useAuth } from "@/hooks/use-auth";
import { preventivoModificabile, puoScriverePreventivi } from "@/lib/permessi-preventivi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Copy, FileDown, GripVertical, Loader2, Lock, Plus, RefreshCw, Save, ShoppingCart, Trash2,
} from "lucide-react";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import {
  addBloccoVuoto,
  applicaScontoPiedeARighe,
  analizzaAggiornaListini, applicaAggiornaListini, type AnalisiAggiornaListini,
  buildPrezziSpecialiMap,
  calcolaBlocco, calcolaTotaliPreventivo, deleteBlocco, deletePreventivo, duplicaPreventivo, fetchAgenti, fetchCliente, fetchOrdiniCollegati, fetchPreventivo, fetchPreventivoOrigine,
  fractionalOrder,
  reorderBlocchi, ricalcolaBloccoSuNuovaQuantita, riapplicaPrezziSpecialiCantiere, STATI, STATI_LABEL, TIPI_DOC, TIPI_DOC_LABEL,
  updateBlocco, updatePreventivo,
  type BloccoConRighe, type PrezziSpecialiMap, type StatoPreventivo, type TipoDoc,
} from "@/lib/preventivi-api";


import type { FasciaListino } from "@/lib/articoli-api";
import { AggiornaListiniDialog } from "@/components/preventivatore/AggiornaListiniDialog";
import { round2 } from "@/lib/pricing";
import { margineTotaliRighe } from "@/lib/riga-preventivo";
import { formatNumeroIt, parseNumeroIt } from "@/lib/numero-it";
import { cn } from "@/lib/utils";
import { UscitaNonSalvataDialog } from "@/components/preventivatore/UscitaNonSalvataDialog";
import { devoBloccareUscita, useStatoSalvataggioPreventivo, type StatoSalvataggio } from "@/lib/use-stato-salvataggio-preventivo";
import { AggiungiBloccoDialog } from "@/components/preventivatore/AggiungiBloccoDialog";
import { RigheTable } from "@/components/preventivatore/RigheTable";
import { GeneraDocumentoDialog } from "@/components/preventivatore/GeneraDocumentoDialog";
import { ClientePicker } from "@/components/preventivatore/ClientePicker";
import { TrasformaInOrdineDialog } from "@/components/preventivatore/TrasformaInOrdineDialog";

export const Route = createFileRoute("/_app/preventivatore/$id")({
  validateSearch: zodValidator(z.object({tab:fallback(z.string(),'corpo').default('corpo')})),
  head: () => ({ meta: [
    { title: "Editor Preventivo — Sistema MADE" },
    { name: "description", content: "Articoli, kit e condizioni cliente nel preventivo MADE." },
    { property: "og:title", content: "Editor Preventivo — Sistema MADE" },
    { property: "og:description", content: "Articoli, kit e condizioni cliente nel preventivo MADE." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PreventivoEditorPage,
});

function PreventivoEditorPage() {
  const { id } = Route.useParams();
  const {tab: tabUrl}=Route.useSearch();
  const tab=['testata','corpo','piede'].includes(tabUrl)?tabUrl:'corpo';
  const [clienteOpen,setClienteOpen]=useState(false);
  const [eliminaOpen,setEliminaOpen]=useState(false);
  const {data:codiciPagamento=[]}=useCodiciPagamento();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const salvataggio = useStatoSalvataggioPreventivo(id);
  const [salvaAttesa, setSalvaAttesa] = useState(false);
  const onSalva = async () => {
    setSalvaAttesa(true);
    try {
      const ok = await salvataggio.salvaOra();
      if (ok) toast.success("Preventivo salvato"); else toast.error("Errore nel salvataggio");
    } finally { setSalvaAttesa(false); }
  };
  const [addBloccoOpen, setAddBloccoOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const { roles } = useAuth();
  // FM63: chi consulta soltanto (es. store manager) non vede comandi di modifica; il DB resta il controllo vero.
  const puoScrivere = puoScriverePreventivi(roles as string[]);
  const [trasformaOpen, setTrasformaOpen] = useState(false);

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
    queryFn: () => prev?.preventivo_origine_id ? fetchPreventivoOrigine(prev.preventivo_origine_id) : null,
    enabled: !!prev?.preventivo_origine_id,
  });

  const {data:clienteDati}=useQuery({queryKey:['cliente-preventivo-dati',prev?.cliente_id],queryFn:()=>prev?.cliente_id?fetchDatiClientePreventivo(prev.cliente_id):null,enabled:!!prev?.cliente_id});
  const {data:condizioni}=useQuery({queryKey:['condizioni-preventivo-cliente',prev?.cliente_id],queryFn:()=>prev?.cliente_id?fetchCondizioniPreventivoCliente(prev.cliente_id):null,enabled:!!prev?.cliente_id});
  const {data:principali=[]}=useQuery({queryKey:['preventivi-principali',prev?.cliente_id,id],queryFn:async()=>{
    if(!prev?.cliente_id)return [];
    const {data,error}=await supabase.from('preventivi').select('id,numero,titolo').eq('cliente_id',prev.cliente_id).eq('tipo','preventivo').is('alternativa_di',null).neq('id',id).order('created_at');
    if(error)throw error; return data||[];
  },enabled:!!prev?.cliente_id});
  const {data:haAlternative=false}=useQuery({queryKey:['preventivo-ha-alternative',id],queryFn:async()=>{const {count,error}=await supabase.from('preventivi').select('id',{count:'exact',head:true}).eq('alternativa_di',id);if(error)throw error;return (count||0)>0;}});
  const {data:lettera}=useQuery({queryKey:['preventivo-lettera',id,prev?.alternativa_di],queryFn:async()=>{const {data,error}=await supabase.rpc('lettera_preventivo',{_id:id});if(error)throw error;return data;},enabled:!!prev?.alternativa_di});

  async function onChangeCliente(nuovoId: string | null) {
    if (!nuovoId) {
      save.mutate({ cliente_id: null, cantiere_id: null });
      return;
    }
    const c = await fetchDatiClientePreventivo(nuovoId);
    save.mutate({
      cliente_id: nuovoId,
      cantiere_id: null,
      alternativa_di: null,
      agente_codice: c?.codice_agente ?? null,
    });
  }


  const invalidate = () => qc.invalidateQueries({ queryKey: ["preventivo", id] });

  const save = useMutation({ mutationKey: ["salva-preventivo", id],
    mutationFn: (patch: Parameters<typeof updatePreventivo>[1]) => updatePreventivo(id, patch),
    onSuccess: () => { invalidate(); qc.invalidateQueries({queryKey:['preventivi-principali']}); qc.invalidateQueries({queryKey:['preventivo-lettera']}); qc.invalidateQueries({queryKey:['preventivo-ha-alternative']}); },
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
    mutationFn: (args: { mode: "stesso_cliente" | "nuovo_cliente" | "alternativa"; nuovoClienteId?: string | null }) =>
      duplicaPreventivo(id, { mode: args.mode, nuovoClienteId: args.nuovoClienteId ?? null }),
    onSuccess: (res, args) => {
      toast.success(args.mode === "alternativa" ? `Alternativa creata: ${res.numero}` : `Preventivo duplicato: ${res.numero}`);
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



  const [analisiListini, setAnalisiListini] = useState<AnalisiAggiornaListini | null>(null);
  const aggiornaListini = useMutation({ mutationKey: ["salva-preventivo", id],
    mutationFn: () => analizzaAggiornaListini(id),
    onSuccess: (res) => {
      if (res.differenze.length === 0) {
        toast.success(`Nessuna differenza: ${res.invariate} righe già aggiornate` +
          (res.senza_codice + res.non_articolo + res.senza_prezzo > 0 ? ` (${res.senza_codice} senza codice Gamma, ${res.senza_prezzo} senza prezzo, ${res.non_articolo} manuali/note non toccate)` : ""));
        return;
      }
      setAnalisiListini(res);
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const applicaListini = useMutation({ mutationKey: ["salva-preventivo", id],
    mutationFn: (scelte: AnalisiAggiornaListini["differenze"]) => applicaAggiornaListini(id, scelte),
    onSuccess: (res) => {
      toast.success(`${res.aggiornate} righe aggiornate` + (res.speciali ? `, ${res.speciali} con prezzi speciali cantiere` : ""));
      setAnalisiListini(null);
      invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const riapplicaSpeciali = useMutation({ mutationKey: ["salva-preventivo", id],
    mutationFn: () => riapplicaPrezziSpecialiCantiere(id),
    onSuccess: (res) => {
      if (res.aggiornate > 0) toast.success(`${res.aggiornate} righe aggiornate con prezzi speciali del cantiere`);
      invalidate();
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });


  const applicaSconto = useMutation({ mutationKey: ["salva-preventivo", id],
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

  const addEmptyBlocco = useMutation({ mutationKey: ["salva-preventivo", id],
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
    return { costo, vendita, ...margineTotaliRighe({ totale: vendita, costo }) };
  }, [prev]);

  const prezziSpecialiMap = useMemo<PrezziSpecialiMap>(
    () => buildPrezziSpecialiMap(prev?.prezziSpeciali ?? []),
    [prev?.prezziSpeciali],
  );


  // Persist totali in DB automaticamente quando cambiano
  const saveTotali = useMutation({ mutationKey: ["salva-preventivo", id],
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

  // FM65 B3: finestra d'uscita solo con modifiche/salvataggio/errore; il cambio tab (?tab=) non blocca mai.
  const bloccaUscita = !!prev && preventivoModificabile(prev, puoScrivere) && devoBloccareUscita(salvataggio.stato);
  const uscita = useBlocker({
    shouldBlockFn: ({ current, next }) => bloccaUscita && current.pathname !== next.pathname,
    enableBeforeUnload: bloccaUscita,
    withResolver: true,
  });

  if (isLoading || !prev) {
    return <div className="p-3 md:p-4 lg:p-6 text-sm text-muted-foreground">Caricamento…</div>;
  }

  const lastOrdine = prev.blocchi.length
    ? Number(prev.blocchi[prev.blocchi.length - 1].ordine ?? 0)
    : 0;
  // FM65 punto 3: scheda sempre modificabile per chi ha il permesso; confermati e ordini in sola lettura.
  const modificabile = preventivoModificabile(prev, puoScrivere);

  const fmt = (n: number) =>
    formatNumeroIt(n, { minDecimals: 2, maxDecimals: 2 });
  const cliente = prev.cliente;
  const cantiere = prev.cantiere;
  const cantiereDescrizione =
    (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione ?? null;
  const cantDescr = (prev as { cantiere_descrizione?: string | null }).cantiere_descrizione ?? null;
  const cantiereLine = cantiere
    ? [cantiere.nome, cantiere.indirizzo, cantiere.comune?.nome].filter(Boolean).join(" · ")
    : null;

  const listino=condizioni?.listino != null ? String(condizioni.listino) : '—';
  const categoria=condizioni?.macrocategoria ? [condizioni.macrocategoria_label,condizioni.categoria_label].filter(Boolean).join(' – ') : '—';
  const pagamentoCod=prev.condizione_pagamento_cod||clienteDati?.condizione_pagamento_cod||'';
  const pagamentoDesc=codiciPagamento.find(c=>c.cod===pagamentoCod)?.descrizione||clienteDati?.condizione_pagamento_desc||'';
  const riepilogo:RiepilogoPreventivo={cliente:[clienteDati?.codice_gestionale,clienteDati?.ragione_sociale||cliente?.ragione_sociale].filter(Boolean).join(' · ')||'—',cantiere:cantiere?.nome?`${cantiere.nome}${cantiere.provvisorio?' (provvisorio)':''}`:(cantiereDescrizione||'Da definire'),listino,categoria,pagamento:pagamentoCod?`${pagamentoDesc||pagamentoCod} (${pagamentoCod})`:'—',validita:prev.validita?formatDate(prev.validita):'—',imponibile:totali.imponibile_netto,marginePerc:margineTotale.perc,margineEuro:margineTotale.euro};
  const cambiaTab=(v:string)=>navigate({to:'/preventivatore/$id',params:{id},search:(old)=>({...old,tab:v}),replace:true});

  return (
    <>
      <div className="flex flex-col gap-3 p-3 md:p-4 min-w-0 pv-orizzontale:px-0 pv-orizzontale:py-1">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-card p-3">
          <div className="flex flex-wrap min-w-0 items-center gap-2">
            <BackButton fallbackTo="/preventivatore" fallbackLabel="Preventivi" />
            <h1 className="text-xl font-semibold">
              {prev.numero ?? (prev.tipo === "ordine" ? "Nuovo ordine" : "Nuovo preventivo")}
            </h1>
            <BadgeTestata prev={prev} />
            {prev.alternativa_di && <Link to="/preventivatore/$id" params={{id:prev.alternativa_di}} search={{tab:'corpo'}} className="text-xs bg-warning/20 text-warning-foreground border border-warning px-2 py-1 rounded">Alt. {lettera||'…'} di {principali.find(p=>p.id===prev.alternativa_di)?.numero||'preventivo principale'}</Link>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {modificabile && (
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
                      Calcolo i prezzi attuali del cliente per le righe articolo e kit con codice Gamma e ti mostro solo quelle diverse: scegli tu quali applicare. Lo sconto extra resta com'è; righe manuali, note e separatori non si toccano.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction onClick={() => aggiornaListini.mutate()}>Confronta</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {modificabile && (
              <>
                <BadgeSalvataggio stato={salvataggio.stato} />
                <Button size="sm" onClick={onSalva} disabled={salvaAttesa}>
                  {salvaAttesa ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  {salvaAttesa ? "Salvataggio…" : "Salva"}
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => setOutputOpen(true)}>
              <FileDown className="mr-1 h-4 w-4" /> Genera documento
            </Button>
            {puoScrivere && prev.tipo === "preventivo" && (
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
                <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl min-w-0 overflow-x-hidden [&>*]:min-w-0">
                  <DialogHeader className="break-words text-left">
                    <DialogTitle>
                      {duplicaStep === "scelta"
                        ? "Duplicare questo preventivo?"
                        : "Duplica preventivo — Seleziona cliente"}
                    </DialogTitle>
                    {duplicaStep === "scelta" && (
                      <DialogDescription className="whitespace-normal break-words">
                        Scegli come duplicare. In tutti i casi verrà creato un nuovo numero progressivo, con data di oggi e stato bozza.
                        <br /><br />
                        <strong>Stesso cliente</strong>: copia di testata, blocchi e righe (stesso cliente, cantiere e agente); gli allegati non vengono copiati.
                        <br />
                        <strong>Come alternativa</strong>: stessa copia, collegata come alternativa al preventivo principale (lettera B, C…).
                        <br />
                        <strong>Nuovo cliente</strong>: copia blocchi e righe (prezzi inclusi), scegli il cliente di destinazione; agente e filiale vengono dal nuovo cliente, cantiere e allegati non vengono copiati.
                      </DialogDescription>
                    )}
                  </DialogHeader>

                  {duplicaStep === "scelta" ? (
                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:space-x-0 [&>button]:min-h-10 [&>button]:w-full sm:[&>button]:w-auto">
                      <Button onClick={() => duplica.mutate({ mode: "stesso_cliente" })}>
                        Stesso cliente
                      </Button>
                      <Button variant="outline" disabled={duplica.isPending} onClick={() => duplica.mutate({ mode: "alternativa" })}>
                        Come alternativa
                      </Button>
                      <Button variant="outline" onClick={() => setDuplicaStep("seleziona-cliente")}>
                        Nuovo cliente
                      </Button>
                      <Button variant="outline" onClick={() => setDuplicaOpen(false)}>Annulla</Button>
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


            {puoScrivere && prev.tipo === "preventivo" && (
              <Button size="sm" variant="outline" className="border-pv-verde text-pv-verde hover:bg-pv-verde-tenue hover:text-pv-verde" onClick={() => setTrasformaOpen(true)}>
                <ShoppingCart className="mr-1 h-4 w-4" /> Trasforma in ordine
              </Button>
            )}
            {puoScrivere && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Altre azioni"><MoreHorizontal className="size-5"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive" onSelect={()=>setEliminaOpen(true)}><Trash2 className="size-4 mr-2"/>Elimina</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}

          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3" {...salvataggio.contenitoreProps}>
        <FasciaPreventivo dati={riepilogo} titolo={prev.titolo} clienteId={prev.cliente_id} onCliente={()=>setClienteOpen(true)}/>
        {puoScrivere && !modificabile && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" />
            <span>{prev.tipo === "ordine" ? "Ordine: in sola lettura." : "Preventivo confermato: in sola lettura. Per modificarlo riporta lo stato a Bozza o Inviato in Testata."}</span>
          </div>
        )}
        {/* Link incrociati preventivo ↔ ordini */}
        {(ordiniCollegati.length > 0 || preventivoOrigine) && (
          <Card className="border-primary/15 bg-muted">
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
              {preventivoOrigine && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Generato da preventivo:</span>
                  <Link
                    to="/preventivatore/$id"
                    params={{ id: preventivoOrigine.id }}
                    className="font-mono font-semibold text-info hover:underline"
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
                      className="rounded bg-card px-1.5 py-0.5 font-mono text-info hover:underline"
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

        <Tabs value={tab} onValueChange={cambiaTab} className="min-w-0">
          <TabsList variant="linguette" className="w-full justify-start">
            {(['testata','corpo','piede'] as const).map(t=><TabsTrigger key={t} variant="linguette" value={t}>{t==='testata'?'Testata':t==='piede'?'Piede':`Corpo · ${prev.blocchi.length} blocchi`}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="testata"><TestataPreventivo prev={prev} cliente={clienteDati} modificabile={modificabile} statoEditabile={puoScrivere} agenti={agenti} principali={principali} haAlternative={haAlternative} listino={listino} categoria={categoria} sede={condizioni?.sede_nome||'—'} onSave={p=>save.mutate(p)} onCliente={()=>setClienteOpen(true)} onChangeCliente={onChangeCliente} onCantiere={cid=>save.mutate({cantiere_id:cid,cantiere_descrizione:null},{onSuccess:()=>riapplicaSpeciali.mutate()})}/></TabsContent>
          <TabsContent value="corpo"><fieldset disabled={!modificabile} className={cn('min-w-0',!modificabile&&'readonly-mode')}>
            {/* ===== CORPO ===== */}
            <section className="flex flex-col gap-3">

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndBlocchi}>
                <SortableContext items={prev.blocchi.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-4">
                    {prev.blocchi.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
                          <p className="text-sm text-muted-foreground">Nessun blocco. {modificabile ? "Aggiungine uno per iniziare." : ""}</p>
                          {modificabile && (
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
                        <BloccoCard key={b.id} blocco={b} index={idx} preventivoId={id} fascia={(prev.fascia_listino ?? "A") as FasciaListino} readOnly={!modificabile} prezziSpecialiMap={prezziSpecialiMap} clienteId={prev.cliente_id ?? null} scontoPiede={Number(prev.sconto_piede_perc ?? 0)} />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
              {modificabile && prev.blocchi.length > 0 && (
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
            </fieldset></TabsContent>
          <TabsContent value="piede"><PiedePreventivo dati={riepilogo} iva={totali.iva} totale={totali.totale} ivaPerc={Number(prev.iva_perc??22)} sconto={Number(prev.sconto_piede_perc??0)} modificabile={modificabile} inCorso={applicaSconto.isPending} onSconto={v=>applicaSconto.mutate(v)} onTestata={()=>cambiaTab('testata')}/></TabsContent>
        </Tabs>
        </div>
      </div>
      <UscitaNonSalvataDialog
        open={uscita.status === "blocked"}
        stato={salvataggio.stato}
        salvaOra={salvataggio.salvaOra}
        onEsci={() => uscita.proceed?.()}
        onResta={() => uscita.reset?.()}
      />
      {clienteOpen && clienteDati && <ClientePreventivoDialog cliente={clienteDati} onClose={()=>setClienteOpen(false)}/>}
      <AlertDialog open={eliminaOpen} onOpenChange={setEliminaOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminare il documento?</AlertDialogTitle><AlertDialogDescription>Tutti i blocchi e le righe verranno eliminati. Irreversibile.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={()=>delPrev.mutate()}>Elimina</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <AggiungiBloccoDialog
        open={addBloccoOpen}
        onOpenChange={setAddBloccoOpen}
        preventivoId={id}
        fascia={(prev.fascia_listino ?? "A") as FasciaListino}
        clienteId={prev.cliente_id ?? null}
        scontoPiede={Number(prev.sconto_piede_perc ?? 0)}
        lastOrdine={lastOrdine}
      />

      <AggiornaListiniDialog analisi={analisiListini} onClose={() => setAnalisiListini(null)}
        onApplica={(sc) => applicaListini.mutate(sc)} inCorso={applicaListini.isPending} />
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
  blocco, index, preventivoId, fascia, readOnly = false, prezziSpecialiMap, clienteId, scontoPiede,
}: { blocco: BloccoConRighe; index: number; preventivoId: string; fascia: FasciaListino; readOnly?: boolean; prezziSpecialiMap?: PrezziSpecialiMap | null; clienteId: string | null; scontoPiede: number }) {
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

  const upd = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: (patch: Parameters<typeof updateBlocco>[1]) => updateBlocco(blocco.id, patch),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const recalcQta = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: (v: number | null) =>
      ricalcolaBloccoSuNuovaQuantita(blocco.id, v, blocco.righe),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const del = useMutation({ mutationKey: ["salva-preventivo", preventivoId],
    mutationFn: () => deleteBlocco(blocco.id),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <div ref={sortable.setNodeRef} style={style}>
      <Card>
        <CardContent className="space-y-3 p-0">
          {/* Header blocco */}
          <div className="flex flex-wrap items-start gap-3 rounded-t-lg border-b-2 border-pv-blu bg-pv-azzurro p-3">
            <button {...sortable.attributes} {...sortable.listeners} className="cursor-grab pt-2" title="Trascina">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="mt-1.5 shrink-0 whitespace-nowrap rounded bg-pv-blu px-2 py-1 text-xs font-semibold text-primary-foreground">Blocco {index + 1}</div>
            <div className="grid w-24 gap-1">
              <Label className="text-[10px] uppercase">Rif.</Label>
              <Input
                defaultValue={blocco.rif_capitolato ?? ""}
                onBlur={(e) => { if ((e.target.value || null) !== blocco.rif_capitolato) upd.mutate({ rif_capitolato: e.target.value || null }); }}
                className="h-8 font-mono font-semibold"
                placeholder="—"
                title="Riferimento capitolato (facoltativo)"
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
                defaultValue={formatNumeroIt(blocco.quantita_base ?? 0, { minDecimals: 2, maxDecimals: 2 })}
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
                € {formatNumeroIt(prezzoUm, { minDecimals: 2, maxDecimals: 2 })}
              </div>
            </div>
            <div className="grid w-32 gap-1 text-right">
              <Label className="text-[10px] uppercase">Importo</Label>
              <div className="h-8 whitespace-nowrap rounded bg-primary px-2 py-1 text-right font-mono text-sm font-semibold text-primary-foreground">
                € {formatNumeroIt(totaleBlocco, { minDecimals: 2, maxDecimals: 2 })}
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

          <RigheTable blocco={blocco} preventivoId={preventivoId} fascia={fascia} readOnly={readOnly} prezziSpecialiMap={prezziSpecialiMap} clienteId={clienteId} scontoPiede={scontoPiede} />
        </CardContent>
      </Card>
    </div>
  );
}
const BADGE_SALVATAGGIO: Record<StatoSalvataggio, { testo: string; cls: string; pallino: string }> = {
  modifiche: { testo: "Modifiche non salvate", cls: "bg-pv-arancio-tenue text-pv-arancio border-pv-arancio/30", pallino: "bg-pv-arancio" },
  salvataggio: { testo: "Salvataggio…", cls: "bg-muted text-muted-foreground border-border", pallino: "bg-muted-foreground" },
  errore: { testo: "Errore nel salvataggio", cls: "bg-destructive/10 text-destructive border-destructive/30", pallino: "bg-destructive" },
  salvato: { testo: "Salvato", cls: "bg-pv-verde-tenue text-pv-verde border-pv-verde/30", pallino: "bg-pv-verde" },
};

function BadgeSalvataggio({ stato }: { stato: StatoSalvataggio }) {
  const b = BADGE_SALVATAGGIO[stato];
  return (
    <span role="status" aria-label={b.testo} title={b.testo}
      className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium sm:h-7", b.cls)}>
      {stato === "salvataggio"
        ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
        : <span className={cn("size-2.5 rounded-full", b.pallino)} aria-hidden />}
      <span className="hidden whitespace-nowrap sm:inline">{b.testo}</span>
    </span>
  );
}
