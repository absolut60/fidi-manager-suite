import type { CondizioniPrezziPreventivo } from "@/lib/prezzi-preventivo";
import { opzioniPrezziCantiere } from "@/lib/cantiere-listini-api";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchKitsWithComponenti, fetchKitFamiglie } from '@/lib/kit-api';
import { gruppiKitPreventivo, type RigaKitSaltata } from '@/lib/kit-preventivo';
import { addBloccoDaKit, addBloccoVuoto, fractionalOrder } from "@/lib/preventivi-api";
import type { FasciaListino } from "@/lib/articoli-api";
import { toast } from "sonner";
import { parseNumeroIt } from "@/lib/numero-it";
import { lineaPreventivo } from "@/lib/linee-preventivo";

export function AggiungiBloccoDialog({
  open, onOpenChange, preventivoId, lastOrdine, clienteId, scontoPiede = 0, cantiereId, condizioniPrezzi, linea,
}: {
  /** FM75 F1: linea del preventivo (comportamenti dal catalogo). */
  linea?: unknown;
  condizioniPrezzi: CondizioniPrezziPreventivo;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preventivoId: string;
  fascia?: FasciaListino;
  lastOrdine: number;
  clienteId: string | null;
  scontoPiede?: number;
  cantiereId?: string | null;
}) {
  const qc = useQueryClient();
  const configLinea = lineaPreventivo(linea);
  const daKit = configLinea.blocchi.bloccoDaKit;
  const [titolo, setTitolo] = useState("");
  const { data: dedicati = [] } = useQuery({ ...opzioniPrezziCantiere(cantiereId ?? ""), enabled: !!cantiereId });
  const [tab, setTab] = useState<"kit" | "vuoto">("kit");
  const [famiglia, setFamiglia] = useState<string>("ALL");
  const [kitId, setKitId] = useState<string | null>(null);
  const [quantita, setQuantita] = useState("1");
  const [righeSaltate, setRigheSaltate] = useState<RigaKitSaltata[]>([]);

  const { data: kits = [], isError: erroreKits } = useQuery({
    queryKey: ["kit-lista-v2"],
    queryFn: fetchKitsWithComponenti,
    enabled: open && daKit,
  });

  const { data: famiglie = [], isError: erroreFamiglie } = useQuery({ queryKey: ['kit-famiglie'], queryFn: fetchKitFamiglie, enabled: open && daKit });
  const gruppi = gruppiKitPreventivo(kits, famiglie, configLinea.codice, famiglia);
  const famiglieLinea = famiglie.filter(f => f.linea === configLinea.codice);

  const addKit = useMutation({
    mutationFn: async () => {
      if (!kitId || !gruppi.some(g => g.kits.some(k => k.id === kitId))) throw new Error("Scegli un kit della linea del preventivo");
      return addBloccoDaKit({
        preventivo_id: preventivoId,
        kit_id: kitId,
        prezzi_cantiere: cantiereId ? await qc.fetchQuery(opzioniPrezziCantiere(cantiereId)) : [],
        quantita_base: parseNumeroIt(quantita) ?? 0,
        cliente_id: clienteId,
        condizioni_prezzi: condizioniPrezzi,
        sconto_piede: scontoPiede,
        ordine: fractionalOrder(lastOrdine, null),
      });
    },
    onSuccess: (blocco) => {
      qc.invalidateQueries({ queryKey: ["preventivo", preventivoId] });
      onOpenChange(false);
      setKitId(null);
      toast.success("Blocco aggiunto");
      setRigheSaltate(blocco.righeSaltate);
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const addVuoto = useMutation({
    mutationFn: () => daKit
      ? addBloccoVuoto(preventivoId, fractionalOrder(lastOrdine, null))
      : addBloccoVuoto(preventivoId, fractionalOrder(lastOrdine, null), titolo.trim() || "Nuovo blocco"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["preventivo", preventivoId] });
      onOpenChange(false);
      setTitolo("");
      toast.success("Blocco vuoto aggiunto");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <><Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Aggiungi blocco</DialogTitle></DialogHeader>
        {!daKit ? (
          <div className="grid gap-1.5">
            <Label htmlFor="titolo-blocco">Titolo del blocco</Label>
            <Input id="titolo-blocco" value={titolo} placeholder="Nuovo blocco" onChange={(e) => setTitolo(e.target.value)} />
          </div>
        ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "kit" | "vuoto")}>
          <TabsList>
            <TabsTrigger value="kit">Da kit</TabsTrigger>
            <TabsTrigger value="vuoto">Blocco vuoto</TabsTrigger>
          </TabsList>
          <TabsContent value="kit" className="space-y-3">
            {condizioniPrezzi.listino_rif == null && !clienteId && !dedicati.length && <p role="alert" className="text-sm font-semibold text-destructive">Scegli prima il cliente: i prezzi del kit arrivano dalle sue condizioni Gamma.</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Famiglia</Label>
                <Select value={famiglia} onValueChange={v => { setFamiglia(v); setKitId(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tutte</SelectItem>
                    {famiglieLinea.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Quantità base</Label>
                <Input type="text" inputMode="decimal" value={quantita} onChange={(e) => setQuantita(e.target.value.replace(/[^0-9.,]/g, ""))} />
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded border">
              {erroreFamiglie || erroreKits ? <p role="alert" className="p-3 text-sm text-destructive">Caricamento dei kit e delle famiglie non riuscito.</p> : gruppi.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Nessun kit disponibile.</div>
              ) : (
                gruppi.map(g => <section key={g.id} className="min-w-0"><h3 className="border-b bg-muted px-3 py-2 text-xs font-semibold">{g.nome}</h3>{g.kits.map((k) => (
                    <Button variant="ghost"
                      key={k.id}
                      type="button"
                      onClick={() => setKitId(k.id)}
                      className={`flex h-auto min-h-11 w-full items-center justify-between gap-2 whitespace-normal rounded-none border-b px-3 py-2 text-left text-sm hover:bg-accent ${
                        kitId === k.id ? "bg-accent/50" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="break-all font-mono text-xs text-muted-foreground">{k.codice}</div>
                        <div className="break-words font-medium">{k.nome}</div>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">{k.componenti.length} componenti</div>
                    </Button>
                ))}</section>)
              )}
            </div>
          </TabsContent>
          <TabsContent value="vuoto">
            <p className="text-sm text-muted-foreground">
              Crea un blocco senza righe. Aggiungerai materiali manualmente.
            </p>
          </TabsContent>
        </Tabs>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          {daKit && tab === "kit" ? (
            <Button onClick={() => addKit.mutate()} disabled={!kitId || !gruppi.some(g => g.kits.some(k => k.id === kitId)) || erroreFamiglie || erroreKits || (condizioniPrezzi.listino_rif == null && !clienteId && !dedicati.length) || addKit.isPending}>
              Aggiungi kit
            </Button>
          ) : (
            <Button onClick={() => addVuoto.mutate()} disabled={addVuoto.isPending}>
              Crea blocco vuoto
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog><Dialog open={righeSaltate.length > 0} onOpenChange={v => { if (!v) setRigheSaltate([]); }}>
      <DialogContent className="max-h-[90dvh] min-w-0 max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Righe del kit non inserite</DialogTitle></DialogHeader>
        <ul className="space-y-3">{righeSaltate.map((r, i) => <li key={`${r.ordine}-${i}`} className="min-w-0 border-b pb-2 text-sm">
          <p className="break-words font-semibold">{r.ordine} · {r.descrizione}</p><p className="break-words text-muted-foreground">{r.motivo}</p>
        </li>)}</ul><DialogFooter><Button onClick={() => setRigheSaltate([])}>Ho capito</Button></DialogFooter>
      </DialogContent>
    </Dialog></>
  );
}
