import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CalendarDays, Check, MapPin, Plus, Save, Trash2, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { puoAccedereLead } from "@/lib/lead-costanti";
import {
  EVENTI_PARTECIPANTE_STATI, EVENTI_PARTECIPANTE_STATO_CLASS,
  EVENTI_PARTECIPANTE_STATO_LABEL, formatDataEvento, nomePartecipante,
  type EventiPartecipanteStato,
} from "@/lib/eventi-costanti";

export const Route = createFileRoute("/_app/eventi/$eventoId")({
  component: EventoDettaglioPage,
  head: () => ({
    meta: [
      { title: "Dettaglio evento — CRM MADE" },
      { name: "description", content: "Scheda evento con elenco e censimento dei partecipanti." },
      { property: "og:title", content: "Dettaglio evento — CRM MADE" },
      { property: "og:description", content: "Scheda evento con elenco e censimento dei partecipanti." },
    ],
  }),
});

type PartecipanteRow = {
  id: string;
  stato: EventiPartecipanteStato;
  lead_id: string | null;
  cliente_id: string | null;
  contatto_id: string | null;
  nome: string | null;
  cognome: string | null;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  email: string | null;
  telefono: string | null;
  note: string | null;
  lead: { id: string; ragione_sociale: string | null; nome: string | null; cognome: string | null } | null;
  cliente: { id: string; ragione_sociale: string | null } | null;
  contatto: { id: string; nome: string | null; cognome: string | null } | null;
};

const CAMPI_VUOTI = {
  ragione_sociale: "", nome: "", cognome: "", partita_iva: "",
  codice_fiscale: "", email: "", telefono: "", note: "",
};

