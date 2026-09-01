import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { geocodificaCantiere } from "@/lib/cantieri.functions";
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
import {
  createPreventivo, fetchAgenti, fetchCliente, anteprimaProssimoNumero,
  creaCantiereLite,
  TIPI_DOC, TIPI_DOC_LABEL,
  type TipoDoc, type TipoDocumento,
} from "@/lib/preventivi-api";
import { FASCE, type FasciaListino } from "@/lib/articoli-api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export function NuovoPreventivoDialog({
  open, onOpenChange, tipo = "preventivo",
}: { open: boolean; onOpenChange: (v: boolean) => void; tipo?: TipoDocumento }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const geocodifica = useServerFn(geocodificaCantiere);
  const today = new Date().toISOString().slice(0, 10);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [cantiereId, setCantiereId] = useState<string | null>(null);
  const [modoCantiere, setModoCantiere] = useState<"seleziona" | "crea" | "provvisorio">("seleziona");
  const [cantiereDescrizione, setCantiereDescrizione] = useState("");
  const [nuovoCantNome, setNuovoCantNome] = useState("");
  const [nuovoCantIndirizzo, setNuovoCantIndirizzo] = useState("");
  const [nuovoCantCitta, setNuovoCantCitta] = useState("");
  const [nuovoCantProvincia, setNuovoCantProvincia] = useState("");
  const [agenteId, setAgenteId] = useState<string | null>(null);
  const [filiale, setFiliale] = useState("");
  const [fascia, setFascia] = useState<FasciaListino>("A");
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>("PREVENTIVO");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(today);
  const [validita, setValidita] = useState("");

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

  // Quando cambia il cliente: precompila fascia e agente
  useEffect(() => {
    if (!clienteId) return;
    fetchCliente(clienteId).then((c) => {
      if (!c) return;
      if (c.fascia_listino_default) setFascia(c.fascia_listino_default);
      if (c.codice_agente) setAgenteId(c.codice_agente);
      setCantiereId(null);
      setCantiereDescrizione("");
      setNuovoCantNome("");
      setNuovoCantIndirizzo("");
      setNuovoCantCitta("");
      setNuovoCantProvincia("");
      setModoCantiere("seleziona");
    });
  }, [clienteId]);

  const creaCantiere = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Seleziona un cliente");
      const nuovo = await creaCantiereLite(
        clienteId,
        nuovoCantNome,
        nuovoCantIndirizzo || null,
        nuovoCantCitta || null,
        nuovoCantProvincia || null,
      );
      let esitoGeo: { stato: string; messaggio?: string | null } | null = null;
      try { esitoGeo = await geocodifica({ data: { cantiere_id: nuovo.id } }); } catch { esitoGeo = null; }
      return { nuovo, esitoGeo };
    },
    onSuccess: ({ nuovo, esitoGeo }) => {
      qc.invalidateQueries({ queryKey: ["cantieri-lite", clienteId] });
      setCantiereId(nuovo.id);
      setModoCantiere("seleziona");
      setNuovoCantNome("");
      setNuovoCantIndirizzo("");
      setNuovoCantCitta("");
      setNuovoCantProvincia("");
      if (esitoGeo?.stato === "ok") {
        toast.success("Cantiere creato e geolocalizzato. Sede più vicina calcolata.");
      } else if (esitoGeo) {
        toast.warning(`Cantiere creato ma NON geolocalizzato: ${esitoGeo.messaggio ?? "indirizzo non trovato"}. Aprilo in Cantieri per posizionarlo a mano.`);
      } else {
        toast.warning("Cantiere creato. Geolocalizzazione non riuscita: verifica l'indirizzo nella scheda Cantieri.");
      }
    },
    onError: (e: unknown) => {
      toast.error((e as Error).message || "Errore creazione cantiere");
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const numeroFinal = numero.trim(); // se vuoto, createPreventivo assegnerà
      const dataFinal = data || today;
      const fasciaFinal: FasciaListino = fascia || "A";
      const tipoDocFinal: TipoDoc = tipoDoc || "PREVENTIVO";
      return createPreventivo({
        cliente_id: clienteId,
        cantiere_id: modoCantiere === "provvisorio" ? null : cantiereId,
        cantiere_descrizione:
          modoCantiere === "provvisorio" ? cantiereDescrizione.trim() || null : null,
        agente_codice: agenteId,
        filiale: filiale || null,
        fascia_listino: fasciaFinal,
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
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nuovo {labelDoc}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
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
                    if (m !== "crea") {
                      setNuovoCantNome("");
                      setNuovoCantIndirizzo("");
                      setNuovoCantCitta("");
                      setNuovoCantProvincia("");
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
                placeholder="Descrivi il cantiere (indirizzo da definire)…"
              />
            ) : modoCantiere === "crea" ? (
              <div className="grid gap-2 rounded-md border p-3">
                {!clienteId ? (
                  <p className="text-sm text-muted-foreground">Prima seleziona un cliente.</p>
                ) : (
                  <>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Nome cantiere *</Label>
                      <Input
                        value={nuovoCantNome}
                        onChange={(e) => setNuovoCantNome(e.target.value)}
                        placeholder="es. Cantiere zona Milano nord"
                        disabled={creaCantiere.isPending}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Indirizzo *</Label>
                      <Input
                        value={nuovoCantIndirizzo}
                        onChange={(e) => setNuovoCantIndirizzo(e.target.value)}
                        placeholder="es. Via Roma 1"
                        disabled={creaCantiere.isPending}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Città</Label>
                        <Input
                          value={nuovoCantCitta}
                          onChange={(e) => setNuovoCantCitta(e.target.value)}
                          placeholder="Città"
                          disabled={creaCantiere.isPending}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Provincia</Label>
                        <Input
                          value={nuovoCantProvincia}
                          onChange={(e) => setNuovoCantProvincia(e.target.value)}
                          placeholder="PR"
                          disabled={creaCantiere.isPending}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={creaCantiere.isPending || !clienteId}
                      onClick={() => {
                        if (!nuovoCantNome.trim() || !nuovoCantIndirizzo.trim()) {
                          toast.error("Nome e indirizzo sono obbligatori");
                          return;
                        }
                        creaCantiere.mutate();
                      }}
                    >
                      {creaCantiere.isPending ? "Creazione…" : "Crea e seleziona cantiere"}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <CantierePicker cliente_id={clienteId} value={cantiereId} onChange={setCantiereId} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Fascia listino</Label>
              <Select value={fascia} onValueChange={(v) => setFascia(v as FasciaListino)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FASCE.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Numero</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="es. 2026/0001" />
            </div>
            <div className="grid gap-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Validità</Label>
              <Input type="date" value={validita} onChange={(e) => setValidita(e.target.value)} />
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
