import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import itLocale from "@fullcalendar/core/locales/it";
import type { DatesSetArg, EventClickArg, EventDropArg } from "@fullcalendar/core";
import { CalendarClock, ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/recupero-crediti-calendario")({
  component: CalendarioPage,
});

const ESITI = [
  { value: "da_fare", label: "Da fare" },
  { value: "fatto", label: "Fatto" },
  { value: "nessuna_risposta", label: "Nessuna risposta" },
  { value: "promessa_pagamento", label: "Promessa pagamento" },
  { value: "contestazione", label: "Contestazione" },
  { value: "pagato", label: "Pagato" },
] as const;

const TIPI = [
  { value: "telefonata", label: "Telefonata", color: "#3b82f6" }, // blu
  { value: "email", label: "Email", color: "#14b8a6" }, // teal
  { value: "promemoria", label: "Promemoria", color: "#f59e0b" }, // ambra
  { value: "nota", label: "Nota", color: "#6b7280" }, // grigio
  { value: "lettera", label: "Lettera", color: "#8b5cf6" }, // viola
] as const;

type Tipo = (typeof TIPI)[number]["value"];
type Esito = (typeof ESITI)[number]["value"];

type AzioneRow = {
  id: string;
  cliente_id: string;
  tipo: Tipo;
  esito: Esito;
  data_azione: string;
  importo_riferimento: number | null;
  note: string | null;
  email_oggetto: string | null;
  email_corpo_html: string | null;
  email_destinatario: string | null;
  cliente: { id: string; ragione_sociale: string; store_id: string | null } | null;
};