function EventoDettaglioPage() {
  const { eventoId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles, loading: authLoading } = useAuth();
  const canSee = useMemo(() => puoAccedereLead(roles as string[]), [roles]);

  const [nome, setNome] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [luogo, setLuogo] = useState("");
  const [note, setNote] = useState("");

  const [openNuovo, setOpenNuovo] = useState(false);
  const [campi, setCampi] = useState({ ...CAMPI_VUOTI });
  const [statoNuovo, setStatoNuovo] = useState<EventiPartecipanteStato>("atteso");

  const { data: evento, isLoading } = useQuery({
    queryKey: ["evento", eventoId],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventi")
        .select("id, nome, data_evento, luogo, note")
        .eq("id", eventoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!evento) return;
    setNome(evento.nome ?? "");
    setDataEvento(evento.data_evento ?? "");
    setLuogo(evento.luogo ?? "");
    setNote(evento.note ?? "");
  }, [evento]);

  const { data: partecipanti, isLoading: loadingPart } = useQuery({
    queryKey: ["evento-partecipanti", eventoId],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventi_partecipanti")
        .select(
          "id, stato, lead_id, cliente_id, contatto_id, nome, cognome, ragione_sociale, partita_iva, codice_fiscale, email, telefono, note, lead:lead_id(id, ragione_sociale, nome, cognome), cliente:cliente_id(id, ragione_sociale), contatto:contatto_id(id, nome, cognome)",
        )
        .eq("evento_id", eventoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PartecipanteRow[];
    },
  });

  const salvaEvento = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("eventi")
        .update({
          nome: nome.trim(),
          data_evento: dataEvento || null,
          luogo: luogo.trim() || null,
          note: note.trim() || null,
        })
        .eq("id", eventoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Evento aggiornato");
    },
    onError: (e: Error) => toast.error("Errore nel salvataggio", { description: e.message }),
  });

  const eliminaEvento = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("eventi").delete().eq("id", eventoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Evento eliminato");
      navigate({ to: "/eventi" });
    },
    onError: (e: Error) => toast.error("Errore nell'eliminazione", { description: e.message }),
  });

  const aggiungiPartecipante = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("eventi_partecipanti").insert({
        evento_id: eventoId,
        stato: statoNuovo,
        ragione_sociale: campi.ragione_sociale.trim() || null,
        nome: campi.nome.trim() || null,
        cognome: campi.cognome.trim() || null,
        partita_iva: campi.partita_iva.trim() || null,
        codice_fiscale: campi.codice_fiscale.trim() || null,
        email: campi.email.trim() || null,
        telefono: campi.telefono.trim() || null,
        note: campi.note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      setOpenNuovo(false);
      setCampi({ ...CAMPI_VUOTI });
      setStatoNuovo("atteso");
      toast.success("Partecipante aggiunto");
    },
    onError: (e: Error) => toast.error("Errore nell'inserimento", { description: e.message }),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: EventiPartecipanteStato }) => {
      const { error } = await supabase.from("eventi_partecipanti").update({ stato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
    },
    onError: (e: Error) => toast.error("Errore nel cambio stato", { description: e.message }),
  });

  const eliminaPartecipante = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("eventi_partecipanti").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento-partecipanti", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      toast.success("Partecipante eliminato");
    },
    onError: (e: Error) => toast.error("Errore nell'eliminazione", { description: e.message }),
  });



  if (authLoading || isLoading) return <Skeleton className="h-40 w-full" />;

  if (!canSee) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione e Amministratore.
        </p>
      </Card>
    );
  }

  if (!evento) {
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Evento non trovato</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate({ to: "/eventi" })}>
          Torna agli eventi
        </Button>
      </Card>
    );
  }

  const totale = partecipanti?.length ?? 0;
  const presentati = partecipanti?.filter((p) => p.stato === "presentato").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate({ to: "/eventi" })}>
          <ArrowLeft className="size-4" /> Eventi
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-1.5">
              <Trash2 className="size-4" /> Elimina evento
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare l'evento?</AlertDialogTitle>
              <AlertDialogDescription>
                Verranno eliminati anche tutti i partecipanti censiti. L'operazione non è reversibile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={() => eliminaEvento.mutate()}>Elimina</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="p-4 sm:p-5 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{evento.nome}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" />{formatDataEvento(evento.data_evento)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />{evento.luogo || "—"}
            </span>
            <span>{totale} partecipanti · {presentati} presentati</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ed-nome">Nome</Label>
            <Input id="ed-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-data">Data</Label>
            <Input id="ed-data" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-luogo">Luogo</Label>
            <Input id="ed-luogo" value={luogo} onChange={(e) => setLuogo(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-note">Note</Label>
          <Textarea id="ed-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button
            className="gap-1.5"
            disabled={!nome.trim() || salvaEvento.isPending}
            onClick={() => salvaEvento.mutate()}
          >
            <Save className="size-4" /> Salva modifiche
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Partecipanti</h2>
            <p className="text-sm text-muted-foreground">
              Prima dell'evento la lista degli attesi, durante e dopo il censimento di chi si presenta.
            </p>
          </div>
          <AggiungiPartecipanteDialog eventoId={eventoId} nomeEvento={evento.nome} />

        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identità</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Contatti</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingPart && (
              <TableRow><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            )}
            {!loadingPart && totale === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  Nessun partecipante censito.
                </TableCell>
              </TableRow>
            )}
            {partecipanti?.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">
                    {p.lead ? (
                      <Link
                        to="/lead/$leadId"
                        params={{ leadId: p.lead.id }}
                        className="text-primary hover:underline"
                      >
                        {nomePartecipante(p.lead)}
                      </Link>
                    ) : p.cliente ? (
                      <Link
                        to="/clienti/$clienteId"
                        params={{ clienteId: p.cliente.id }}
                        className="text-primary hover:underline"
                      >
                        {p.cliente.ragione_sociale ?? "Cliente"}
                      </Link>
                    ) : p.contatto ? (
                      <span>{`${p.contatto.nome ?? ""} ${p.contatto.cognome ?? ""}`.trim() || "Contatto"}</span>
                    ) : (
                      nomePartecipante(p)
                    )}
                  </div>
                  {(p.partita_iva || p.codice_fiscale) && (
                    <div className="text-xs text-muted-foreground">
                      {[p.partita_iva, p.codice_fiscale].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={`${EVENTI_PARTECIPANTE_STATO_CLASS[p.stato]} hover:opacity-100`} variant="secondary">
                    {EVENTI_PARTECIPANTE_STATO_LABEL[p.stato]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{p.email || "—"}</div>
                  <div className="text-muted-foreground">{p.telefono || "—"}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {(p.stato === "atteso" || p.stato === "confermato") && (
                      <>
                        <Button
                          size="sm" variant="outline" className="gap-1.5"
                          disabled={cambiaStato.isPending}
                          onClick={() => cambiaStato.mutate({ id: p.id, stato: "presentato" })}
                        >
                          <Check className="size-4" /> Presente
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="gap-1.5"
                          disabled={cambiaStato.isPending}
                          onClick={() => cambiaStato.mutate({ id: p.id, stato: "no_show" })}
                        >
                          <UserX className="size-4" /> No show
                        </Button>
                      </>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare il partecipante?</AlertDialogTitle>
                          <AlertDialogDescription>L'operazione non è reversibile.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => eliminaPartecipante.mutate(p.id)}>
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
