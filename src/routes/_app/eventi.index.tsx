import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MapPin, Plus, Users } from "lucide-react";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { puoAccedereLead } from "@/lib/lead-costanti";
import { formatDataEvento } from "@/lib/eventi-costanti";

export const Route = createFileRoute("/_app/eventi/")({
  component: EventiListaPage,
  head: () => ({
    meta: [
      { title: "Eventi — CRM MADE" },
      { name: "description", content: "Gestione eventi, fiere e open day con censimento dei partecipanti." },
      { property: "og:title", content: "Eventi — CRM MADE" },
      { property: "og:description", content: "Gestione eventi, fiere e open day con censimento dei partecipanti." },
    ],
  }),
});

type EventoRow = {
  id: string;
  nome: string;
  data_evento: string | null;
  luogo: string | null;
  note: string | null;
  created_at: string;
  eventi_partecipanti: { stato: string }[];
};

function EventiListaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, roles, loading: authLoading } = useAuth();
  const canSee = useMemo(() => puoAccedereLead(roles as string[]), [roles]);

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [luogo, setLuogo] = useState("");
  const [note, setNote] = useState("");

  const { data: eventi, isLoading } = useQuery({
    queryKey: ["eventi-lista"],
    enabled: canSee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventi")
        .select("id, nome, data_evento, luogo, note, created_at, eventi_partecipanti(stato)")
        .order("data_evento", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoRow[];
    },
  });

  const crea = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("eventi")
        .insert({
          nome: nome.trim(),
          data_evento: dataEvento || null,
          luogo: luogo.trim() || null,
          note: note.trim() || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["eventi-lista"] });
      setOpen(false);
      setNome(""); setDataEvento(""); setLuogo(""); setNote("");
      toast.success("Evento creato", {
        action: { label: "Apri", onClick: () => navigate({ to: "/eventi/$eventoId", params: { eventoId: data.id } }) },
      });
    },
    onError: (e: Error) => toast.error("Errore nella creazione", { description: e.message }),
  });

  if (authLoading) return <Skeleton className="h-40 w-full" />;

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Eventi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fiere, open day e serate tecniche: prima la lista dei partecipanti attesi, durante e dopo
            l'evento il censimento reale di chi si è presentato.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5"><Plus className="size-4" /> Nuovo evento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuovo evento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-nome">Nome *</Label>
                <Input id="ev-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Open day primavera" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-data">Data</Label>
                  <Input id="ev-data" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-luogo">Luogo</Label>
                  <Input id="ev-luogo" value={luogo} onChange={(e) => setLuogo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-note">Note</Label>
                <Textarea id="ev-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button disabled={!nome.trim() || crea.isPending} onClick={() => crea.mutate()}>Crea evento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Luogo</TableHead>
              <TableHead className="text-right">Partecipanti</TableHead>
              <TableHead className="text-right">Presentati</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            )}
            {!isLoading && (eventi?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Nessun evento. Crea il primo con "Nuovo evento".
                </TableCell>
              </TableRow>
            )}
            {eventi?.map((ev) => {
              const totale = ev.eventi_partecipanti?.length ?? 0;
              const presentati = ev.eventi_partecipanti?.filter((p) => p.stato === "presentato").length ?? 0;
              return (
                <TableRow
                  key={ev.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/eventi/$eventoId", params: { eventoId: ev.id } })}
                >
                  <TableCell className="font-medium">{ev.nome}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4 text-muted-foreground" />
                      {formatDataEvento(ev.data_evento)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {ev.luogo ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-4 text-muted-foreground" />{ev.luogo}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="gap-1"><Users className="size-3" />{totale}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className="bg-success/15 text-success hover:bg-success/15">{presentati}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
