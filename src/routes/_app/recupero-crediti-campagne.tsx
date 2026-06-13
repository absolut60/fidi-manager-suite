import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, RefreshCw, ChevronRight, ExternalLink, AlertCircle, CheckCircle2, Clock, XCircle, MailWarning, MoreHorizontal, Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  riprovaCampagnaFalliti,
  annullaCampagnaSollecito,
  eliminaCampagnaSollecito,
} from "@/lib/sollecito-massivo.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export const Route = createFileRoute("/_app/recupero-crediti-campagne")({
  component: CampagnePage,
});

type CampagnaRow = {
  id: string;
  operatore_id: string | null;
  template_id: string | null;
  stato: string;
  totale_destinatari: number;
  inviati: number;
  saltati: number;
  falliti: number;
  preferenza_indirizzo: string;
  note: string | null;
  created_at: string;
  completata_at: string | null;
  tipo_campagna: string | null;
  template: { nome: string | null } | null;
  operatore: { nome: string | null; cognome: string | null } | null;
};

function fmtDateTime(v: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("it-IT"); } catch { return v; }
}

function StatoBadge({ s }: { s: string }) {
  if (s === "in_corso") return <Badge className="bg-blue-500 text-white hover:bg-blue-500"><Clock className="size-3 mr-1" />In corso</Badge>;
  if (s === "in_coda") return <Badge className="bg-slate-500 text-white hover:bg-slate-500"><Clock className="size-3 mr-1" />In coda</Badge>;
  if (s === "completata") return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600"><CheckCircle2 className="size-3 mr-1" />Completata</Badge>;
  if (s === "completata_con_errori") return <Badge className="bg-amber-500 text-white hover:bg-amber-500"><AlertCircle className="size-3 mr-1" />Errori</Badge>;
  if (s === "annullata") return <Badge variant="outline">Annullata</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function CampagnePage() {
  const qc = useQueryClient();
  const annulla = useServerFn(annullaCampagnaSollecito);
  const elimina = useServerFn(eliminaCampagnaSollecito);
  const [openDettaglio, setOpenDettaglio] = useState<string | null>(null);
  const [confermaAnnulla, setConfermaAnnulla] = useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doAnnulla(id: string) {
    setBusy(true);
    try {
      await annulla({ data: { campagnaId: id } });
      toast.success("Campagna annullata. Il job si fermerà al prossimo blocco.");
      qc.invalidateQueries({ queryKey: ["campagne-sollecito"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
      setConfermaAnnulla(null);
    }
  }

  async function doElimina(id: string) {
    setBusy(true);
    try {
      await elimina({ data: { campagnaId: id } });
      toast.success("Campagna eliminata. I solleciti inviati restano in scheda cliente.");
      qc.invalidateQueries({ queryKey: ["campagne-sollecito"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
      setConfermaElimina(null);
    }
  }


  // Polling più frequente se c'è una campagna attiva
  const { data: campagne, isLoading } = useQuery({
    queryKey: ["campagne-sollecito"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_sollecito")
        .select(`
          id, operatore_id, template_id, stato, totale_destinatari, inviati, saltati, falliti,
          preferenza_indirizzo, note, created_at, completata_at, tipo_campagna,
          template:template_email(nome)
        `)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Omit<CampagnaRow, "operatore">[];

      // Operatori separatamente (no FK tra campagne_sollecito e profili)
      const opIds = Array.from(new Set(rows.map((r) => r.operatore_id).filter(Boolean) as string[]));
      const opMap: Record<string, { nome: string | null; cognome: string | null }> = {};
      if (opIds.length) {
        const { data: profs } = await supabase.from("profili").select("id, nome, cognome").in("id", opIds);
        (profs ?? []).forEach((p) => { opMap[p.id] = { nome: p.nome, cognome: p.cognome }; });
      }
      return rows.map((r) => ({
        ...r,
        operatore: r.operatore_id ? opMap[r.operatore_id] ?? null : null,
      })) as CampagnaRow[];
    },
    refetchInterval: (q) => {
      const rows = q.state.data as CampagnaRow[] | undefined;
      const attiva = rows?.some((r) => r.stato === "in_corso" || r.stato === "in_coda");
      return attiva ? 10_000 : false;
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Megaphone className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invii massivi solleciti</h1>
          <p className="text-sm text-muted-foreground">Campagne di sollecito email — stato e dettaglio destinatari</p>
        </div>
      </header>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Operatore</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Tot.</TableHead>
              <TableHead className="text-right">Inviati</TableHead>
              <TableHead className="text-right">Saltati</TableHead>
              <TableHead className="text-right">Falliti</TableHead>
              <TableHead className="min-w-[180px]">Avanzamento</TableHead>
              <TableHead className="w-[60px]"></TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : !campagne || campagne.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                Nessuna campagna ancora avviata.
              </TableCell></TableRow>
            ) : (
              campagne.map((c) => {
                const processati = c.inviati + c.saltati + c.falliti;
                const pct = c.totale_destinatari > 0 ? Math.round((processati / c.totale_destinatari) * 100) : 0;
                const isAttiva = c.stato === "in_coda" || c.stato === "in_corso";
                const isTerminale = c.stato === "completata" || c.stato === "completata_con_errori" || c.stato === "annullata";
                return (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell className="whitespace-nowrap cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{fmtDateTime(c.created_at)}</TableCell>
                    <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>
                      <div className="flex items-center gap-2">
                        <span>{c.template?.nome ?? "—"}</span>
                        {c.tipo_campagna === "promemoria_scadenza" && (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Promemoria</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}><StatoBadge s={c.stato} /></TableCell>
                    <TableCell className="text-right font-medium cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.totale_destinatari}</TableCell>
                    <TableCell className="text-right text-emerald-600 cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.inviati}</TableCell>
                    <TableCell className="text-right text-amber-600 cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.saltati}</TableCell>
                    <TableCell className="text-right text-destructive cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.falliti}</TableCell>
                    <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2" />
                        <span className="text-xs text-muted-foreground tabular-nums w-10">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isAttiva && (
                            <DropdownMenuItem onClick={() => setConfermaAnnulla(c.id)}>
                              <Ban className="size-4 mr-2" /> Annulla campagna
                            </DropdownMenuItem>
                          )}
                          {isTerminale && (
                            <DropdownMenuItem onClick={() => setConfermaElimina(c.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="size-4 mr-2" /> Elimina campagna
                            </DropdownMenuItem>
                          )}
                          {!isAttiva && !isTerminale && (
                            <DropdownMenuItem disabled>Nessuna azione disponibile</DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {openDettaglio && (
        <DettaglioCampagnaDialog
          campagnaId={openDettaglio}
          onClose={() => setOpenDettaglio(null)}
        />
      )}

      <AlertDialog open={!!confermaAnnulla} onOpenChange={(v) => !v && setConfermaAnnulla(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare la campagna?</AlertDialogTitle>
            <AlertDialogDescription>
              I destinatari ancora da inviare verranno marcati come annullati e il job si fermerà al prossimo blocco.
              I solleciti già inviati restano nella scheda del cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Indietro</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confermaAnnulla && doAnnulla(confermaAnnulla)}>
              Annulla campagna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confermaElimina} onOpenChange={(v) => !v && setConfermaElimina(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
            <AlertDialogDescription>
              La campagna verrà rimossa insieme alla lista destinatari. <strong>I solleciti già inviati resteranno nella scheda cliente</strong> (timeline attività di recupero). Operazione non reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Indietro</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confermaElimina && doElimina(confermaElimina)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


type DestRow = {
  id: string;
  cliente_id: string;
  indirizzo_usato: string | null;
  stato: string;
  errore: string | null;
  azione_id: string | null;
  inviato_at: string | null;
  cliente: { ragione_sociale: string | null } | null;
};

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function statoLabel(s: string) {
  if (s === "inviato") return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Inviato</Badge>;
  if (s === "da_inviare") return <Badge className="bg-slate-500 text-white hover:bg-slate-500">In coda</Badge>;
  if (s === "saltato_no_indirizzo") return <Badge className="bg-amber-500 text-white hover:bg-amber-500"><MailWarning className="size-3 mr-1" />Senza indirizzo</Badge>;
  if (s === "fallito") return <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive"><XCircle className="size-3 mr-1" />Fallito</Badge>;
  if (s === "annullato") return <Badge variant="outline"><Ban className="size-3 mr-1" />Annullato</Badge>;
  return <Badge variant="outline">{s}</Badge>;

}

function DettaglioCampagnaDialog({ campagnaId, onClose }: { campagnaId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const riprova = useServerFn(riprovaCampagnaFalliti);
  const [statoFilter, setStatoFilter] = useState<string>("tutti");
  const [retrying, setRetrying] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["campagna-destinatari", campagnaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_sollecito_destinatari")
        .select(`
          id, cliente_id, indirizzo_usato, stato, errore, azione_id, inviato_at,
          cliente:clienti(ragione_sociale)
        `)
        .eq("campagna_id", campagnaId)
        .order("stato", { ascending: true })
        .order("inviato_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as DestRow[];
    },
    refetchInterval: 10_000,
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (statoFilter === "tutti") return rows;
    return rows.filter((r) => r.stato === statoFilter);
  }, [rows, statoFilter]);

  const senzaIndirizzoCount = (rows ?? []).filter((r) => r.stato === "saltato_no_indirizzo").length;
  const fallitiCount = (rows ?? []).filter((r) => r.stato === "fallito").length;

  async function handleRiprova() {
    setRetrying(true);
    try {
      const res = await riprova({ data: { campagnaId } });
      if (res.riprovati === 0) {
        toast.info("Nessuna riga riavviabile");
      } else {
        toast.success(`Riavviati ${res.riprovati} invii`);
      }
      qc.invalidateQueries({ queryKey: ["campagne-sollecito"] });
      qc.invalidateQueries({ queryKey: ["campagna-destinatari", campagnaId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dettaglio campagna</DialogTitle>
          <DialogDescription>Elenco destinatari e stato di invio</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2 flex-wrap">
          <Select value={statoFilter} onValueChange={setStatoFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              <SelectItem value="inviato">Inviati</SelectItem>
              <SelectItem value="saltato_no_indirizzo">Senza indirizzo</SelectItem>
              <SelectItem value="fallito">Falliti</SelectItem>
              <SelectItem value="da_inviare">In coda</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">
            {filtered.length} righe
          </div>
          <div className="ml-auto flex gap-2">
            {senzaIndirizzoCount > 0 && (
              <Badge variant="outline" className="gap-1"><MailWarning className="size-3" />{senzaIndirizzoCount} da gestire a mano</Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRiprova}
              disabled={retrying || (fallitiCount === 0 && senzaIndirizzoCount === 0)}
              className="gap-1.5"
            >
              <RefreshCw className={retrying ? "size-4 animate-spin" : "size-4"} />
              {retrying ? "Riavvio..." : "Riprova falliti"}
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Indirizzo usato</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Inviato il</TableHead>
              <TableHead>Note errore</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nessun destinatario</TableCell></TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.cliente?.ragione_sociale ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.indirizzo_usato ?? "—"}</TableCell>
                  <TableCell>{statoLabel(r.stato)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(r.inviato_at)}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-[280px] truncate">{r.errore ?? ""}</TableCell>
                  <TableCell>
                    <Link
                      to="/clienti/$clienteId"
                      params={{ clienteId: r.cliente_id }}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" /> Scheda
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