function fmtEuro(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  try { return new Date(String(v)).toLocaleDateString("it-IT"); } catch { return String(v); }
}
function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function CalendarioPage() {
  const { role, profilo } = useAuth();
  const isStoreManager = role === "store_manager";
  const myStoreId = profilo?.store_id ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const calendarRef = useRef<FullCalendar | null>(null);

  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [storeId, setStoreId] = useState<string>(
    isStoreManager && myStoreId ? myStoreId : "all"
  );
  const [tipoFilter, setTipoFilter] = useState<Set<Tipo>>(new Set());
  const [openAzione, setOpenAzione] = useState<AzioneRow | null>(null);

  const { data: stores } = useQuery({
    queryKey: ["stores-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const azioniQuery = useQuery({
    queryKey: [
      "azioni-calendario",
      range?.start ?? null,
      range?.end ?? null,
      storeId,
      Array.from(tipoFilter).sort(),
    ],
    enabled: !!range,
    queryFn: async () => {
      let q = supabase
        .from("azioni_recupero")
        .select(
          "id, cliente_id, tipo, esito, data_azione, importo_riferimento, note, email_oggetto, email_corpo_html, email_destinatario, cliente:clienti!inner(id, ragione_sociale, store_id)"
        )
        .eq("esito", "da_fare")
        .gte("data_azione", range!.start)
        .lt("data_azione", range!.end);

      if (tipoFilter.size > 0) q = q.in("tipo", Array.from(tipoFilter));
      if (storeId !== "all") q = q.eq("cliente.store_id", storeId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AzioneRow[];
    },
  });

  const events = useMemo(() => {
    const now = Date.now();
    return (azioniQuery.data ?? []).map((a) => {
      const tipoCfg = TIPI.find((t) => t.value === a.tipo);
      const color = tipoCfg?.color ?? "#6b7280";
      const start = new Date(a.data_azione);
      const isOverdue = start.getTime() < now;
      return {
        id: a.id,
        title: `${a.cliente?.ragione_sociale ?? "—"} · ${tipoCfg?.label ?? a.tipo}`,
        start: a.data_azione,
        backgroundColor: isOverdue ? hexToRgba(color, 0.35) : color,
        borderColor: isOverdue ? "#dc2626" : color,
        textColor: isOverdue ? "#7f1d1d" : "#ffffff",
        classNames: isOverdue ? ["azione-arretrata"] : [],
        extendedProps: { azione: a, isOverdue },
      };
    });
  }, [azioniQuery.data]);

  function handleDatesSet(arg: DatesSetArg) {
    const next = { start: arg.start.toISOString(), end: arg.end.toISOString() };
    if (!range || range.start !== next.start || range.end !== next.end) {
      setRange(next);
    }
  }

  async function handleEventDrop(info: EventDropArg) {
    const newDate = info.event.start;
    if (!newDate) {
      info.revert();
      return;
    }
    const { error } = await supabase
      .from("azioni_recupero")
      .update({ data_azione: newDate.toISOString() })
      .eq("id", info.event.id);
    if (error) {
      toast.error("Errore riprogrammazione: " + error.message);
      info.revert();
      return;
    }
    toast.success("Attività riprogrammata");
    qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
  }

  function handleEventClick(info: EventClickArg) {
    const azione = info.event.extendedProps.azione as AzioneRow | undefined;
    if (azione) setOpenAzione(azione);
  }

  async function handleChangeEsito(id: string, nextEsito: Esito) {
    const { error } = await supabase
      .from("azioni_recupero")
      .update({ esito: nextEsito })
      .eq("id", id);
    if (error) {
      toast.error("Errore aggiornamento: " + error.message);
      return;
    }
    toast.success("Esito aggiornato");
    setOpenAzione(null);
    qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
  }

  function toggleTipo(t: Tipo) {
    const n = new Set(tipoFilter);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    setTipoFilter(n);
  }

  return (
    <div className="space-y-6">
      <style>{`
        .fc .fc-toolbar-title { font-size: 1.1rem; font-weight: 600; }
        .fc .fc-button { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); border-color: hsl(var(--border)); text-transform: capitalize; }
        .fc .fc-button:hover { background: hsl(var(--accent)); }
        .fc .fc-button-primary:not(:disabled).fc-button-active,
        .fc .fc-button-primary:not(:disabled):active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: hsl(var(--primary)); }
        .fc .fc-event { cursor: pointer; padding: 2px 4px; font-size: 12px; }
        .fc .azione-arretrata { font-style: italic; }
      `}</style>

      <div className="flex items-center gap-3">
        <CalendarClock className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario Recupero Crediti</h1>
          <p className="text-sm text-muted-foreground">
            Attività di recupero da fare — trascina per riprogrammare
          </p>
        </div>
      </div>

      {/* Filtri + legenda */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-between font-normal">
                Tipo{tipoFilter.size > 0 ? ` (${tipoFilter.size})` : ""}
                <ChevronDown className="size-4 opacity-60 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-popover">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Tipo</span>
                {tipoFilter.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setTipoFilter(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >Azzera</button>
                )}
              </DropdownMenuLabel>
              {TIPI.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.value}
                  checked={tipoFilter.has(t.value)}
                  onCheckedChange={() => toggleTipo(t.value)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span
                    className="inline-block size-3 rounded-sm mr-2"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!isStoreManager && (
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli store</SelectItem>
                {(stores ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {azioniQuery.isFetching && (
            <span className="text-xs text-muted-foreground">Caricamento…</span>
          )}
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-3">
          <span className="font-medium text-foreground">Legenda:</span>
          {TIPI.map((t) => (
            <span key={t.value} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: t.color }} />
              {t.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border-2 border-red-600 bg-red-200" />
            Arretrate (data passata)
          </span>
        </div>
      </Card>

      <Card className="p-4">
        {azioniQuery.isLoading && !range ? (
          <Skeleton className="h-[600px] w-full" />
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale={itLocale}
            firstDay={1}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            buttonText={{ today: "Oggi", month: "Mese", week: "Settimana", day: "Giorno" }}
            allDaySlot={false}
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            nowIndicator
            editable
            eventDurationEditable={false}
            height="auto"
            events={events}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
          />
        )}
      </Card>

      <Dialog open={!!openAzione} onOpenChange={(o) => !o && setOpenAzione(null)}>
        <DialogContent className="max-w-2xl">
          {openAzione && (
            <DettaglioDialog
              azione={openAzione}
              onChangeEsito={(e) => handleChangeEsito(openAzione.id, e)}
              onApriCliente={() => {
                const id = openAzione.cliente_id;
                setOpenAzione(null);
                navigate({ to: "/clienti/$clienteId", params: { clienteId: id } });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DettaglioDialog({
  azione,
  onChangeEsito,
  onApriCliente,
}: {
  azione: AzioneRow;
  onChangeEsito: (e: Esito) => void;
  onApriCliente: () => void;
}) {
  const tipoCfg = TIPI.find((t) => t.value === azione.tipo);
  const scadenzeQuery = useQuery({
    queryKey: ["azione-scadenze-cal", azione.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero_scadenze")
        .select("scadenza:scadenze!inner(id, numero_documento, data_scadenza, importo_scadenza)")
        .eq("azione_id", azione.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.scadenza);
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-sm"
            style={{ backgroundColor: tipoCfg?.color ?? "#6b7280" }}
          />
          {azione.cliente?.ragione_sociale ?? "—"}
        </DialogTitle>
        <DialogDescription>
          {tipoCfg?.label ?? azione.tipo} · {fmtDateTime(azione.data_azione)}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Esito</div>
            <Select value={azione.esito} onValueChange={(v) => onChangeEsito(v as Esito)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESITI.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Importo rif.</div>
            <div className="text-base font-medium pt-2">{fmtEuro(azione.importo_riferimento)}</div>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Note</div>
          <div className="text-sm whitespace-pre-wrap min-h-[2rem]">{azione.note ?? "—"}</div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Scadenze collegate</div>
          {scadenzeQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (scadenzeQuery.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-muted-foreground">Nessuna scadenza collegata</div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N. documento</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(scadenzeQuery.data ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.numero_documento ?? "—"}</TableCell>
                      <TableCell>{fmtDate(s.data_scadenza)}</TableCell>
                      <TableCell className="text-right">{fmtEuro(s.importo_scadenza)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onApriCliente}>
            <ExternalLink className="size-4 mr-2" />
            Apri scheda cliente
          </Button>
        </div>
      </div>
    </>
  );
}
