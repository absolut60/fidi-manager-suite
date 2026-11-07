import { isSoloShowroom } from "@/lib/permessi-showroom";
import { BadgeStatoPromessa } from "@/components/stato-promessa";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Send, Plus, Bell, Phone, StickyNote, FileText, Activity, Eye, Paperclip,
  ChevronDown, Check, HandCoins,
} from "lucide-react";
import { RegistraPromessaDialog } from "@/components/registra-promessa-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AllegatiSection, ALLEGATI_BUCKET } from "@/components/allegati-section";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InviaEmailRecuperoDialog } from "@/components/invia-email-recupero-dialog";
import { CreaAzioneDialog } from "@/components/crea-azione-dialog";
import { EmailInviataView } from "@/components/email-inviata-view";
import { SollecitiInviatiLista } from "@/components/solleciti-inviati-lista";
import { ModificaAzioneDialog, type AzioneModificabile } from "@/components/modifica-azione-dialog";
import { LetteraPdfDialog } from "@/components/lettera-pdf-dialog";
import { puoInviareComunicazioniRecupero } from "@/lib/recupero-permessi";
import type { TipoAzione } from "@/components/reminder-controls";
import { useAzioniRecuperoCliente, useOperatoriAttivita, useStadioSollecitoCliente, type Azione } from "@/hooks/use-azioni-recupero-cliente";
import { ESITO_AZIONE_LABEL, TIPO_AZIONE_ICON, TIPO_AZIONE_LABEL, isEmailDaInviare, isPromessaDaVerificare, isPromessaPagamento, testoAzione, tipoAzioneVisualizzato } from "@/lib/azioni-recupero-ui";
import { useConteggioAllegatiAzioni, conteggioAllegatiAzioniKey } from "@/hooks/use-conteggio-allegati-azioni";
import { ESITO_AZIONE_COLORE, azioneInRitardo } from "@/lib/azioni-recupero-ui";
import { STADIO_LABEL, StadioSollecitoBadge } from "@/components/stadio-sollecito-badge";

export function fmtData(v: string) {
  const d = v.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : v;
}

type Esito = "da_fare" | "fatto" | "nessuna_risposta" | "contestazione" | "pagato";

const TIPO_ICON = TIPO_AZIONE_ICON;
const TIPO_LABEL = TIPO_AZIONE_LABEL;

