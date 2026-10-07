import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Send, Trash2, Lock, Pencil, Ban, RotateCcw, ExternalLink } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  STATO_LABEL, STATO_TONE, TIPO_TONE, LIVELLO_LABEL,
  formatEuro, formatDate, type TipoRichiesta, importoRichiestaValido,
  etichettaTipoRichiesta,
} from "@/lib/fidi";
import { puoDecidereRichiesta } from "@/lib/fidi";

import { ComunicazioniRichiestaPanel } from "@/components/comunicazioni-richiesta-panel";
import { AllegatiSection } from "@/components/allegati-section";
import { CambioCondizionePagamento } from "@/components/cambio-condizione-pagamento";
import { CondizionePagamentoTesto, etichettaCondizionePagamento, useCodiciPagamento } from "@/components/condizione-pagamento-richiesta-select";
import { RICHIESTA_FIDO_SELECT, mapRichiestaFido, importoPerEtichettaTipo } from "@/lib/richieste-fido-data";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { PannelloRischioCliente } from "@/components/pannello-rischio-cliente";
import { ModificaRichiestaFidoDialog, useAnnullaRichiestaFido } from "@/components/richiesta-fido-form-dialog";
import { semaforoUI, semaforoDaCliente } from "@/lib/semaforo-ui";

