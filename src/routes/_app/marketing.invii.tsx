import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Megaphone, RefreshCw, ChevronRight, ExternalLink, AlertCircle, CheckCircle2,
  Clock, XCircle, MailWarning, MoreHorizontal, Ban, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  annullaInvioCampagnaMarketing,
  riprovaCampagnaMarketingFalliti,
} from "@/lib/campagna-marketing.functions";
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
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/marketing/invii")({
  component: InviiMarketingPage,
});

type CampagnaRow = {
  id: string;
  nome: string;
  oggetto: string | null;
  stato: string;
  inviati: number;
  saltati: number;
  falliti: number;
  clic_unici: number;
  clic_totali: number;
  note: string | null;
  operatore_id: string | null;
  created_at: string;
  inviata_at: string | null;
  operatore: { nome: string | null; cognome: string | null } | null;
  totale_destinatari: number;
};

function fmtDateTime(v: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("it-IT"); } catch { return v; }
}

function StatoBadge({ s }: { s: string }) {
  if (s === "in_corso") return <Badge className="bg-blue-500 text-white hover:bg-blue-500"><Clock className="size-3 mr-1" />In corso</Badge>;
  if (s === "pronta") return <Badge className="bg-slate-500 text-white hover:bg-slate-500">Pronta</Badge>;
  if (s === "completata") return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600"><CheckCircle2 className="size-3 mr-1" />Completata</Badge>;
  if (s === "completata_con_errori") return <Badge className="bg-amber-500 text-white hover:bg-amber-500"><AlertCircle className="size-3 mr-1" />Errori</Badge>;
  if (s === "annullata") return <Badge variant="outline">Annullata</Badge>;
  if (s === "bozza") return <Badge variant="outline">Bozza</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function InviiMarketingPage() {
  const qc = useQueryClient();
  const annulla = useServerFn(annullaInvioCampagnaMarketing);
  const [openDettaglio, setOpenDettaglio] = useState<string | null>(null);
  const [confermaAnnulla, setConfermaAnnulla] = useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doAnnulla(id: string) {
    setBusy(true);
    try {
      await annulla({ data: { campagnaId: id } });
      toast.success("Campagna annullata. Il job si fermerà al prossimo blocco.");
      qc.invalidateQueries({ queryKey: ["campagne-marketing-invii"] });
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
      const { error } = await supabase.from("campagne_email_marketing").delete().eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Campagna eliminata insieme ai destinatari associati.");
      qc.invalidateQueries({ queryKey: ["campagne-marketing-invii"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
      setConfermaElimina(null);
    }
  }

  const { data: campagne, isLoading } = useQuery({
    queryKey: ["campagne-marketing-invii"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_marketing")
        .select("id, nome, oggetto, stato, inviati, saltati, falliti, clic_unici, clic_totali, note, operatore_id, created_at, inviata_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Omit<CampagnaRow, "operatore" | "totale_destinatari">[];

      // Operatori (nessuna FK verso profili): query separata.
      const opIds = Array.from(new Set(rows.map((r) => r.operatore_id).filter(Boolean) as string[]));
      const opMap: Record<string, { nome: string | null; cognome: string | null }> = {};
      if (opIds.length) {
        const { data: profs } = await supabase.from("profili").select("id, nome, cognome").in("id", opIds);
        (profs ?? []).forEach((p) => { opMap[p.id] = { nome: p.nome, cognome: p.cognome }; });
      }

      // Totale destinatari: una sola query aggregata per tutte le campagne.
      const totMap: Record<string, number> = {};
      if (rows.length) {
        const { data: dest } = await supabase
          .from("campagne_email_destinatari")
          .select("campagna_id")
          .in("campagna_id", rows.map((r) => r.id));
        (dest ?? []).forEach((d: { campagna_id: string }) => {
          totMap[d.campagna_id] = (totMap[d.campagna_id] ?? 0) + 1;
        });
      }

      return rows.map((r) => ({
        ...r,
        operatore: r.operatore_id ? opMap[r.operatore_id] ?? null : null,
        totale_destinatari: totMap[r.id] ?? 0,
      })) as CampagnaRow[];
    },
    refetchInterval: (q) => {
      const rows = q.state.data as CampagnaRow[] | undefined;
      return rows?.some((r) => r.stato === "in_corso") ? 10_000 : false;
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Megaphone className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invii massivi marketing</h1>
          <p className="text-sm text-muted-foreground">Campagne email marketing — stato e dettaglio destinatari</p>
        </div>
      </header>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Operatore</TableHead>
              <TableHead>Campagna</TableHead>
              <TableHead>Oggetto</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Tot.</TableHead>
              <TableHead className="text-right">Inviati</TableHead>
              <TableHead className="text-right">Saltati</TableHead>
              <TableHead className="text-right">Falliti</TableHead>
              <TableHead className="text-right">Clic unici</TableHead>
              <TableHead className="text-right">Tasso clic</TableHead>
              <TableHead className="min-w-[180px]">Avanzamento</TableHead>
              <TableHead className="w-[60px]"></TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={14}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))
            ) : !campagne || campagne.length === 0 ? (
              <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                Nessuna campagna ancora avviata.
              </TableCell></TableRow>
            ) : (
              campagne.map((c) => {
                const processati = c.inviati + c.saltati + c.falliti;
                const pct = c.totale_destinatari > 0 ? Math.round((processati / c.totale_destinatari) * 100) : 0;
                const isAttiva = c.stato === "in_corso";
                const isTerminale = c.stato === "completata" || c.stato === "completata_con_errori" || c.stato === "annullata";
                const apri = () => setOpenDettaglio(c.id);
                return (
                  <TableRow key={c.id} className="hover:bg-muted/50">
                    <TableCell className="whitespace-nowrap cursor-pointer" onClick={apri}>{fmtDateTime(c.inviata_at ?? c.created_at)}</TableCell>
                    <TableCell className="cursor-pointer" onClick={apri}>{`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell className="font-medium cursor-pointer" onClick={apri}>{c.nome}</TableCell>
                    <TableCell className="cursor-pointer text-muted-foreground max-w-[240px] truncate" onClick={apri}>{c.oggetto || "—"}</TableCell>
                    <TableCell className="cursor-pointer" onClick={apri}><StatoBadge s={c.stato} /></TableCell>
                    <TableCell className="text-right font-medium cursor-pointer" onClick={apri}>{c.totale_destinatari}</TableCell>
                    <TableCell className="text-right text-emerald-600 cursor-pointer" onClick={apri}>{c.inviati}</TableCell>
                    <TableCell className="text-right text-amber-600 cursor-pointer" onClick={apri}>{c.saltati}</TableCell>
                    <TableCell className="text-right text-destructive cursor-pointer" onClick={apri}>{c.falliti}</TableCell>
                    <TableCell className="text-right font-medium cursor-pointer" onClick={apri} style={{ color: c.clic_unici > 0 ? "#c94f8f" : undefined }}>{c.clic_unici ?? 0}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums cursor-pointer" onClick={apri}>
                      {c.inviati > 0 ? `${Math.round(((c.clic_unici ?? 0) / c.inviati) * 1000) / 10}%` : "—"}
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={apri}>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2" />
                        <span className="text-xs text-muted-foreground tabular-nums w-10">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="cursor-pointer" onClick={apri}><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
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
                              <Ban className="size-4 mr-2" /> Annulla invio
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
            <AlertDialogTitle>Annullare l'invio?</AlertDialogTitle>
            <AlertDialogDescription>
              Il job si fermerà al prossimo blocco. Le email già inviate non possono essere richiamate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Indietro</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confermaAnnulla && doAnnulla(confermaAnnulla)}>
              Annulla invio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confermaElimina} onOpenChange={(v) => !v && setConfermaElimina(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la campagna?</AlertDialogTitle>
            <AlertDialogDescription>
              La campagna verrà rimossa <strong>insieme a tutti i destinatari associati</strong>. Operazione non reversibile.
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

import { MessageIdCell } from "@/components/message-id-cell";

type DestRow = {
  id: string;
  cliente_id: string | null;
  email: string;
  nome_riferimento: string | null;
  tipo_destinatario: string;
  stato_invio: string;
  errore: string | null;
  inviato_at: string | null;
  num_clic: number | null;
  ultimo_clic_at: string | null;
  message_id: string | null;
};

/** Elenco dei clic di un destinatario (riga espansa). */
function ClicDestinatario({ destinatarioId }: { destinatarioId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["campagna-marketing-clic", destinatarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_clic")
        .select("id, url_destinazione, created_at")
        .eq("destinatario_id", destinatarioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; url_destinazione: string; created_at: string }[];
    },
  });
  if (isLoading) return <Skeleton className="h-6 w-full" />;
  if (!data || data.length === 0) return <div className="text-xs text-muted-foreground">Nessun clic registrato</div>;
  return (
    <ul className="space-y-1">
      {data.map((c) => (
        <li key={c.id} className="text-xs flex gap-2">
          <span className="text-muted-foreground whitespace-nowrap">{fmtDateTime(c.created_at)}</span>
          <span className="font-mono truncate">{c.url_destinazione}</span>
        </li>
      ))}
    </ul>
  );
};

function statoLabel(s: string) {
  if (s === "inviato") return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Inviato</Badge>;
  if (s === "da_inviare") return <Badge className="bg-slate-500 text-white hover:bg-slate-500">In coda</Badge>;
  if (s === "email_non_valida") return <Badge className="bg-amber-600 text-white hover:bg-amber-600"><MailWarning className="size-3 mr-1" />Email non valida</Badge>;
  if (s === "fallito") return <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive"><XCircle className="size-3 mr-1" />Fallito</Badge>;
  if (s === "saltato") return <Badge variant="outline"><Ban className="size-3 mr-1" />Saltato</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function DettaglioCampagnaDialog({ campagnaId, onClose }: { campagnaId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const riprova = useServerFn(riprovaCampagnaMarketingFalliti);
  const [statoFilter, setStatoFilter] = useState<string>("tutti");
  const [retrying, setRetrying] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["campagna-marketing-destinatari", campagnaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campagne_email_destinatari")
        .select("id, cliente_id, email, nome_riferimento, tipo_destinatario, stato_invio, errore, inviato_at, num_clic, ultimo_clic_at, message_id")
        .eq("campagna_id", campagnaId)
        .order("stato_invio", { ascending: true })
        .order("inviato_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as DestRow[];
    },
    refetchInterval: 10_000,
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (statoFilter === "tutti") return rows;
    if (statoFilter === "__ha_cliccato__") return rows.filter((r) => (r.num_clic ?? 0) > 0);
    return rows.filter((r) => r.stato_invio === statoFilter);
  }, [rows, statoFilter]);

  const fallitiCount = (rows ?? []).filter((r) => r.stato_invio === "fallito").length;

  async function handleRiprova() {
    setRetrying(true);
    try {
      const res = await riprova({ data: { campagnaId } });
      if (res.riprovati === 0) toast.info("Nessuna riga riavviabile");
      else toast.success(`Riavviati ${res.riprovati} invii`);
      qc.invalidateQueries({ queryKey: ["campagne-marketing-invii"] });
      qc.invalidateQueries({ queryKey: ["campagna-marketing-destinatari", campagnaId] });
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
              <SelectItem value="email_non_valida">Email non valida</SelectItem>
              <SelectItem value="fallito">Falliti</SelectItem>
              <SelectItem value="da_inviare">In coda</SelectItem>
              <SelectItem value="saltato">Saltati</SelectItem>
              <SelectItem value="__ha_cliccato__">Ha cliccato</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">{filtered.length} righe</div>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRiprova}
              disabled={retrying || fallitiCount === 0}
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
              <TableHead>Nome riferimento</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Inviato il</TableHead>
              <TableHead>Message-ID</TableHead>
              <TableHead className="text-right">Clic</TableHead>
              <TableHead>Ultimo clic</TableHead>
              <TableHead>Note errore</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Nessun destinatario</TableCell></TableRow>
            ) : (
              filtered.map((r) => {
                const clic = r.num_clic ?? 0;
                const espanso = expanded === r.id;
                return (
                <Fragment key={r.id}>
                <TableRow>
                  <TableCell className="font-medium">{r.nome_riferimento ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.email}</TableCell>
                  <TableCell>
                    <Badge variant={r.tipo_destinatario === "aziendale" ? "secondary" : "outline"}>
                      {r.tipo_destinatario === "aziendale" ? "Aziendale" : "Contatto"}
                    </Badge>
                  </TableCell>
                  <TableCell>{statoLabel(r.stato_invio)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(r.inviato_at)}</TableCell>
                  <TableCell><MessageIdCell messageId={r.message_id} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {clic > 0 ? (
                      <button
                        type="button"
                        className="font-semibold hover:underline"
                        style={{ color: "#c94f8f" }}
                        onClick={() => setExpanded(espanso ? null : r.id)}
                      >
                        {clic}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(r.ultimo_clic_at)}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-[280px] truncate">{r.errore ?? ""}</TableCell>
                  <TableCell>
                    {r.cliente_id && (
                      <Link
                        to="/clienti/$clienteId"
                        params={{ clienteId: r.cliente_id }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" /> Scheda
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
                {espanso && (
                  <TableRow>
                    <TableCell colSpan={10} className="bg-muted/40">
                      <ClicDestinatario destinatarioId={r.id} />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
