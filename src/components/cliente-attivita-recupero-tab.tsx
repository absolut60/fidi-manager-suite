import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Send, Plus, Bell, Phone, StickyNote, FileText, Mail, Activity, Eye, CalendarClock, Paperclip,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AllegatiSection } from "@/components/allegati-section";

import { classificaScadenza } from "@/lib/scadenze";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InviaSollecitoDialog } from "@/components/invia-sollecito-dialog";
import { EmailLiberaDialog } from "@/components/email-libera-dialog";
import { CreaAzioneDialog } from "@/components/crea-azione-dialog";
import { EmailInviataView } from "@/components/email-inviata-view";
import type { TipoAzione } from "@/components/reminder-controls";

type Esito = "da_fare" | "fatto" | "nessuna_risposta" | "promessa_pagamento" | "contestazione" | "pagato";

const ESITI: { value: Esito; label: string }[] = [
  { value: "da_fare", label: "Da fare" },
  { value: "fatto", label: "Fatto" },
  { value: "nessuna_risposta", label: "Nessuna risposta" },
  { value: "promessa_pagamento", label: "Promessa pagamento" },
  { value: "contestazione", label: "Contestazione" },
  { value: "pagato", label: "Pagato" },
];

const TIPO_ICON: Record<string, typeof Mail> = {
  email: Mail,
  telefonata: Phone,
  promemoria: Bell,
  nota: StickyNote,
  lettera: FileText,
  promemoria_scadenza: CalendarClock,
};

const TIPO_LABEL: Record<string, string> = {
  email: "Email",
  telefonata: "Telefonata",
  promemoria: "Promemoria",
  nota: "Nota",
  lettera: "Lettera",
  promemoria_scadenza: "Promemoria scadenza",
};

function esitoBadge(e: Esito) {
  const map: Record<Esito, string> = {
    da_fare: "bg-yellow-500 text-white hover:bg-yellow-500",
    fatto: "bg-blue-500 text-white hover:bg-blue-500",
    nessuna_risposta: "bg-muted text-muted-foreground hover:bg-muted",
    promessa_pagamento: "bg-orange-500 text-white hover:bg-orange-500",
    contestazione: "bg-destructive text-destructive-foreground hover:bg-destructive",
    pagato: "bg-emerald-600 text-white hover:bg-emerald-600",
  };
  return <Badge className={map[e]}>{ESITI.find((x) => x.value === e)?.label ?? e}</Badge>;
}

function fmtEuro(v: unknown) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtDateTime(v: unknown) {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
}

type Azione = {
  id: string;
  cliente_id: string;
  operatore_id: string | null;
  tipo: TipoAzione | "promemoria_scadenza";
  esito: Esito;
  data_azione: string;
  importo_riferimento: number | null;
  note: string | null;
  email_oggetto: string | null;
  email_corpo_html: string | null;
  email_destinatario: string | null;
  created_at: string;
};