export const Route = createFileRoute("/_app/richieste/$richiestaId")({
  head: () => ({ meta: [
    { title: "Decisione richiesta fido | FidiManager" },
    { name: "description", content: "Dettaglio e decisioni su fido e condizioni di pagamento della richiesta MADE." },
    { property: "og:title", content: "Decisione richiesta fido | FidiManager" },
    { property: "og:description", content: "Dettaglio e decisioni su fido e condizioni di pagamento della richiesta MADE." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: RichiestaDetail,
});


function RichiestaDetail() {
  const { richiestaId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, roles } = useAuth();

  const { data: r, isLoading } = useQuery({
    queryKey: ["richiesta", richiestaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("richieste_fido")
        .select(RICHIESTA_FIDO_SELECT)
        .eq("id", richiestaId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Condizione di pagamento proposta (descrizione dal hook unico dei codici).
  const condPagCod = (r as any)?.condizione_pagamento_cod as string | null | undefined;
  const vistaR = r ? mapRichiestaFido(r) : null;

  const { data: approvazioni } = useQuery({
    queryKey: ["approvazioni", richiestaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvazioni")
        .select("*, profili:approvatore_id(nome, cognome, email)")
        .eq("richiesta_id", richiestaId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!richiestaId || !user?.id) return;
    (supabase as any).rpc("marca_comunicazioni_lette", { _richiesta_id: richiestaId }).then(() => {
      qc.invalidateQueries({ queryKey: ["msg-non-letti-richieste"] });
      qc.invalidateQueries({ queryKey: ["comunicazioni-non-lette"] });
    });
  }, [richiestaId, user?.id, qc]);

  const isAdmin = roles.includes("amministratore");
  const isAmministrazione = roles.includes("amministrazione");
  const livelloUtente =
    roles.includes("approvatore_liv3") ? 3 :
    roles.includes("approvatore_liv2") ? 2 :
    roles.includes("approvatore_liv1") ? 1 : 0;

  const canApprove = r?.stato === "in_approvazione" &&
    puoDecidereRichiesta(roles, r?.livello_richiesto ?? 99);
  const isOwner = !!user?.id && r?.created_by === user.id;
  const canDelete = isAdmin || isAmministrazione || isOwner;
  const canSubmit = r?.stato === "bozza" && r?.created_by === user?.id;
  // Azioni spostate dalla lista (stesse condizioni dei pulsanti di riga tolti):
  // Modifica: bozza, oppure richiesta creata dall'utente.
  const canEdit = r?.stato === "bozza" || isOwner;
  // Annulla: richiesta in integrazioni e utente che NON puo' decidere a quel livello.
  const puoDecidereLivello = isAdmin || (livelloUtente > 0 && livelloUtente >= (r?.livello_richiesto ?? 99));
  const canAnnulla = r?.stato === "integrazioni_richieste" && !puoDecidereLivello;
  // Ri-invia: richiesta rifiutata o annullata (nuovo modulo precompilato).
  const canRiinvia = r?.stato === "rifiutata" || r?.stato === "annullata";
  const [modificaAperta, setModificaAperta] = useState(false);
  const [riinvioAperto, setRiinvioAperto] = useState(false);
  const aggiornaDopoAzione = () => {
    qc.invalidateQueries({ queryKey: ["richiesta", richiestaId] });
    qc.invalidateQueries({ queryKey: ["richieste"] });
    qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
  };
  const annullaMut = useAnnullaRichiestaFido(aggiornaDopoAzione);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("richieste_fido")
        .update({ stato: "in_approvazione" })
        .eq("id", richiestaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta inviata in approvazione");
      qc.invalidateQueries({ queryKey: ["richiesta", richiestaId] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("richieste_fido").delete().eq("id", richiestaId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Richiesta eliminata");
      await Promise.all([
        qc.refetchQueries({ queryKey: ["richieste"], type: "active" }),
        qc.refetchQueries({ queryKey: ["approvazioni-queue"], type: "active" }),
        qc.refetchQueries({ queryKey: ["richieste-cliente"], type: "active" }),
        qc.refetchQueries({ queryKey: ["msg-non-letti-richieste"], type: "active" }),
        qc.refetchQueries({ queryKey: ["comunicazioni-non-lette"], type: "active" }),
      ]);
      qc.invalidateQueries({ queryKey: ["richieste"] });
      qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
      navigate({ to: "/richieste" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!r)
    return (
      <div className="text-center py-12">
        <p>Richiesta non trovata</p>
        <Link to="/richieste" className="text-primary text-sm">← Torna alla lista</Link>
      </div>
    );

  const cliente = (r as any).clienti;
  const fidoAttuale = getFidoAttuale(cliente);
  const semRaw = semaforoDaCliente(cliente);
  const sem = semaforoUI(semRaw.stadio, semRaw.motivo);
  const storeNome = cliente?.stores?.nome ?? (r as any).stores?.nome ?? "—";
  const dataInvio = r.data_invio ?? (r.stato !== "bozza" ? r.created_at : null);

  const badgeTipo = (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>
      {etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}
    </span>
  );
  const badgeStato = (
    <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ${STATO_TONE[r.stato]}`}>
      {STATO_LABEL[r.stato]}
    </span>
  );

  return (
    <div className="space-y-1.5">
      {/* 1) TESTATA COMPATTA — una riga su desktop, due su mobile */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center">
          <div className="flex min-w-0 items-start gap-2 sm:flex-1 sm:items-center sm:gap-3">
            <BackButton fallbackTo="/richieste" fallbackLabel="Richieste" iconOnly />
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight break-words">
                <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }} className="hover:underline">
                  {cliente?.ragione_sociale ?? "—"}{" "}
                  <ExternalLink className="inline size-3.5 shrink-0 align-baseline" aria-hidden />
                </Link>
              </h1>
              <p className="text-xs text-muted-foreground leading-snug">
                Richiesta del {formatDate(r.created_at)}
                {cliente?.partita_iva ? ` · P.IVA ${cliente.partita_iva}` : ""}
                {storeNome !== "—" ? ` · ${storeNome}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden items-center gap-2 sm:flex">{badgeTipo}{badgeStato}</div>
            {canEdit && (
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground"
                title="Modifica richiesta" aria-label="Modifica richiesta" onClick={() => setModificaAperta(true)}>
                <Pencil className="size-4" />
              </Button>
            )}
            {canRiinvia && (
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground"
                title="Ri-invia (nuova richiesta precompilata)" aria-label="Ri-invia richiesta" onClick={() => setRiinvioAperto(true)}>
                <RotateCcw className="size-4" />
              </Button>
            )}
            {canAnnulla && (
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-destructive"
                title="Annulla richiesta" aria-label="Annulla richiesta" disabled={annullaMut.isPending}
                onClick={() => annullaMut.mutate({ id: r.id })}>
                <Ban className="size-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 sm:h-9 sm:w-9 text-muted-foreground hover:text-destructive"
                title="Elimina richiesta"
                onClick={() => {
                  const msg = r.stato === "approvata"
                    ? "⚠️ Questa richiesta è GIÀ APPROVATA e potrebbe essere già stata esportata nel gestionale. Eliminarla può creare disallineamenti. L'operazione è irreversibile. Procedere?"
                    : (r.stato === "in_approvazione" || r.stato === "integrazioni_richieste")
                    ? "Questa richiesta è in approvazione: eliminandola l'iter verrà interrotto. L'operazione è irreversibile. Procedere?"
                    : "Eliminare definitivamente questa richiesta?";
                  if (confirm(msg)) deleteMutation.mutate();
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:hidden">{badgeTipo}{badgeStato}</div>
      </div>

      {/* 2) DATI DELLA RICHIESTA — una fascia, senza ripetizioni */}
      <Card className="grid grid-cols-1 md:grid-cols-3 xl:flex xl:flex-wrap gap-x-3 gap-y-1 p-2.5 [&>div]:min-w-0 [&>div]:xl:grow [&>div]:xl:border-r [&>div]:xl:pr-3 [&>div:last-child]:border-r-0">
        <div className="xl:basis-72">
          <p className="text-[10px] uppercase text-muted-foreground">Importo richiesto</p>
          <p className="text-base font-bold text-info tabular-nums break-words">
            {formatEuro(Number(r.importo_richiesto))}{" "}
            <span className="text-xs font-normal text-muted-foreground">attuale <span className="tabular-nums">{formatEuro(fidoAttuale)}</span> · {r.durata_mesi} mesi</span>
          </p>
          {vistaR?.soloCondizione ? (
            <p className="text-xs font-medium break-words">Fido non approvato · approvato solo il cambio di condizione di pagamento</p>
          ) : r.importo_approvato != null && (
            <p className="text-xs text-muted-foreground break-words">Approvato: <span className="font-medium text-foreground tabular-nums">{formatEuro(Number(r.importo_approvato))}</span>
              {vistaR?.esitoFido === "approvata" && vistaR?.esitoCondPag === "rifiutata" && " · condizione di pagamento non cambiata"}
            </p>
          )}
        </div>
        <div className="xl:basis-56">
          <p className="text-[10px] uppercase text-muted-foreground">Livello</p>
          <p className="text-sm font-semibold break-words">{LIVELLO_LABEL[r.livello_richiesto]}</p>
          <ol className="flex min-w-0 flex-wrap items-center gap-1 mt-0.5" aria-label="Workflow approvazione">
            {[1, 2, 3].slice(0, r.livello_richiesto).map((liv) => {
              const done = approvazioni?.find((a) => a.livello === liv);
              const isCurrent = r.stato === "in_approvazione" && r.livello_corrente === liv;
              const dettaglio = `Livello ${liv} — ${done
                ? `${done.esito === "approvata" ? "Approvato" : "Rifiutato"} da ${(done as any).profili?.nome ?? "—"} ${(done as any).profili?.cognome ?? ""} il ${formatDate(done.created_at)}`
                : isCurrent ? "In attesa di decisione" : "Da svolgere"}`;
              return (
                <li key={liv} className="shrink-0">
                  <span title={dettaglio} aria-label={dettaglio} className={`size-5 rounded-full flex items-center justify-center text-xs font-semibold ${
                    done?.esito === "approvata" ? "bg-success/15 text-success" :
                    done?.esito === "rifiutata" ? "bg-destructive/15 text-destructive" :
                    isCurrent ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
                  }`}>
                    {done?.esito === "approvata" ? <Check className="size-3.5" /> :
                      done?.esito === "rifiutata" ? <X className="size-3.5" /> : liv}
                  </span>
                </li>
              );
            })}
            {r.stato === "in_approvazione" && <li className="min-w-0 text-xs text-info break-words">Liv. {r.livello_corrente} in attesa di decisione</li>}
            {r.stato === "bozza" && <li className="min-w-0 text-xs text-muted-foreground break-words">Da inviare in approvazione</li>}
          </ol>
        </div>
        <div className="xl:basis-56">
          <p className="text-[10px] uppercase text-muted-foreground">Semaforo</p>
          <p className="text-sm break-words">
            <span className={`inline-block size-2 shrink-0 rounded-full ${sem.dotClass}`} />{" "}
            <span className={`font-semibold ${sem.textClass}`}>{sem.label}</span>{" "}
            <span className="text-xs text-muted-foreground">{sem.motivo}</span>
          </p>
        </div>
        <div className="xl:basis-48">
          <p className="text-[10px] uppercase text-muted-foreground">Richiesto da</p>
          <p className="text-sm font-semibold break-words">{userNameDet((r as any).richiedente)} <span className="text-xs font-normal text-muted-foreground">· inviata il {formatDate(dataInvio)}</span></p>
        </div>
        <div className="xl:basis-24">
          <p className="text-[10px] uppercase text-muted-foreground">Scadenza fido</p>
          <p className="text-sm font-semibold tabular-nums">{formatDate(r.data_scadenza)}</p>
        </div>
        {(r.stato === "approvata" || r.stato === "rifiutata") && (
          <div className="xl:basis-48">
            <p className="text-[10px] uppercase text-muted-foreground">{r.stato === "approvata" ? "Approvato da" : "Rifiutato da"}</p>
            <p className="text-sm font-semibold break-words">{`${userNameDet((r as any).approvatore)}${(r as any).data_approvazione ? ` · ${formatDate((r as any).data_approvazione)}` : r.data_chiusura ? ` · ${formatDate(r.data_chiusura)}` : ""}`}</p>
          </div>
        )}
        {r.data_chiusura && <div className="xl:basis-24"><p className="text-[10px] uppercase text-muted-foreground">Chiusa il</p><p className="text-sm font-semibold tabular-nums">{formatDate(r.data_chiusura)}</p></div>}
      </Card>

      {!(r.stato === "in_approvazione" && canApprove && vistaR?.cambioCondPag) && <CambioCondizionePagamento variant="blocco" richiesta={r} />}

      <ModificaRichiestaFidoDialog richiesta={r} open={modificaAperta} onOpenChange={setModificaAperta} onSaved={aggiornaDopoAzione} />
      <ModificaRichiestaFidoDialog richiesta={r} riinvia open={riinvioAperto} onOpenChange={setRiinvioAperto} onSaved={aggiornaDopoAzione} />

      {/* Motivazione — riga compatta */}
      {r.motivazione && <MotivazioneRiga testo={r.motivazione} />}

      {/* 3) BOX DECISIONE — subito sotto, raggiungibile senza scrollare */}
      {r.stato === "in_approvazione" && (
        canApprove
          ? <ApprovaForm richiesta={r} userId={user!.id} />
          : <DecisioneReadOnly livelloRichiesto={r.livello_richiesto} livelloUtente={livelloUtente} />
      )}

      {/* Invio bozza */}
      {canSubmit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="gap-1.5">
            <Send className="size-4" /> Invia in approvazione
          </Button>
        </div>
      )}

      {/* Quadro, storico e allegati a sinistra; comunicazioni allineate in alto. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-start">
        <div className={`min-w-0 space-y-2 ${r.stato !== "bozza" && r.created_by ? "lg:col-span-7" : "lg:col-span-12"}`}>
      {cliente && (
        <Card className="p-2.5">
          <PannelloRischioCliente cliente={cliente} variant="extended"
            linkScadenze={
              <Button asChild variant="outline" size="sm" className="h-10 sm:h-7 max-w-full whitespace-normal text-xs px-3">
                <Link to="/clienti/$clienteId" params={{ clienteId: r.cliente_id }}
                  search={{ tab: "insoluti", insolutiTab: "scadenziario" }}>
                  <ExternalLink className="size-3.5 shrink-0" /> Apri scadenze del cliente
                </Link>
              </Button>
            }
          />
        </Card>
      )}
        {approvazioni && approvazioni.length > 0 && (
          <Card className="p-2.5 min-w-0">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Storico decisioni</h3>
            <ul className="space-y-1">
              {approvazioni.map((a) => (
                <li key={a.id} className="text-sm border-l-2 pl-2 break-words"
                  style={{ borderColor: a.esito === "approvata" ? "var(--success)" : "var(--destructive)" }}>
                  <strong>Liv. {a.livello}</strong> —{" "}
                  {(a as any).esito_fido ? (
                    <>
                      Fido: {(a as any).esito_fido === "approvata"
                        ? `approvato ${formatEuro(Number(a.importo_approvato ?? 0))}`
                        : "non approvato"}
                      {(a as any).esito_condizione_pagamento && (
                        <> · Condizione: {(a as any).esito_condizione_pagamento === "approvata" ? "approvata" : "non approvata"}</>
                      )}
                    </>
                  ) : (
                    <>
                      {a.esito === "approvata" ? "Approvata" : "Rifiutata"}
                      {a.importo_approvato && ` · ${formatEuro(Number(a.importo_approvato))}`}
                    </>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {" · "}{(a as any).profili?.nome ?? ""} {(a as any).profili?.cognome ?? ""} · {formatDate(a.created_at)}
                  </span>
                  {a.note && <span className="text-xs"> — {a.note}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-2.5 min-w-0 [&_h3]:text-sm">
          <AllegatiSection
            entitaTipo="richiesta_fido"
            entitaId={r.id}
            clienteId={r.cliente_id}
            title="Allegati richiesta"
            canEdit={
              isAdmin ||
              isAmministrazione ||
              roles.includes("direzione") ||
              livelloUtente > 0 ||
              isOwner
            }
          />
        </Card>
        </div>
        {r.stato !== "bozza" && r.created_by && (
          <div className="min-w-0 lg:col-span-5">
            <ComunicazioniRichiestaPanel richiestaId={r.id} richiestaCreatedBy={r.created_by} compatto />
          </div>
        )}
      </div>
    </div>
  );
}

function userNameDet(p: any): string {
  if (!p) return "—";
  const n = `${p.nome ?? ""} ${p.cognome ?? ""}`.trim();
  return n || p.email || "—";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 font-medium break-words">{value}</dd>
    </div>
  );
}

function MotivazioneRiga({ testo }: { testo: string }) {
  const [aperta, setAperta] = useState(false);
  const lunga = testo.length > 240 || testo.split("\n").length > 3;
  return (
    <div className="text-sm min-w-0">
      <p className={`whitespace-pre-wrap break-words ${!aperta && lunga ? "line-clamp-3" : ""}`}>
        <span className="font-medium text-muted-foreground">Motivazione: </span>
        {testo}
      </p>
      {lunga && (
        <button type="button" className="text-xs text-primary hover:underline mt-0.5" onClick={() => setAperta((v) => !v)}>
          {aperta ? "mostra meno" : "mostra tutto"}
        </button>
      )}
    </div>
  );
}

function DecisioneReadOnly({
  livelloRichiesto,
  livelloUtente,
}: { livelloRichiesto: number; livelloUtente: number }) {
  return (
    <Card className="p-2.5 border-muted bg-muted/30">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Lock className="size-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold">Decisione</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Richiede approvatore di livello <strong className="text-foreground">{livelloRichiesto}</strong>.
            {livelloUtente > 0
              ? ` Il tuo livello (${livelloUtente}) non è sufficiente.`
              : " Non hai i permessi per decidere su questa richiesta."}
          </p>
        </div>
      </div>
    </Card>
  );
}

function ApprovaForm({ richiesta, userId }: { richiesta: any; userId: string }) {
  const vista = mapRichiestaFido(richiesta);
  if (vista.cambioCondPag) return <ApprovaDoppiaForm richiesta={richiesta} />;
  return <ApprovaSempliceForm richiesta={richiesta} userId={userId} />;
}

function useInvalidaDopoDecisione(richiestaId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["richiesta", richiestaId] });
    qc.invalidateQueries({ queryKey: ["approvazioni", richiestaId] });
    qc.invalidateQueries({ queryKey: ["richieste"] });
    qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
  };
}

type Scelta = "approvata" | "rifiutata" | null;

/** Box decisione per richieste con cambio di condizione: due decisioni distinte. */
export function ApprovaDoppiaForm({ richiesta }: { richiesta: any }) {
  const vista = mapRichiestaFido(richiesta);
  const invalida = useInvalidaDopoDecisione(richiesta.id);
  const [importo, setImporto] = useState<string>(String(richiesta.importo_richiesto));
  const [note, setNote] = useState("");
  const [sceltaFido, setSceltaFido] = useState<Scelta>(null);
  const [sceltaCond, setSceltaCond] = useState<Scelta>(null);
  const { data: codiciPagamento } = useCodiciPagamento();
  const proposta = etichettaCondizionePagamento(codiciPagamento, vista.condPagProposta);
  const importoNum = Number(importo);
  const complete = sceltaFido !== null && sceltaCond !== null;
  const richiestoNum = Number(richiesta.importo_richiesto);
  const diversoDalRichiesto =
    importo.trim() !== "" && Number.isFinite(importoNum) && Number.isFinite(richiestoNum) && importoNum !== richiestoNum;

  const riepilogo = !complete
    ? "Scegli una decisione per il fido e una per la condizione di pagamento."
    : `${sceltaFido === "approvata"
        ? `Fido approvato per ${Number.isFinite(importoNum) && importo.trim() !== "" ? formatEuro(importoNum) : "—"}`
        : "Fido NON approvato"} · condizione di pagamento ${sceltaCond === "approvata" ? `cambiata in ${proposta}` : "NON cambiata"}`;

  const decide = useMutation({
    mutationFn: async () => {
      if (!sceltaFido || !sceltaCond) throw new Error("Completa entrambe le decisioni");
      if (sceltaFido === "approvata") {
        if (importo.trim() === "" || !Number.isFinite(importoNum)) {
          throw new Error("Inserisci l'importo approvato");
        }
        if (!importoRichiestaValido(richiesta.tipo, importoNum)) {
          throw new Error("Importo 0 ammesso solo per diminuzione (azzeramento) o rinnovo");
        }
      }
      const esito = sceltaFido === "approvata" || sceltaCond === "approvata" ? "approvata" : "rifiutata";
      const { error } = await (supabase as any).rpc("processa_richiesta_fido", {
        _richiesta_id: richiesta.id,
        _esito: esito,
        _note: note || null,
        _importo_approvato: sceltaFido === "approvata" ? importoNum : null,
        _esito_fido: sceltaFido,
        _esito_condizione: sceltaCond,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      const msg =
        sceltaFido === "approvata" && sceltaCond === "approvata" ? `Fido approvato · condizione di pagamento cambiata in ${proposta}`
        : sceltaFido === "approvata" ? "Fido approvato · condizione di pagamento non cambiata"
        : sceltaCond === "approvata" ? `Approvato solo il cambio di condizione di pagamento in ${proposta}`
        : "Richiesta rifiutata";
      toast.success(msg);
      invalida();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-2.5 border-info/40 bg-info/5 space-y-2 min-w-0">
      <h2 className="text-sm font-semibold">Decisione <span className="text-xs font-normal text-muted-foreground">(richiede livello {richiesta.livello_richiesto})</span></h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 min-w-0">
        <div className={`min-w-0 rounded-md border p-2.5 space-y-2 ${sceltaFido === "approvata" ? "border-success bg-success/5" : sceltaFido === "rifiutata" ? "border-destructive bg-destructive/5" : "bg-background"}`}>
          <h3 className="text-[11px] uppercase font-semibold text-muted-foreground">1 · Fido</h3>
          <ConfrontoFido richiesta={richiesta} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Label htmlFor="importo_app" className="text-xs">Importo da approvare</Label>
            <Input id="importo_app" type="number" step="0.01" value={importo} className="w-32 h-10 sm:h-8 text-sm tabular-nums bg-background border-input"
              aria-label="Importo da approvare (€)" placeholder="Importo €" disabled={sceltaFido === "rifiutata"} onChange={(e) => setImporto(e.target.value)} />
            {diversoDalRichiesto && (
              <span className="text-xs text-warning break-words">diverso dal richiesto ({formatEuro(richiestoNum)})</span>
            )}
            <SceltaDoppia value={sceltaFido} onChange={setSceltaFido} />
          </div>
        </div>
        <div className={`min-w-0 rounded-md border p-2.5 space-y-2 ${sceltaCond === "approvata" ? "border-success bg-success/5" : sceltaCond === "rifiutata" ? "border-destructive bg-destructive/5" : "bg-background"}`}>
          <h3 className="text-[11px] uppercase font-semibold text-muted-foreground">2 · Condizione di pagamento</h3>
          <div className="grid min-w-0 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div className="min-w-0 rounded bg-muted/50 px-2 py-1">
              <p className="text-[10px] uppercase text-muted-foreground">Attuale</p>
              <p className="text-sm text-muted-foreground break-words"><CondizionePagamentoTesto cod={vista.condPagRiferimento} descFallback={vista.condPagPrecedente ? null : vista.condPagAttualeDesc} /></p>
            </div>
            <span className="text-sm text-muted-foreground justify-self-center" aria-hidden>→</span>
            <div className="min-w-0 rounded border border-warning/50 bg-warning/10 px-2 py-1">
              <p className="text-[10px] uppercase text-muted-foreground">Proposta</p>
              <p className="text-sm font-semibold break-words"><CondizionePagamentoTesto cod={vista.condPagProposta} /></p>
            </div>
          </div>
          <SceltaDoppia value={sceltaCond} onChange={setSceltaCond} />
        </div>
      </div>
      <div className="border-t pt-2 space-y-2">
        <p className={`min-w-0 break-words tabular-nums ${complete ? "text-sm font-medium text-foreground" : "text-xs text-muted-foreground"}`}>{riepilogo}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input id="note_app" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-0 flex-1 basis-48 h-10 sm:h-8 text-sm" aria-label="Note" placeholder="Note / motivazione (opzionale)" />
          <Button type="button" variant="outline" size="sm" className="h-10 sm:h-8 text-xs px-3 border-success/40 text-success hover:text-success"
            onClick={() => { setSceltaFido("approvata"); setSceltaCond("approvata"); }}>Approva tutto</Button>
          <Button type="button" variant="outline" size="sm" className="h-10 sm:h-8 text-xs px-3 border-destructive/30 text-destructive hover:text-destructive"
            onClick={() => { setSceltaFido("rifiutata"); setSceltaCond("rifiutata"); }}>Rifiuta tutto</Button>
          <Button className="h-10 sm:h-8 text-xs px-3 gap-1 sm:ml-2" disabled={!complete || decide.isPending} onClick={() => decide.mutate()}>
            <Check className="size-4" /> Conferma decisione
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Confronto solo visivo: il valore gestionale non modifica l'importo da approvare. */
function ConfrontoFido({ richiesta }: { richiesta: any }) {
  const attuale = getFidoAttuale(richiesta.clienti);
  const richiesto = Number(richiesta.importo_richiesto);
  const differenza = richiesto - attuale;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
      <span className="text-sm text-muted-foreground">{formatEuro(attuale)}</span>
      <span className="text-sm text-muted-foreground" aria-hidden>→</span>
      <strong className="text-base font-bold">{formatEuro(richiesto)}</strong>
      {differenza !== 0 && (
        <span className={`inline-flex max-w-full rounded-md border px-1.5 py-0.5 text-xs font-medium ${differenza > 0 ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}`}>
          {differenza > 0 ? "+" : ""}{formatEuro(differenza)}
        </span>
      )}
    </div>
  );
}

function SceltaDoppia({ value, onChange }: { value: Scelta; onChange: (v: Scelta) => void }) {
  return (
    <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
      <Button type="button" variant={value === "approvata" ? "default" : "outline"}
        className={`h-10 sm:h-8 min-w-0 px-3 text-xs gap-1 ${value === "approvata" ? "bg-success text-success-foreground hover:bg-success/90" : ""}`}
        aria-pressed={value === "approvata"} onClick={() => onChange("approvata")}>
        <Check className="size-4" /> Approva
      </Button>
      <Button type="button" variant={value === "rifiutata" ? "default" : "outline"}
        className={`h-10 sm:h-8 min-w-0 px-3 text-xs gap-1 ${value === "rifiutata" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "text-destructive hover:text-destructive border-destructive/30"}`}
        aria-pressed={value === "rifiutata"} onClick={() => onChange("rifiutata")}>
        <X className="size-4" /> Non approvare
      </Button>
    </div>
  );
}

function ApprovaSempliceForm({ richiesta }: { richiesta: any; userId: string }) {
  const qc = useQueryClient();
  const [importo, setImporto] = useState<string>(String(richiesta.importo_richiesto));
  const [note, setNote] = useState("");

  const decide = useMutation({
    mutationFn: async (esito: "approvata" | "rifiutata") => {
      const importoNum = Number(importo);
      if (esito === "approvata") {
        if (importo.trim() === "" || !Number.isFinite(importoNum)) {
          throw new Error("Inserisci l'importo approvato");
        }
        if (!importoRichiestaValido(richiesta.tipo, importoNum)) {
          throw new Error("Importo 0 ammesso solo per diminuzione (azzeramento) o rinnovo");
        }
      }
      const { error } = await (supabase as any).rpc("processa_richiesta_fido", {
        _richiesta_id: richiesta.id,
        _esito: esito,
        _note: note || null,
        _importo_approvato: esito === "approvata" ? importoNum : null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, esito) => {
      toast.success(esito === "approvata" ? "Approvazione registrata" : "Richiesta rifiutata");
      qc.invalidateQueries({ queryKey: ["richiesta", richiesta.id] });
      qc.invalidateQueries({ queryKey: ["approvazioni", richiesta.id] });
      qc.invalidateQueries({ queryKey: ["richieste"] });
      qc.invalidateQueries({ queryKey: ["approvazioni-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-2.5 border-info/40 bg-info/5 space-y-1.5">
      <CambioCondizionePagamento variant="riga" richiesta={richiesta} />
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <h2 className="text-sm font-semibold shrink-0">Decisione <span className="text-xs font-normal text-muted-foreground">(livello {richiesta.livello_richiesto})</span></h2>
        <ConfrontoFido richiesta={richiesta} />
        <Input id="importo_app" className="w-28 h-10 sm:h-8 text-sm tabular-nums" type="number" step="0.01" value={importo}
          aria-label="Importo da approvare (€)" placeholder="Importo €" onChange={(e) => setImporto(e.target.value)} />
        <Input id="note_app" className="min-w-0 flex-1 h-10 sm:h-8 text-sm" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" placeholder="Note / motivazione (opzionale)" />
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button onClick={() => decide.mutate("approvata")} disabled={decide.isPending} className="h-10 sm:h-8 text-xs px-3 gap-1 bg-success text-success-foreground hover:bg-success/90"><Check className="size-4" /> Approva</Button>
          <Button variant="outline" onClick={() => decide.mutate("rifiutata")} disabled={decide.isPending} className="h-10 sm:h-8 text-xs px-3 gap-1 text-destructive hover:text-destructive border-destructive/30"><X className="size-4" /> Rifiuta</Button>
        </div>
      </div>
    </Card>
  );
}