export function fmtEuro(v: unknown) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
export function fmtDateTime(v: unknown) {
  if (!v) return "—";
  try {
    return new Date(String(v)).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
}


/** Invalidazione dopo creazione/modifica/eliminazione di un'azione di recupero (condivisa con la scheda Promesse). */
export function invalidaRecuperoCliente(qc: QueryClient, clienteId: string) {
  qc.invalidateQueries({ queryKey: conteggioAllegatiAzioniKey(clienteId) });
  qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
  qc.invalidateQueries({ queryKey: ["azioni-recupero"] });
  qc.invalidateQueries({ queryKey: ["azioni-recupero-metrics"] });
  qc.invalidateQueries({ queryKey: ["azioni-recupero-counts"] });
  qc.invalidateQueries({ queryKey: ["azioni-calendario"] });
  qc.invalidateQueries({ queryKey: ["recupero-clienti"] });
  qc.invalidateQueries({ queryKey: ["clienti-avvisati"] });
  qc.invalidateQueries({ queryKey: ["recupero-stadio-cliente", clienteId] });
  qc.invalidateQueries({ queryKey: ["scadenziario-stadi-sollecito"] });
}

/** Permesso modifica/eliminazione di un'azione (stessa regola della timeline). */
export function puoModificareAzione(roles: string[], userId: string | null | undefined, a: { operatore_id: string | null }): boolean {
  const canManageAll = roles.includes("amministratore") || roles.includes("amministrazione") || roles.includes("direzione");
  return canManageAll || a.operatore_id === (userId ?? "__none__");
}

/** Elimina un'azione rimuovendo prima gli allegati collegati (file + righe). */
export async function eliminaAzioneConAllegati(azioneId: string): Promise<void> {
  const { data: alleg, error: eAll } = await supabase
    .from("allegati")
    .select("id, storage_path")
    .eq("entita_tipo", "azione_recupero")
    .eq("entita_id", azioneId);
  if (eAll) throw eAll;
  if (alleg && alleg.length > 0) {
    const paths = alleg.map((a) => a.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from(ALLEGATI_BUCKET).remove(paths);
    }
    const ids = alleg.map((a) => a.id);
    const { error: eDelAll } = await supabase.from("allegati").delete().in("id", ids);
    if (eDelAll) throw eDelAll;
  }
  // azioni_recupero_scadenze ha ON DELETE CASCADE
  const { error } = await supabase.from("azioni_recupero").delete().eq("id", azioneId);
  if (error) throw error;
}

export function ClienteAttivitaRecuperoTab({ clienteId, onApriScheda, onApriPromesse, senzaRiepilogo = false }: { senzaRiepilogo?: boolean; clienteId: string; onApriScheda?: () => void; onApriPromesse?: () => void }) {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const puoInviare = puoInviareComunicazioniRecupero(roles as string[]);
  // FM56: showroom in sola lettura sul recupero.
  const soloShowroom = isSoloShowroom(roles as string[]);

  const [sollecitoOpen, setSollecitoOpen] = useState(false);
  const [creaOpen, setCreaOpen] = useState(false);
  const [creaTipo, setCreaTipo] = useState<TipoAzione>("promemoria");
  const [letteraOpen, setLetteraOpen] = useState(false);
  const [promessaOpen, setPromessaOpen] = useState(false);
  const [viewEmail, setViewEmail] = useState<Azione | null>(null);
  const [editAzione, setEditAzione] = useState<Azione | null>(null);

  // Operatori (per mostrare nomi) — hook condiviso, stessa queryKey.
  const { data: operatori } = useOperatoriAttivita();
  const operatoreMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of operatori ?? []) {
      m[o.id] = `${o.nome ?? ""} ${o.cognome ?? ""}`.trim() || "—";
    }
    return m;
  }, [operatori]);

  // Azioni del cliente (fonte unica condivisa)
  const { azioni, isLoading, daFare, concluse, prossima, ultimaFatta } = useAzioniRecuperoCliente(clienteId);
  const { data: conteggiAllegati } = useConteggioAllegatiAzioni(clienteId, (azioni ?? []).map((a) => a.id));
  // Stadio sollecito: stessa query/chiave della striscia dello scadenziario.
  const { data: stadioRow, isLoading: stadioLoading } = useStadioSollecitoCliente(clienteId);
  // Ultima promessa: dalle azioni già caricate, data promessa più recente.
  const ultimaPromessa = useMemo(() => {
    let best: Azione | null = null;
    for (const a of azioni ?? []) {
      if (!isPromessaPagamento(a) || !a.data_promessa_pagamento) continue;
      if (!best || a.data_promessa_pagamento > (best.data_promessa_pagamento ?? "")) best = a;
    }
    return best;
  }, [azioni]);
  const promessaDaVerificare = ultimaPromessa ? isPromessaDaVerificare(ultimaPromessa) : false;
  const testoProssima = prossima ? testoAzione(prossima) : null;
  const testoUltima = ultimaFatta ? testoAzione(ultimaFatta) : null;

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

  function canEditAzione(a: Azione): boolean {
    return puoModificareAzione(roles as string[], user?.id, a);
  }

  function invalidateRecupero() {
    invalidaRecuperoCliente(qc, clienteId);
  }

  function openNuova(tipo: TipoAzione) {
    setCreaTipo(tipo);
    setCreaOpen(true);
  }

  return (
    <div className="space-y-5">
      {/* Mini riepilogo */}
      {!senzaRiepilogo && <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBlock label="Azioni totali" value={String(azioni?.length ?? 0)} />
          <StatBlock label="Da fare" value={String(daFare.length)} tone="warning" />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Stadio sollecito</div>
            <div className="mt-1">
              {stadioLoading ? <Skeleton className="h-6 w-24" /> : (
                <StadioSollecitoBadge
                  stadio={stadioRow?.stadio_sollecito ?? 0}
                  data={stadioRow?.stadio_data ?? null}
                  giorni={stadioRow?.stadio_giorni ?? null}
                />
              )}
            </div>
          </div>
          <div
            className={`min-w-0 ${onApriPromesse ? "-m-1.5 rounded-md p-1.5 cursor-pointer transition-colors hover:bg-muted/60" : ""}`}
            {...(onApriPromesse ? {
              role: "link", tabIndex: 0, title: "Apri la scheda Promesse",
              onClick: onApriPromesse,
              onKeyDown: (e: { key: string }) => { if (e.key === "Enter") onApriPromesse(); },
            } : {})}
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Ultima promessa{onApriPromesse ? " →" : ""}</div>
            {ultimaPromessa?.data_promessa_pagamento ? (
              <div className="mt-1 text-sm break-words">
                {ultimaPromessa.importo_riferimento != null && (
                  <div className="font-medium tabular-nums">{fmtEuro(ultimaPromessa.importo_riferimento)}</div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                  Scadenza promessa: {fmtData(ultimaPromessa.data_promessa_pagamento)}
                  <BadgeStatoPromessa stato={ultimaPromessa.stato_promessa} />
                  {promessaDaVerificare && <Badge variant="destructive">Da verificare</Badge>}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">—</div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Prossima pianificata</div>
            {prossima ? (
              <div className="mt-1 text-sm break-words">
                <div className="font-medium">{TIPO_LABEL[tipoAzioneVisualizzato(prossima)]}</div>
                <div className="text-muted-foreground">
                  {fmtDateTime(prossima.data_azione)}
                  {prossima.operatore_id && operatoreMap[prossima.operatore_id] ? ` · ${operatoreMap[prossima.operatore_id]}` : ""}
                </div>
                {testoProssima && (
                  <p className="mt-1 whitespace-pre-wrap break-words line-clamp-2" title={testoProssima}>{testoProssima}</p>
                )}
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">—</div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Ultima azione fatta</div>
            {ultimaFatta ? (
              <div className="mt-1 text-sm break-words">
                <div className="font-medium">{TIPO_LABEL[tipoAzioneVisualizzato(ultimaFatta)]}</div>
                <div className="text-muted-foreground">
                  {fmtDateTime(ultimaFatta.data_azione)}
                  {ultimaFatta.operatore_id && operatoreMap[ultimaFatta.operatore_id] ? ` · ${operatoreMap[ultimaFatta.operatore_id]}` : ""}
                </div>
                {testoUltima && (
                  <p className="mt-1 whitespace-pre-wrap break-words line-clamp-3" title={testoUltima}>{testoUltima}</p>
                )}
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">—</div>
            )}
          </div>
        </div>
      </Card>}

      <SollecitiInviatiLista clienteId={clienteId} onVediEmail={setViewEmail} senzaRiepilogo={senzaRiepilogo} />

      {/* Azioni dirette */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {!soloShowroom && <div className="flex min-w-0 gap-2">
          <Button size="sm" onClick={() => openNuova("nota")} className="h-11 min-w-0 flex-1 gap-1.5 sm:flex-none">
            <StickyNote className="size-4" /> Nota
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-11 min-w-0 flex-1 gap-1.5 sm:flex-none">
                <Plus className="size-4" /> Nuova azione <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {puoInviare && <DropdownMenuItem className="min-h-11" onSelect={() => setSollecitoOpen(true)}><Send /> Invia email</DropdownMenuItem>}
              <DropdownMenuItem className="min-h-11" onSelect={() => openNuova("promemoria")}><Bell /> Promemoria</DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => openNuova("telefonata")}><Phone /> Telefonata</DropdownMenuItem>
              <DropdownMenuItem className="min-h-11" onSelect={() => setPromessaOpen(true)}><HandCoins /> Registra promessa</DropdownMenuItem>
              {puoInviare && <DropdownMenuItem className="min-h-11" onSelect={() => setLetteraOpen(true)}><FileText /> Lettera</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
        {onApriScheda && <Button variant="link" onClick={onApriScheda} className="h-auto min-h-11 justify-start whitespace-normal px-0 text-left sm:ml-auto">
          Apri recupero nella scheda cliente →
        </Button>}
      </div>

      <LetteraPdfDialog
        open={letteraOpen}
        onOpenChange={setLetteraOpen}
        clienteId={clienteId}
        onGenerated={() => {
          qc.invalidateQueries({ queryKey: ["azioni-recupero-cliente", clienteId] });
        }}
      />

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (azioni?.length ?? 0) === 0 ? (
        <Card className="p-12 text-center">
          <Activity className="size-10 mx-auto text-muted-foreground/50 mb-3" />
          {soloShowroom ? (
            <p className="text-sm font-medium">Nessuna attività di recupero.</p>
          ) : (
            <>
              <p className="text-sm font-medium">Nessuna azione registrata</p>
              <p className="text-xs text-muted-foreground mt-1">
                Usa i pulsanti sopra per iniziare a tracciare l'attività di recupero.
              </p>
            </>
          )}
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
                    canEdit={canEditAzione(a)}
                    onChangeEsito={(e) => updateEsito(a.id, e)}
                    onViewEmail={() => setViewEmail(a)}
                    onEdit={() => setEditAzione(a)}
                    numeroAllegati={conteggiAllegati?.[a.id] ?? 0}
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
                    canEdit={canEditAzione(a)}
                    onChangeEsito={(e) => updateEsito(a.id, e)}
                    onViewEmail={() => setViewEmail(a)}
                    onEdit={() => setEditAzione(a)}
                    numeroAllegati={conteggiAllegati?.[a.id] ?? 0}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <InviaEmailRecuperoDialog
        open={sollecitoOpen}
        onOpenChange={setSollecitoOpen}
        clienteId={clienteId}
        modalitaIniziale="modello"
      />

      <CreaAzioneDialog
        open={creaOpen}
        onOpenChange={setCreaOpen}
        clienteId={clienteId}
        tipoIniziale={creaTipo}
      />
      <RegistraPromessaDialog
        open={promessaOpen}
        onOpenChange={setPromessaOpen}
        clienteId={clienteId}
        onCreated={invalidateRecupero}
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
              cc={viewEmail.email_cc ?? null}
              bcc={viewEmail.email_bcc ?? null}
              azioneId={viewEmail.id}
              clienteId={viewEmail.cliente_id}
            />
          )}
        </DialogContent>
      </Dialog>

      {editAzione && (
        <ModificaAzioneDialog
          key={editAzione.id}
          open={!!editAzione}
          onOpenChange={(v) => { if (!v) { invalidateRecupero(); setEditAzione(null); } }}
          azione={editAzione as AzioneModificabile}
          onSaved={invalidateRecupero}
        />
      )}

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

export function TimelineItem({
  azione, operatoreName, highlight, canEdit, onChangeEsito, onViewEmail, onEdit, numeroAllegati = 0, extra,
}: {
  extra?: ReactNode;
  azione: Azione;
  operatoreName: string | null;
  highlight?: boolean;
  canEdit: boolean;
  onChangeEsito: (e: Esito) => void;
  onViewEmail: () => void;
  onEdit: () => void;
  numeroAllegati?: number;
}) {
  const tipoVis = tipoAzioneVisualizzato(azione);
  const promessa = isPromessaPagamento(azione);
  const Icon = TIPO_ICON[tipoVis] ?? Activity;
  const [showAllegati, setShowAllegati] = useState(false);
  const { roles } = useAuth();
  const mostraInviaOra = isEmailDaInviare(azione) && puoInviareComunicazioniRecupero(roles);
  const modificabile = canEdit && !isSoloShowroom(roles as string[]);
  const [inviaOpen, setInviaOpen] = useState(false);
  const [testoEspanso, setTestoEspanso] = useState(false);
  const [testoLungo, setTestoLungo] = useState(false);
  const testoRef = useRef<HTMLParagraphElement>(null);
  const testo = testoAzione(azione);
  const ritardo = azioneInRitardo(azione);
  const statoBadge = ritardo ? "in_ritardo" : azione.esito;
  const giorniRitardo = Math.floor((Date.now() - new Date(azione.data_azione).getTime()) / 86400000);
  useEffect(() => {
    const el = testoRef.current;
    if (!el || testoEspanso) return;
    const misura = () => setTestoLungo(el.scrollHeight > el.clientHeight + 1);
    misura();
    const observer = new ResizeObserver(misura);
    observer.observe(el);
    return () => observer.disconnect();
  }, [testo, testoEspanso]);

  return (<>
    <div
      className={`min-w-0 rounded-md border p-3 space-y-2 ${highlight ? "border-warning/40 bg-warning/5" : "border-border bg-background"} ${modificabile ? "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""}`}
      role={modificabile ? "button" : undefined}
      tabIndex={modificabile ? 0 : undefined}
      aria-label={modificabile ? `Modifica ${TIPO_LABEL[tipoVis] ?? tipoVis}` : undefined}
      onClick={modificabile ? onEdit : undefined}
      onKeyDown={modificabile ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onEdit(); } } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="break-words">{TIPO_LABEL[tipoVis] ?? tipoVis}</span>
        </div>
        {promessa ? <BadgeStatoPromessa stato={azione.stato_promessa} /> :
          <Badge variant="outline" className={`shrink-0 ${ESITO_AZIONE_COLORE[statoBadge] ?? ESITO_AZIONE_COLORE.nessuna_risposta}`}>{ESITO_AZIONE_LABEL[statoBadge] ?? statoBadge}</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground break-words">
        <span>{fmtDateTime(azione.data_azione)}</span>
        {operatoreName && <span>· {operatoreName}</span>}
        {azione.importo_riferimento != null && Number(azione.importo_riferimento) > 0 && <span>· rif. {fmtEuro(azione.importo_riferimento)}</span>}
        {azione.tipo === "email" && (azione.livello_sollecito ?? 0) > 0 && <Badge variant="outline" className="text-xs">{STADIO_LABEL[azione.livello_sollecito ?? 0] ?? `Sollecito ${azione.livello_sollecito}`}</Badge>}
      </div>
      {azione.esito === "da_fare" && <div className="rounded-md bg-warning/10 px-2 py-1.5 text-sm break-words">
        Previsto per il {fmtDateTime(azione.data_azione)}
        {ritardo && <span className="text-destructive font-medium"> · in ritardo di {giorniRitardo} gg</span>}
      </div>}
      {extra}
      {testo && <div>
        <p ref={testoRef} className={`text-sm whitespace-pre-wrap break-words ${testoEspanso ? "" : "line-clamp-3"}`}>{testo}</p>
        {(testoLungo || testoEspanso) && <Button variant="link" size="sm" className="min-h-10 px-0 text-xs" onClick={(e) => { e.stopPropagation(); setTestoEspanso((v) => !v); }}>
          {testoEspanso ? "Mostra meno" : "Mostra tutto"}
        </Button>}
      </div>}
      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {(azione.tipo === "email" || azione.tipo === "promemoria_scadenza") && azione.email_corpo_html && <Button variant="link" size="sm" className="min-h-10 px-0 gap-1 text-xs" onClick={onViewEmail}><Eye className="size-3.5" /> Vedi email inviata</Button>}
        {mostraInviaOra ? <Button size="sm" className="min-h-10 gap-1.5 text-xs" onClick={() => setInviaOpen(true)}><Send className="size-3.5" /> Invia ora</Button> :
          azione.tipo !== "email" && azione.esito === "da_fare" && modificabile && <Button size="sm" variant="outline" className="min-h-10 gap-1.5 text-xs" onClick={() => onChangeEsito("fatto")}><Check className="size-3.5" /> Segna fatto</Button>}
        {numeroAllegati > 0 && <Button variant="link" size="sm" className="min-h-10 px-0 gap-1 text-xs" aria-expanded={showAllegati} onClick={() => setShowAllegati((v) => !v)}><Paperclip className="size-3.5" /> {numeroAllegati} {numeroAllegati === 1 ? "allegato" : "allegati"}</Button>}
      </div>
      {showAllegati && numeroAllegati > 0 && <div className="border-t pt-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <AllegatiSection entitaTipo="azione_recupero" entitaId={azione.id} clienteId={azione.cliente_id} canEdit={false} compact />
      </div>}
    </div>
    {mostraInviaOra && <InviaEmailRecuperoDialog open={inviaOpen} onOpenChange={setInviaOpen} clienteId={azione.cliente_id} modalitaIniziale="modello" azioneEsistenteId={azione.id} />}
  </>);
}