export function ClienteAttivitaRecuperoTab({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  
  const [sollecitoOpen, setSollecitoOpen] = useState(false);
  const [emailLiberaOpen, setEmailLiberaOpen] = useState(false);
  const [creaOpen, setCreaOpen] = useState(false);
  const [creaTipo, setCreaTipo] = useState<TipoAzione>("promemoria");
  const [viewEmail, setViewEmail] = useState<Azione | null>(null);

  // Totale scaduto attuale
  const { data: totaleScaduto } = useQuery({
    queryKey: ["attivita-totale-scaduto", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("importo_scadenza, giorni_ritardo, stato_contabile, tempi_scadenza")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      return (data ?? [])
        .filter((s: any) => classificaScadenza(s) === "scaduto")
        .reduce((a: number, s: any) => a + Number(s.importo_scadenza ?? 0), 0);
    },
  });

  // Operatori (per mostrare nomi)
  const { data: operatori } = useQuery({
    queryKey: ["operatori-list-attivita"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profili")
        .select("id, nome, cognome, email");
      if (error) throw error;
      return data ?? [];
    },
  });
  const operatoreMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of operatori ?? []) {
      m[o.id] = `${o.nome ?? ""} ${o.cognome ?? ""}`.trim() || o.email || "—";
    }
    return m;
  }, [operatori]);

  // Azioni del cliente
  const { data: azioni, isLoading } = useQuery({
    queryKey: ["azioni-recupero-cliente", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("azioni_recupero")
        .select("id, cliente_id, operatore_id, tipo, esito, data_azione, importo_riferimento, note, email_oggetto, email_corpo_html, email_destinatario, created_at")
        .eq("cliente_id", clienteId)
        .order("data_azione", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Azione[];
    },
  });

  const daFare = useMemo(
    () => (azioni ?? []).filter((a) => a.esito === "da_fare")
      .sort((a, b) => new Date(a.data_azione).getTime() - new Date(b.data_azione).getTime()),
    [azioni],
  );
  const concluse = useMemo(
    () => (azioni ?? []).filter((a) => a.esito !== "da_fare"),
    [azioni],
  );

  const prossima = daFare[0] ?? null;
  const ultimaFatta = useMemo(
    () => concluse.find((a) => a.esito === "fatto") ?? null,
    [concluse],
  );

  async function updateEsito(id: string, nextEsito: Esito) {
    const { error } = await supabase
      .from("azioni_recupero")
      .update({ esito: nextEsito })
      .eq("id", id);
    if (error) {
      toast.error("Errore: " + error.message);
      return;
    }
    toast.success("Esito aggiornato");
    qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
    qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
  }

  function openNuova(tipo: TipoAzione) {
    setCreaTipo(tipo);
    setCreaOpen(true);
  }

  return (
    <div className="space-y-5">
      {/* Mini riepilogo */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatBlock label="Totale scaduto" value={fmtEuro(totaleScaduto ?? 0)} tone="destructive" />
          <StatBlock label="Azioni totali" value={String(azioni?.length ?? 0)} />
          <StatBlock label="Da fare" value={String(daFare.length)} tone="warning" />
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Prossima pianificata</div>
            {prossima ? (
              <div className="mt-1 text-sm">
                <div className="font-medium">{TIPO_LABEL[prossima.tipo]}</div>
                <div className="text-muted-foreground">{fmtDateTime(prossima.data_azione)}</div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">—</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Ultima azione fatta</div>
            {ultimaFatta ? (
              <div className="mt-1 text-sm">
                <div className="font-medium">{TIPO_LABEL[ultimaFatta.tipo]}</div>
                <div className="text-muted-foreground">{fmtDateTime(ultimaFatta.data_azione)}</div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">—</div>
            )}
          </div>
        </div>
      </Card>

      {/* Azioni dirette */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setSollecitoOpen(true)} className="gap-1.5">
          <Send className="size-4" /> Invia sollecito
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEmailLiberaOpen(true)} className="gap-1.5">
          <Mail className="size-4" /> Email libera
        </Button>
        <Button size="sm" variant="outline" onClick={() => openNuova("promemoria")} className="gap-1.5">
          <Bell className="size-4" /> Nuovo promemoria
        </Button>
        <Button size="sm" variant="outline" onClick={() => openNuova("telefonata")} className="gap-1.5">
          <Phone className="size-4" /> Nuova telefonata
        </Button>
        <Button size="sm" variant="outline" onClick={() => openNuova("nota")} className="gap-1.5">
          <StickyNote className="size-4" /> Nuova nota
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openNuova("lettera")} className="gap-1.5">
          <FileText className="size-4" /> Lettera
        </Button>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (azioni?.length ?? 0) === 0 ? (
        <Card className="p-12 text-center">
          <Activity className="size-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium">Nessuna azione registrata</p>
          <p className="text-xs text-muted-foreground mt-1">
            Usa i pulsanti sopra per iniziare a tracciare l'attività di recupero.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {daFare.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Da fare ({daFare.length})
              </h3>
              <div className="space-y-2">
                {daFare.map((a) => (
                  <TimelineItem
                    key={a.id}
                    azione={a}
                    operatoreName={a.operatore_id ? operatoreMap[a.operatore_id] : null}
                    highlight
                    onChangeEsito={(e) => updateEsito(a.id, e)}
                    onViewEmail={() => setViewEmail(a)}
                  />
                ))}
              </div>
            </section>
          )}

          {concluse.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Storico ({concluse.length})
              </h3>
              <div className="space-y-2">
                {concluse.map((a) => (
                  <TimelineItem
                    key={a.id}
                    azione={a}
                    operatoreName={a.operatore_id ? operatoreMap[a.operatore_id] : null}
                    onChangeEsito={(e) => updateEsito(a.id, e)}
                    onViewEmail={() => setViewEmail(a)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <InviaSollecitoDialog
        open={sollecitoOpen}
        onOpenChange={setSollecitoOpen}
        clienteId={clienteId}
      />
      <EmailLiberaDialog
        open={emailLiberaOpen}
        onOpenChange={setEmailLiberaOpen}
        clienteId={clienteId}
      />
      <CreaAzioneDialog
        open={creaOpen}
        onOpenChange={setCreaOpen}
        clienteId={clienteId}
        tipoIniziale={creaTipo}
      />

      <Dialog open={!!viewEmail} onOpenChange={(v) => !v && setViewEmail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email inviata</DialogTitle>
          </DialogHeader>
          {viewEmail && (
            <EmailInviataView
              destinatario={viewEmail.email_destinatario}
              oggetto={viewEmail.email_oggetto}
              corpoHtml={viewEmail.email_corpo_html}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatBlock({ label, value, tone }: { label: string; value: string; tone?: "destructive" | "warning" }) {
  const toneClass =
    tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-yellow-600" : "text-foreground";
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function TimelineItem({
  azione,
  operatoreName,
  highlight,
  onChangeEsito,
  onViewEmail,
}: {
  azione: Azione;
  operatoreName: string | null;
  highlight?: boolean;
  onChangeEsito: (e: Esito) => void;
  onViewEmail: () => void;
}) {
  const Icon = TIPO_ICON[azione.tipo] ?? Activity;
  const [showAllegati, setShowAllegati] = useState(false);
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-yellow-500/40 bg-yellow-500/5" : "border-border bg-background"}`}>
      <div className="flex gap-3">
        <div className={`size-9 rounded-md flex items-center justify-center shrink-0 ${highlight ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" : "bg-muted text-muted-foreground"}`}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{TIPO_LABEL[azione.tipo]}</span>
            <span className="text-xs text-muted-foreground">{fmtDateTime(azione.data_azione)}</span>
            {operatoreName && (
              <span className="text-xs text-muted-foreground">· {operatoreName}</span>
            )}
            {azione.importo_riferimento != null && Number(azione.importo_riferimento) > 0 && (
              <span className="text-xs text-muted-foreground">· rif. {fmtEuro(azione.importo_riferimento)}</span>
            )}
          </div>
          {azione.note && (
            <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-3">{azione.note}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {(azione.tipo === "email" || azione.tipo === "promemoria_scadenza") && azione.email_corpo_html && (
              <Button variant="link" size="sm" className="h-auto p-0 gap-1 text-xs" onClick={onViewEmail}>
                <Eye className="size-3" /> Vedi email inviata
              </Button>
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 gap-1 text-xs"
              onClick={() => setShowAllegati((v) => !v)}
            >
              <Paperclip className="size-3" /> {showAllegati ? "Nascondi allegati" : "Allegati"}
            </Button>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {esitoBadge(azione.esito)}
          <Select value={azione.esito} onValueChange={(v) => onChangeEsito(v as Esito)}>
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESITI.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {showAllegati && (
        <div className="mt-3 ml-12 border-t pt-3">
          <AllegatiSection
            entitaTipo="azione_recupero"
            entitaId={azione.id}
            clienteId={azione.cliente_id}
            canEdit
            compact
          />
        </div>
      )}
    </div>
  );
}
