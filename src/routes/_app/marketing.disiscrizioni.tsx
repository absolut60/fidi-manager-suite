import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserX, Search, Info, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { puoAccedereMarketing } from "@/lib/ruoli-marketing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/marketing/disiscrizioni")({
  component: DisiscrizioniPage,
});

const PAGE_SIZE = 100;

type DisiscrizioneRow = {
  id: string;
  email: string;
  cliente_id: string | null;
  ragione_sociale: string | null;
  codice_gestionale: string | null;
  origine: string;
  campagna_id: string | null;
  campagna_nome: string | null;
  operatore_id: string | null;
  operatore_nome: string | null;
  note: string | null;
  created_at: string;
  totale: number;
};

const ORIGINE_LABEL: Record<string, string> = {
  link_email: "Ha cliccato il link",
  manuale: "Registrata a mano",
  risposta_email: "Ha risposto all'email",
  import: "Importata",
};

function fmtDateTime(v: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return v;
  }
}

function DisiscrizioniPage() {
  const { roles, loading: authLoading } = useAuth();
  const canSee = useMemo(() => puoAccedereMarketing(roles as string[]), [roles]);
  const qc = useQueryClient();

  const [ricercaInput, setRicercaInput] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [openNuovo, setOpenNuovo] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRicerca(ricercaInput), 300);
    return () => clearTimeout(t);
  }, [ricercaInput]);

  useEffect(() => {
    setPagina(1);
  }, [ricerca]);

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-disiscrizioni", ricerca, pagina],
    enabled: canSee,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("get_disiscrizioni", {
        _search: ricerca.trim() ? ricerca.trim() : undefined,
        _limit: PAGE_SIZE,
        _offset: (pagina - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      const righe = (rows ?? []) as unknown as DisiscrizioneRow[];
      return { righe, totale: righe.length ? Number(righe[0].totale) : 0 };
    },
  });

  const righe = data?.righe ?? [];
  const totale = data?.totale ?? 0;
  const totalePagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));
  const daRiga = totale === 0 ? 0 : (pagina - 1) * PAGE_SIZE + 1;
  const aRiga = Math.min(pagina * PAGE_SIZE, totale);

  async function registraManuale() {
    if (!email.trim()) {
      toast.error("Inserisci un indirizzo email");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("registra_opt_out_manuale", {
        _email: email.trim(),
        _note: note.trim() ? note.trim() : undefined,
      });
      if (error) throw new Error(error.message);
      toast.success("Disiscrizione registrata");
      setOpenNuovo(false);
      setEmail("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["marketing-disiscrizioni"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) return <div className="p-6 text-muted-foreground">Caricamento...</div>;
  if (!canSee)
    return (
      <Card className="p-8 text-center">
        <p className="font-medium">Accesso riservato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Questa sezione è riservata ai ruoli Marketing, Amministrazione, Direzione e Amministratore.
        </p>
      </Card>
    );

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <UserX className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Disiscrizioni marketing</h1>
          <p className="text-sm text-muted-foreground">
            Indirizzi che non devono più ricevere comunicazioni commerciali
          </p>
        </div>
      </header>

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Promemoria</AlertTitle>
        <AlertDescription>
          Ricordati di controllare le risposte alle email: se un cliente scrive chiedendo di non
          ricevere più comunicazioni, registralo qui con «Registra disiscrizione manuale». Il
          sistema non legge automaticamente la casella di posta.
        </AlertDescription>
      </Alert>

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-2xl font-bold">{totale}</span>{" "}
          <span className="text-muted-foreground">
            {totale === 1 ? "indirizzo disiscritto" : "indirizzi disiscritti"}
          </span>
        </div>
        <Button onClick={() => setOpenNuovo(true)}>
          <Plus className="size-4 mr-2" />
          Registra disiscrizione manuale
        </Button>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={ricercaInput}
          onChange={(e) => setRicercaInput(e.target.value)}
          placeholder="Cerca per email o ragione sociale..."
          className="pl-9"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead>Campagna</TableHead>
              <TableHead>Registrata da</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                </TableRow>
              ))
            ) : righe.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nessuna disiscrizione registrata.
                </TableCell>
              </TableRow>
            ) : (
              righe.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.email}</TableCell>
                  <TableCell>
                    {r.ragione_sociale ? (
                      <div>
                        <div>{r.ragione_sociale}</div>
                        {r.codice_gestionale && (
                          <div className="text-xs text-muted-foreground">{r.codice_gestionale}</div>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{ORIGINE_LABEL[r.origine] ?? r.origine}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.campagna_nome || "—"}</TableCell>
                  <TableCell>{r.operatore_nome || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDateTime(r.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {totale > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Mostrati {daRiga}–{aRiga} di {totale}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pagina === 1} onClick={() => setPagina(1)}>Prima</Button>
            <Button variant="outline" size="sm" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>Precedente</Button>
            <span className="text-sm">Pagina {pagina} di {totalePagine}</span>
            <Button variant="outline" size="sm" disabled={pagina >= totalePagine} onClick={() => setPagina((p) => p + 1)}>Successiva</Button>
            <Button variant="outline" size="sm" disabled={pagina >= totalePagine} onClick={() => setPagina(totalePagine)}>Ultima</Button>
          </div>
        </div>
      )}

      <Dialog open={openNuovo} onOpenChange={setOpenNuovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registra disiscrizione manuale</DialogTitle>
            <DialogDescription>
              L'indirizzo verrà escluso da tutte le future comunicazioni commerciali.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="opt-email">Email *</Label>
              <Input
                id="opt-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@azienda.it"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-note">Note (opzionale)</Label>
              <Textarea
                id="opt-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Es. richiesta via email del 12/03"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNuovo(false)} disabled={busy}>Annulla</Button>
            <Button onClick={registraManuale} disabled={busy}>Conferma</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
