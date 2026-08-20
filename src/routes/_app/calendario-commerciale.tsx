// Calendario commerciale (CRM): attività pianificate su griglia mese/settimana/giorno.
// Riusa il pattern del calendario recupero crediti (FullCalendar) con fonte dati attivita_commerciale.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import itLocale from "@fullcalendar/core/locales/it";
import type { DatesSetArg, EventClickArg, EventDropArg, DateSelectArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { CalendarClock, ChevronDown, Plus, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AttivitaCommercialeDialog } from "@/components/attivita-commerciale-dialog";
import { TIPO_ATTIVITA_LABEL, fmtDataOra, type AttivitaRow, type TipoAttivita } from "@/lib/attivita-commerciale";

export const Route = createFileRoute("/_app/calendario-commerciale")({
  head: () => ({
    meta: [
      { title: "Calendario commerciale — FidiManager" },
      { name: "description", content: "Appuntamenti, visite e attività commerciali pianificate su clienti e lead." },
      { property: "og:title", content: "Calendario commerciale — FidiManager" },
      { property: "og:description", content: "Appuntamenti, visite e attività commerciali pianificate su clienti e lead." },
    ],
  }),
  component: CalendarioCommercialePage,
});

const TIPI: Array<{ value: TipoAttivita; label: string; color: string }> = [
  { value: "appuntamento", label: "Appuntamento", color: "#3b82f6" },
  { value: "visita", label: "Visita", color: "#0d9488" },
  { value: "chiamata", label: "Chiamata", color: "#f59e0b" },
  { value: "email", label: "Email", color: "#8b5cf6" },
  { value: "preventivo_inviato", label: "Preventivo inviato", color: "#16a34a" },
  { value: "nota", label: "Nota", color: "#6b7280" },
  { value: "altro", label: "Altro", color: "#6b7280" },
];

type AttivitaCalendario = AttivitaRow & {
  opportunita?: { titolo: string | null } | null;
  clienti?: { ragione_sociale: string | null } | null;
  lead?: { ragione_sociale: string | null; nome: string | null; cognome: string | null } | null;
};

function nomeSoggettoAttivita(a: AttivitaCalendario): string {
  if (a.clienti?.ragione_sociale) return a.clienti.ragione_sociale;
  if (a.lead) {
    const n = a.lead.ragione_sociale?.trim() || `${a.lead.nome ?? ""} ${a.lead.cognome ?? ""}`.trim();
    if (n) return n;
  }
  return a.opportunita?.titolo ?? "—";
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}, ${alpha})`;
}

function CalendarioCommercialePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isAgente = roles.includes("agente");
  const isTrasversale = roles.some((r) =>
    ["amministratore", "amministrazione", "direzione", "marketing", "store_manager"].includes(r),
  );
  const soloAgente = isAgente && !isTrasversale;

  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [tipoFilter, setTipoFilter] = useState<Set<TipoAttivita>>(new Set());
  const [agenteF, setAgenteF] = useState<string>("all");
  const [mostraCompletate, setMostraCompletate] = useState(true);
  const [aperta, setAperta] = useState<AttivitaCalendario | null>(null);
  const [creaOpen, setCreaOpen] = useState(false);
  const [creaData, setCreaData] = useState<Date | null>(null);
  const [modificaOpen, setModificaOpen] = useState(false);

  const { data: agenti = [] } = useQuery({
    queryKey: ["agenti-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agenti").select("codice, descrizione").order("descrizione");
      if (error) throw error;
      return (data ?? []) as Array<{ codice: string; descrizione: string | null }>;
    },
    staleTime: 300_000,
  });

  const attivitaQuery = useQuery({
    queryKey: ["attivita-commerciale", "calendario", range?.start ?? null, range?.end ?? null],
    enabled: !!range,
    queryFn: async () => {
      // La RLS filtra già per ruolo/agente: nessun filtro client sull'accesso.
      const { data, error } = await supabase
        .from("attivita_commerciale")
        .select(
          "id, tipo, titolo, descrizione, data_pianificata, data_svolgimento, completata, esito, agente_codice, operatore_id, store_id, opportunita_id, cliente_id, lead_id, luogo, note, created_at, opportunita:opportunita_id(titolo), clienti:cliente_id(ragione_sociale), lead:lead_id(ragione_sociale, nome, cognome)",
        )
        .not("data_pianificata", "is", null)
        .gte("data_pianificata", range!.start)
        .lt("data_pianificata", range!.end)
        .range(0, 999);
      if (error) throw error;
      return (data ?? []) as unknown as AttivitaCalendario[];
    },
  });

  const events = useMemo(() => {
    const now = Date.now();
    return (attivitaQuery.data ?? [])
      .filter((a) => (tipoFilter.size === 0 ? true : tipoFilter.has(a.tipo)))
      .filter((a) => (agenteF === "all" ? true : (a.agente_codice ?? "") === agenteF))
      .filter((a) => (mostraCompletate ? true : !a.completata))
      .map((a) => {
        const cfg = TIPI.find((t) => t.value === a.tipo);
        const color = cfg?.color ?? "#6b7280";
        const start = new Date(a.data_pianificata!);
        const arretrata = !a.completata && start.getTime() < now;
        return {
          id: a.id,
          title: `${nomeSoggettoAttivita(a)} · ${a.titolo}`,
          start: a.data_pianificata!,
          backgroundColor: a.completata ? hexToRgba(color, 0.25) : arretrata ? hexToRgba(color, 0.35) : color,
          borderColor: arretrata ? "#dc2626" : color,
          textColor: a.completata ? "#374151" : arretrata ? "#7f1d1d" : "#ffffff",
          classNames: [arretrata ? "attivita-arretrata" : "", a.completata ? "attivita-completata" : ""].filter(Boolean),
          extendedProps: { attivita: a },
        };
      });
  }, [attivitaQuery.data, tipoFilter, agenteF, mostraCompletate]);

  function handleDatesSet(arg: DatesSetArg) {
    const next = { start: arg.start.toISOString(), end: arg.end.toISOString() };
    if (!range || range.start !== next.start || range.end !== next.end) setRange(next);
  }

  function invalida() {
    qc.invalidateQueries({ queryKey: ["attivita-commerciale"] });
  }

  async function handleEventDrop(info: EventDropArg) {
    const nuova = info.event.start;
    if (!nuova) { info.revert(); return; }
    const { error } = await supabase
      .from("attivita_commerciale")
      .update({ data_pianificata: nuova.toISOString() })
      .eq("id", info.event.id);
    if (error) { toast.error("Errore riprogrammazione: " + error.message); info.revert(); return; }
    toast.success("Attività riprogrammata");
    invalida();
  }

  function handleEventClick(info: EventClickArg) {
    const a = (info.event.extendedProps as { attivita?: AttivitaCalendario }).attivita;
    if (a) setAperta(a);
  }

  function handleDateClick(info: DateClickArg) {
    const d = new Date(info.date);
    if (info.allDay) d.setHours(9, 0, 0, 0);
    setCreaData(d);
    setCreaOpen(true);
  }

  function handleSelect(info: DateSelectArg) {
    setCreaData(new Date(info.start));
    setCreaOpen(true);
    info.view.calendar.unselect();
  }

  async function completa(a: AttivitaCalendario) {
    const { error } = await supabase
      .from("attivita_commerciale")
      .update({ completata: true, data_svolgimento: a.data_svolgimento ?? new Date().toISOString() })
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Attività completata");
    setAperta(null);
    invalida();
  }

  function toggleTipo(t: TipoAttivita) {
    const n = new Set(tipoFilter);
    if (n.has(t)) n.delete(t); else n.add(t);
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
        .fc .attivita-arretrata { font-style: italic; }
        .fc .attivita-completata { opacity: 0.65; text-decoration: line-through; }
      `}</style>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarClock className="size-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendario Commerciale</h1>
            <p className="text-sm text-muted-foreground">
              Appuntamenti e attività pianificate — trascina per riprogrammare
            </p>
          </div>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={() => { setCreaData(new Date()); setCreaOpen(true); }}>
          <Plus className="size-4" /> Attività
        </Button>
      </div>

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
                  <button type="button" onClick={() => setTipoFilter(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                    Azzera
                  </button>
                )}
              </DropdownMenuLabel>
              {TIPI.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.value}
                  checked={tipoFilter.has(t.value)}
                  onCheckedChange={() => toggleTipo(t.value)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="inline-block size-3 rounded-sm mr-2" style={{ backgroundColor: t.color }} />
                  {t.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!soloAgente && (
            <Select value={agenteF} onValueChange={setAgenteF}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Agente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli agenti</SelectItem>
                {agenti.map((a) => (
                  <SelectItem key={a.codice} value={a.codice}>{a.descrizione ?? a.codice}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2">
            <Switch id="mostra-completate" checked={mostraCompletate} onCheckedChange={setMostraCompletate} />
            <Label htmlFor="mostra-completate" className="font-normal">Mostra completate</Label>
          </div>

          {attivitaQuery.isFetching && <span className="text-xs text-muted-foreground">Caricamento…</span>}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-3">
          <span className="font-medium text-foreground">Legenda:</span>
          {TIPI.map((t) => (
            <span key={t.value} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-sm" style={{ backgroundColor: t.color }} />
              {t.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border-2" style={{ borderColor: "#dc2626" }} />
            Arretrata
          </span>
          <span className="inline-flex items-center gap-1.5 line-through opacity-70">Completata</span>
        </div>
      </Card>

      <Card className="p-4">
        {attivitaQuery.isLoading && !attivitaQuery.data ? (
          <Skeleton className="h-[600px] w-full" />
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={itLocale}
            firstDay={1}
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
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
            selectable
            selectMirror
            unselectAuto
            longPressDelay={250}
            dateClick={handleDateClick}
            select={handleSelect}
          />
        )}
      </Card>

      {/* Dettaglio attività */}
      <Dialog open={!!aperta && !modificaOpen} onOpenChange={(o) => { if (!o) setAperta(null); }}>
        <DialogContent className="max-w-lg">
          {aperta && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline">{TIPO_ATTIVITA_LABEL[aperta.tipo]}</Badge>
                  {aperta.titolo}
                </DialogTitle>
                <DialogDescription>{nomeSoggettoAttivita(aperta)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Pianificata: </span>{fmtDataOra(aperta.data_pianificata)}</div>
                <div>
                  <span className="text-muted-foreground">Stato: </span>
                  {aperta.completata ? `Fatto (${fmtDataOra(aperta.data_svolgimento)})` : "Da fare"}
                </div>
                {aperta.esito && <div><span className="text-muted-foreground">Esito: </span>{aperta.esito}</div>}
                {aperta.luogo && <div><span className="text-muted-foreground">Luogo: </span>{aperta.luogo}</div>}
                {aperta.note && <div><span className="text-muted-foreground">Note: </span>{aperta.note}</div>}
              </div>
              <DialogFooter className="flex-wrap gap-2">
                {aperta.opportunita_id && (
                  <Button
                    variant="outline"
                    className="mr-auto"
                    onClick={() => {
                      const id = aperta.opportunita_id!;
                      setAperta(null);
                      navigate({ to: "/opportunita/$opportunitaId", params: { opportunitaId: id } });
                    }}
                  >
                    <ExternalLink className="size-4 mr-2" /> Apri opportunità
                  </Button>
                )}
                {aperta.cliente_id && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const id = aperta.cliente_id!;
                      setAperta(null);
                      navigate({ to: "/clienti/$clienteId", params: { clienteId: id } });
                    }}
                  >
                    <ExternalLink className="size-4 mr-2" /> Scheda cliente
                  </Button>
                )}
                <Button variant="outline" onClick={() => setModificaOpen(true)}>Modifica</Button>
                {!aperta.completata && (
                  <Button onClick={() => completa(aperta)}>
                    <Check className="size-4 mr-2" /> Segna completata
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modifica attività esistente */}
      {aperta && (
        <AttivitaCommercialeDialog
          open={modificaOpen}
          onOpenChange={(v) => { setModificaOpen(v); if (!v) setAperta(null); }}
          attivita={aperta}
          contesto={{
            opportunita_id: aperta.opportunita_id,
            cliente_id: aperta.cliente_id,
            lead_id: aperta.lead_id,
            agente_codice: aperta.agente_codice,
            store_id: aperta.store_id,
          }}
        />
      )}

      {/* Creazione da slot vuoto: richiede la scelta del soggetto */}
      <AttivitaCommercialeDialog
        open={creaOpen}
        onOpenChange={(v) => { setCreaOpen(v); if (!v) setCreaData(null); }}
        contesto={{}}
        dataIniziale={creaData}
        conSelettoreSoggetto
      />
    </div>
  );
}
