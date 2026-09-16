import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Save, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  cercaCandidatiRiconciliazione,
  creaLeadDaPartecipante,
  riconciliaPartecipante,
} from "@/lib/firma-privacy.functions";
import {
  EVENTI_PARTECIPANTE_STATI,
  EVENTI_PARTECIPANTE_STATO_LABEL,
  type EventiPartecipanteStato,
} from "@/lib/eventi-costanti";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SoggettoCombobox, type SoggettoSelezionato } from "@/components/soggetto-combobox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type PartecipanteDettaglio = {
  id: string;
  nome: string | null;
  cognome: string | null;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  email: string | null;
  telefono: string | null;
  note: string | null;
  lead_id: string | null;
  cliente_id: string | null;
  contatto_id: string | null;
  registrato_sul_posto: boolean | null;
  lead_evento_grezzo?: boolean | null;
  stato: string;
};

function messaggioErrore(errore: unknown): string {
  switch (errore) {
    case "non_autorizzato":
      return "Non hai i permessi per riconciliare";
    case "non_trovato":
      return "Partecipante non trovato";
    case "gia_riconciliato":
      return "Partecipante già riconciliato";
    case "cliente_non_trovato":
      return "Cliente non trovato";
    case "lead_non_trovato":
      return "Lead non trovato";
    case "lead_non_valido":
      return "Lead non valido";
    case "match_non_univoco":
      return "Riconciliazione non riuscita";
    default:
      return "Riconciliazione non riuscita";
  }
}

