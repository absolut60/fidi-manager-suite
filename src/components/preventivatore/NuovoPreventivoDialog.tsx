import { CondizioniClienteGamma } from "@/components/preventivatore/CondizioniClienteGamma";
import { useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";
import { descrizioneCantiereProvvisorio, riallineaValidita, validitaProposta } from "@/lib/preventivo-creazione";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "@tanstack/react-router";
import { ClientePicker } from "./ClientePicker";
import { CantierePicker } from "./CantierePicker";
import { NuovoCantiereForm } from "./NuovoCantiereForm";
import {
  createPreventivo, fetchAgenti, fetchDatiClientePreventivo, anteprimaProssimoNumero,
  TIPI_DOC, TIPI_DOC_LABEL,
  type TipoDoc, type TipoDocumento,
} from "@/lib/preventivi-api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export function NuovoPreventivoDialog({
  open, onOpenChange, tipo = "preventivo",
}: { open: boolean; onOpenChange: (v: boolean) => void; tipo?: TipoDocumento }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [cantiereId, setCantiereId] = useState<string | null>(null);
  const [modoCantiere, setModoCantiere] = useState<"seleziona" | "crea" | "provvisorio">("seleziona");
  const [cantiereDescrizione, setCantiereDescrizione] = useState("");
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [filiale, setFiliale] = useState("");
  const [titolo, setTitolo] = useState("");
  const [pagamento, setPagamento] = useState("");
  const { data: codiciPagamento = [] } = useCodiciPagamento();
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>("PREVENTIVO");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(today);
  const [validita, setValidita] = useState(() => validitaProposta(today));
  const validitaManuale = useRef(false);

  const { profilo, roles } = useAuth();
  const isWriteOnly = roles.includes("preventivi_write") && !roles.includes("amministratore") && !roles.includes("preventivi_manage");
  const profiloCodiceAgente = profilo ? (profilo as unknown as Record<string, unknown>).codice_agente as string | null | undefined : undefined;
  const writeOnlyMissingCodice = isWriteOnly && !profiloCodiceAgente;

  const { data: agenti = [] } = useQuery({ queryKey: ["agenti"], queryFn: fetchAgenti });

  const { data: stores = [] } = useQuery({
    queryKey: ["stores-attivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, codice, nome")
        .eq("attivo", true)
        .order("codice");
      if (error) throw error;
      return data ?? [];
    },
  });

  const isOrdine = tipo === "ordine";
  const labelDoc = isOrdine ? "ordine" : "preventivo";
  const labelDocCap = isOrdine ? "Ordine" : "Preventivo";

  // All'apertura del dialog: proponi il prossimo numero progressivo (anteprima
  // di sola lettura, senza consumare il contatore).
  useEffect(() => {
    if (!open) return;
    anteprimaProssimoNumero(undefined, tipo)
      .then((n) => setNumero(n))
      .catch((e) => console.warn("[NuovoPreventivoDialog] anteprima numero:", e));
    // Agente write-only: forza il proprio codice agente all'apertura.
    if (isWriteOnly && profiloCodiceAgente) {
      setAgenteId(profiloCodiceAgente);
    }
  }, [open, tipo, isWriteOnly, profiloCodiceAgente]);

  // Quando cambia il cliente: precompila pagamento e agente, senza risposte obsolete.
  // Il reset del cantiere riparte solo se cambia davvero il cliente (ref),
  // non al variare di isWriteOnly/profiloCodiceAgente.
  const ultimoClienteRef = useRef<string | null>(null);
  useEffect(() => {
    let attivo = true;
    if (!clienteId) { setPagamento(""); return; }
    const clienteCambiato = ultimoClienteRef.current !== clienteId;
    ultimoClienteRef.current = clienteId;
    fetchDatiClientePreventivo(clienteId).then((c) => {
      if (!attivo || !c) return;
      if (clienteCambiato) setPagamento(c.condizione_pagamento_cod ?? "");
      // Write-only: l'agente resta quello del profilo (policy INSERT), non quello del cliente.
      if (!isWriteOnly && c.codice_agente) setAgenteId(c.codice_agente);
      if (!clienteCambiato) return;
      setCantiereId(null);
      setCantiereDescrizione("");
      setModoCantiere("seleziona");
    }).catch((e: unknown) => { if (attivo) toast.error((e as Error).message || "Errore lettura cliente"); });
    return () => { attivo = false; };
  }, [clienteId, isWriteOnly, profiloCodiceAgente]);

  const create = useMutation({
    mutationFn: async () => {
      const numeroFinal = numero.trim(); // se vuoto, createPreventivo assegnerà
      const dataFinal = data || today;
      const tipoDocFinal: TipoDoc = tipoDoc || "PREVENTIVO";
      return createPreventivo({
        cliente_id: clienteId,
        cantiere_id: modoCantiere === "provvisorio" ? null : cantiereId,
        cantiere_descrizione:
          modoCantiere === "provvisorio" ? descrizioneCantiereProvvisorio(cantiereDescrizione) : null,
        agente_codice: agenteId,
        filiale: filiale || null,
        titolo: titolo.trim() || null,
        condizione_pagamento_cod: pagamento || null,
        tipo_doc: tipoDocFinal,
        tipo,
        numero: numeroFinal,
        data: dataFinal,
        validita: validita || null,
      });
    },
    onSuccess: ({ preventivo, numeroRiassegnato }) => {
      qc.invalidateQueries({ queryKey: ["preventivi"] });
      if (numeroRiassegnato) {
        toast.warning(`Numero già impegnato — assegnato il successivo: ${numeroRiassegnato}`);
      } else {
        toast.success(`${labelDocCap} creato`);
      }
      onOpenChange(false);
      navigate({ to: "/preventivatore/$id", params: { id: preventivo.id } });
    },
    onError: (e: unknown) => {
      console.error("[NuovoPreventivoDialog] create error:", e);
      toast.error((e as Error).message || `Errore creazione ${labelDoc}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuovo {labelDoc}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5 min-w-0">
            <Label htmlFor="nuovo-preventivo-titolo">Titolo <span className="text-muted-foreground font-normal">(facoltativo, consigliato)</span></Label>
            <Input id="nuovo-preventivo-titolo" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Titolo del preventivo" />
          </div>
          <div className="grid gap-1.5">
            <Label>Cliente *</Label>
            <ClientePicker value={clienteId} onChange={setClienteId} />
          </div>
          <div className="grid gap-1.5">
            <Label>Cantiere</Label>
            <div className="flex gap-1">
              {([
                ["seleziona", "Seleziona"],
                ["crea", "Crea nuovo"],
                ["provvisorio", "Provvisorio"],
              ] as const).map(([m, l]) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={modoCantiere === m ? "default" : "outline"}
                  onClick={() => {
                    setModoCantiere(m);
                    if (m === "provvisorio") {
                      setCantiereId(null);
                    } else {
                      setCantiereDescrizione("");
                    }
                  }}
                >
                  {l}
                </Button>
              ))}
            </div>
            {modoCantiere === "provvisorio" ? (
              <Input
                value={cantiereDescrizione}
                onChange={(e) => setCantiereDescrizione(e.target.value)}
                placeholder="Da definire"
              />
            ) : modoCantiere === "crea" ? (
              <div className="grid gap-2 rounded-md border p-3">
                <NuovoCantiereForm clienteId={clienteId} onCreato={(c) => { setCantiereId(c.id); setModoCantiere("seleziona"); }} />
              </div>
            ) : (
              <CantierePicker cliente_id={clienteId} value={cantiereId} onChange={setCantiereId} />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Agente</Label>
              <Select
                value={agenteId ?? ""}
                onValueChange={(v) => setAgenteId(v || null)}
                disabled={isWriteOnly}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {agenti.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isWriteOnly && (
                <p className="text-xs text-muted-foreground">Come agente sei impostato tu.</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Filiale</Label>
              <Select
                value={filiale || "_none"}
                onValueChange={(v) => setFiliale(v === "_none" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Seleziona sede…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Nessuna —</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.nome}>
                      {s.codice} — {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <CondizioniClienteGamma clienteId={clienteId} />
          <div className="grid gap-1.5 min-w-0">
            <Label>Condizione di pagamento</Label>
            <Select value={pagamento || "__none__"} onValueChange={(v) => setPagamento(v === "__none__" ? "" : v)}>
              <SelectTrigger aria-label="Condizione di pagamento" className="h-auto min-h-10 w-full min-w-0 [&>span]:whitespace-normal [&>span]:text-left [&>span]:break-words"><SelectValue placeholder="Seleziona condizione di pagamento" /></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                <SelectItem value="__none__">— Nessuna —</SelectItem>
                {pagamento && !codiciPagamento.some((c) => c.cod === pagamento) && <SelectItem value={pagamento}>{pagamento}</SelectItem>}
                {codiciPagamento.map((c) => <SelectItem key={c.cod} value={c.cod} className="whitespace-normal break-words">{c.cod} – {c.descrizione}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!isOrdine && (
              <div className="grid gap-1.5">
                <Label>Tipo documento</Label>
                <Select value={tipoDoc} onValueChange={(v) => setTipoDoc(v as TipoDoc)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPI_DOC.map((t) => (
                      <SelectItem key={t} value={t}>{TIPI_DOC_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Numero</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="es. 2026/0001" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nuovo-preventivo-data">Data</Label>
              <Input id="nuovo-preventivo-data" type="date" value={data} onChange={(e) => { setData(e.target.value); setValidita((v) => riallineaValidita(e.target.value, v, validitaManuale.current)); }} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nuovo-preventivo-validita">Validità</Label>
              <Input id="nuovo-preventivo-validita" type="date" value={validita} onChange={(e) => { validitaManuale.current = true; setValidita(e.target.value); }} />
            </div>
          </div>
        </div>
        {writeOnlyMissingCodice && (
          <p className="text-sm text-destructive">
            Il tuo profilo non ha un codice agente: contatta l'amministratore.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => create.mutate()} disabled={!clienteId || create.isPending || writeOnlyMissingCodice}>
            Crea {labelDoc}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