export function DettaglioPartecipanteDialog({
  partecipante,
  eventoId,
  nomeEvento,
  open,
  onOpenChange,
}: {
  partecipante: PartecipanteDettaglio;
  eventoId: string;
  nomeEvento?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const riconciliaFn = useServerFn(riconciliaPartecipante);
  const creaLeadFn = useServerFn(creaLeadDaPartecipante);

  const [nome, setNome] = useState(partecipante.nome ?? "");
  const [cognome, setCognome] = useState(partecipante.cognome ?? "");
  const [ragioneSociale, setRagioneSociale] = useState(partecipante.ragione_sociale ?? "");
  const [partitaIva, setPartitaIva] = useState(partecipante.partita_iva ?? "");
  const [codiceFiscale, setCodiceFiscale] = useState(partecipante.codice_fiscale ?? "");
  const [email, setEmail] = useState(partecipante.email ?? "");
  const [telefono, setTelefono] = useState(partecipante.telefono ?? "");
  const [note, setNote] = useState(partecipante.note ?? "");
  const [soggetto, setSoggetto] = useState<SoggettoSelezionato | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [statoLoc, setStatoLoc] = useState(partecipante.stato);

  useEffect(() => {
    setNome(partecipante.nome ?? "");
    setCognome(partecipante.cognome ?? "");
    setRagioneSociale(partecipante.ragione_sociale ?? "");
    setPartitaIva(partecipante.partita_iva ?? "");
    setCodiceFiscale(partecipante.codice_fiscale ?? "");
    setEmail(partecipante.email ?? "");
    setTelefono(partecipante.telefono ?? "");
    setNote(partecipante.note ?? "");
    setSoggetto(null);
    setStatoLoc(partecipante.stato);
  }, [partecipante.id]);

  const modificato =
    nome !== (partecipante.nome ?? "") ||
    cognome !== (partecipante.cognome ?? "") ||
    ragioneSociale !== (partecipante.ragione_sociale ?? "") ||
    partitaIva !== (partecipante.partita_iva ?? "") ||
    codiceFiscale !== (partecipante.codice_fiscale ?? "") ||
    email !== (partecipante.email ?? "") ||
    telefono !== (partecipante.telefono ?? "") ||
    note !== (partecipante.note ?? "");

  const invalida = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] }),
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] }),
    ]);
  };

  const salva = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("eventi_partecipanti")
        .update({
          nome: nome.trim() || null,
          cognome: cognome.trim() || null,
          ragione_sociale: ragioneSociale.trim() || null,
          partita_iva: partitaIva.trim() || null,
          codice_fiscale: codiceFiscale.trim() || null,
          email: email.trim() || null,
          telefono: telefono.trim() || null,
          note: note.trim() || null,
        })
        .eq("id", partecipante.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Modifiche salvate");
      await queryClient.invalidateQueries({ queryKey: ["candidati-riconciliazione", partecipante.id] });
      await invalida();
    },
    onError: (e: Error) => toast.error("Errore nel salvataggio", { description: e.message }),
  });

  const elimina = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("eventi_partecipanti")
        .delete()
        .eq("id", partecipante.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalida();
      onOpenChange(false);
      toast.success("Partecipante eliminato");
    },
    onError: (e: Error) => toast.error("Errore nell'eliminazione", { description: e.message }),
  });

  const seleziona = (s: SoggettoSelezionato) => {
    if (s.tipo !== "cliente") {
      toast.error("Seleziona un cliente");
      return;
    }
    setSoggetto(s);
  };

  const onRiconcilia = async () => {
    if (!soggetto) return;
    setInCorso(true);
    try {
      const res = await riconciliaFn({
        data: { partecipanteId: partecipante.id, clienteId: soggetto.id },
      });
      if (res.ok === true) {
        toast.success("Partecipante riconciliato");
        await invalida();
        onOpenChange(false);
      } else {
        toast.error(messaggioErrore(res.errore));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Riconciliazione non riuscita");
    } finally {
      setInCorso(false);
    }
  };

  const onCreaLead = async () => {
    setInCorso(true);
    try {
      const res = await creaLeadFn({
        data: { partecipanteId: partecipante.id, fonteDettaglio: nomeEvento || undefined },
      });
      if (res.ok === true) {
        toast.success("Lead creato");
        await invalida();
        onOpenChange(false);
      } else {
        toast.error(messaggioErrore(res.errore));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Creazione lead non riuscita");
    } finally {
      setInCorso(false);
    }
  };

  const titolo =
    `${partecipante.nome ?? ""} ${partecipante.cognome ?? ""}`.trim() ||
    partecipante.ragione_sociale ||
    "Partecipante";

  const daRiconciliare =
    !partecipante.cliente_id &&
    (!partecipante.lead_id || partecipante.lead_evento_grezzo === true);

  const cercaCandidatiFn = useServerFn(cercaCandidatiRiconciliazione);
  const { data: candidati, isLoading: caricandoCandidati } = useQuery({
    queryKey: ["candidati-riconciliazione", partecipante.id],
    queryFn: () => cercaCandidatiFn({ data: { partecipanteId: partecipante.id } }),
    enabled: open && daRiconciliare,
  });

  const onCollegaCandidato = async (c: { tipo: "cliente" | "lead"; id: string }) => {
    setInCorso(true);
    try {
      const res = await riconciliaFn({
        data: {
          partecipanteId: partecipante.id,
          clienteId: c.tipo === "cliente" ? c.id : undefined,
          leadId: c.tipo === "lead" ? c.id : undefined,
        },
      });
      if (res.ok === true) {
        toast.success("Collegato");
        await invalida();
        onOpenChange(false);
      } else {
        toast.error(messaggioErrore(res.errore));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Riconciliazione non riuscita");
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
        </DialogHeader>

        {/* SEZIONE DATI */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-nome">Nome</Label>
              <Input id="dp-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-cognome">Cognome</Label>
              <Input id="dp-cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dp-ragione">Ragione sociale</Label>
              <Input id="dp-ragione" value={ragioneSociale} onChange={(e) => setRagioneSociale(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-piva">Partita IVA</Label>
              <Input id="dp-piva" value={partitaIva} onChange={(e) => setPartitaIva(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-cf">Codice fiscale</Label>
              <Input id="dp-cf" value={codiceFiscale} onChange={(e) => setCodiceFiscale(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-email">Email</Label>
              <Input id="dp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-tel">Telefono</Label>
              <Input id="dp-tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-note">Note</Label>
            <Textarea id="dp-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button
              className="gap-1.5"
              disabled={!modificato || salva.isPending}
              onClick={() => salva.mutate()}
            >
              <Save className="size-4" /> {salva.isPending ? "Salvataggio…" : "Salva modifiche"}
            </Button>
          </div>
        </div>

        {/* SEZIONE RICONCILIAZIONE */}
        {daRiconciliare ? (
          <div className="space-y-4 rounded-md border p-4">
            <p className="text-sm font-medium">Riconciliazione</p>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Possibili corrispondenze</p>
              {caricandoCandidati ? (
                <p className="text-sm text-muted-foreground">Cerco corrispondenze…</p>
              ) : candidati && candidati.length > 0 ? (
                <div className="space-y-2">
                  {candidati.map((c) => (
                    <div
                      key={`${c.tipo}-${c.id}`}
                      className="flex items-center gap-2 rounded-md border px-3 py-2"
                    >
                      <Badge variant={c.tipo === "cliente" ? "default" : "secondary"} className="shrink-0">
                        {c.tipo === "cliente" ? "Cliente" : "Lead"}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.etichetta}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.motivi.join(", ")}
                          {!c.forte && " (solo ragione sociale — verifica)"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={inCorso}
                        onClick={() => void onCollegaCandidato(c)}
                      >
                        Collega
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessuna corrispondenza trovata nelle anagrafiche.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Collega a cliente esistente</p>
              {soggetto ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Badge variant="default" className="shrink-0">Cliente</Badge>
                  <span className="min-w-0 truncate text-sm font-medium">{soggetto.etichetta}</span>
                  <Button
                    size="icon" variant="ghost" className="ml-auto size-7 shrink-0"
                    aria-label="Deseleziona cliente"
                    onClick={() => setSoggetto(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ) : (
                <SoggettoCombobox onSelect={seleziona} placeholder="Cerca cliente…" />
              )}
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={!soggetto || inCorso}
                onClick={() => void onRiconcilia()}
              >
                <Link2 className="size-4" /> {inCorso ? "Riconciliazione…" : "Riconcilia"}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">oppure</p>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Crea nuovo lead</p>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={inCorso}
                onClick={() => void onCreaLead()}
              >
                <UserPlus className="size-4" /> {inCorso ? "Creazione…" : "Crea lead da questi dati"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground rounded-md border px-3 py-2">
            {partecipante.cliente_id ? "Già collegato a un cliente" : "Già collegato a un lead"}
          </p>
        )}

        <DialogFooter className="sm:justify-between gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={elimina.isPending}>
                {elimina.isPending ? "Eliminazione…" : "Elimina partecipante"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminare il partecipante?</AlertDialogTitle>
                <AlertDialogDescription>
                  Il partecipante viene rimosso dall'evento. Se era un nuovo iscritto sul posto non ancora lavorato, viene eliminato anche il lead collegato con la sua privacy. Clienti e lead già gestiti restano invariati.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => elimina.mutate()}>Elimina</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
