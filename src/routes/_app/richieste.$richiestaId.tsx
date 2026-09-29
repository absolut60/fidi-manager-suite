import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Send, Trash2, Lock, Pencil, Ban, RotateCcw } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  STATO_LABEL, STATO_TONE, TIPO_TONE, LIVELLO_LABEL,
  formatEuro, formatDate, type TipoRichiesta, importoRichiestaValido,
  etichettaTipoRichiesta,
} from "@/lib/fidi";
import { puoDecidereRichiesta } from "@/lib/fidi";

import { ComunicazioniRichiestaPanel } from "@/components/comunicazioni-richiesta-panel";
import { AllegatiSection } from "@/components/allegati-section";
import { RICHIESTA_FIDO_SELECT } from "@/lib/richieste-fido-data";
import { getFidoAttuale } from "@/lib/fido-cliente";
import { PannelloRischioCliente } from "@/components/pannello-rischio-cliente";
import { ModificaRichiestaFidoDialog, useAnnullaRichiestaFido } from "@/components/richiesta-fido-form-dialog";
import { semaforoUI, semaforoDaCliente } from "@/lib/semaforo-ui";

export const Route = createFileRoute("/_app/richieste/$richiestaId")({
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

  // Lookup descrizione condizione di pagamento scelta sulla richiesta.
  const condPagCod = (r as any)?.condizione_pagamento_cod as string | null | undefined;
  const { data: condPagRow } = useQuery({
    queryKey: ["codici-pagamento", "single", condPagCod],
    enabled: !!condPagCod,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("codici_pagamento")
        .select("cod, descrizione")
        .eq("cod", condPagCod!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

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
      {etichettaTipoRichiesta(r.tipo, Number(r.importo_approvato ?? r.importo_richiesto))}
    </span>
  );
  const badgeStato = (
    <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ${STATO_TONE[r.stato]}`}>
      {STATO_LABEL[r.stato]}
    </span>
  );

  return (
    <div className="space-y-3">
      {/* 1) TESTATA COMPATTA — una riga su desktop, due su mobile */}
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center">
          <div className="flex min-w-0 items-start gap-2 sm:flex-1 sm:items-center sm:gap-3">
            <BackButton fallbackTo="/richieste" fallbackLabel="Richieste" iconOnly />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold leading-tight line-clamp-2">
                {cliente?.ragione_sociale ?? "—"}
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
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground"
                title="Modifica richiesta" aria-label="Modifica richiesta" onClick={() => setModificaAperta(true)}>
                <Pencil className="size-4" />
              </Button>
            )}
            {canRiinvia && (
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground"
                title="Ri-invia (nuova richiesta precompilata)" aria-label="Ri-invia richiesta" onClick={() => setRiinvioAperto(true)}>
                <RotateCcw className="size-4" />
              </Button>
            )}
            {canAnnulla && (
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive"
                title="Annulla richiesta" aria-label="Annulla richiesta" disabled={annullaMut.isPending}
                onClick={() => annullaMut.mutate({ id: r.id })}>
                <Ban className="size-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
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

      {/* 2) QUATTRO RIQUADRI COMPATTI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="col-span-2 lg:col-span-1 min-w-0 p-3 sm:p-4 border-info/40 bg-info/5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Importo richiesto
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-info break-words">
            {formatEuro(Number(r.importo_richiesto))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fido attuale <span className="font-medium text-foreground tabular-nums">{formatEuro(fidoAttuale)}</span>
            {" · "}durata <span className="font-medium text-foreground">{r.durata_mesi} mesi</span>
          </p>
          {r.importo_approvato != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Approvato: <span className="font-medium text-foreground tabular-nums">{formatEuro(Number(r.importo_approvato))}</span>
            </p>
          )}
          {condPagCod && (
            <p className="mt-0.5 text-xs text-muted-foreground break-words">
              Cond. pagamento:{" "}
              <span className="font-medium text-foreground">
                <span className="font-mono">{condPagCod}</span>
                {condPagRow?.descrizione ? ` — ${condPagRow.descrizione}` : ""}
              </span>
            </p>
          )}
        </Card>

        <Card className="min-w-0 p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Livello richiesto
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold break-words">{LIVELLO_LABEL[r.livello_richiesto]}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.stato === "in_approvazione"
              ? <>In attesa · livello corrente <span className="font-medium text-foreground">Liv. {r.livello_corrente}</span></>
              : r.stato === "bozza"
                ? "Da inviare in approvazione"
                : <>Livello corrente <span className="font-medium text-foreground">Liv. {r.livello_corrente}</span></>}
          </p>
        </Card>

        <Card className="min-w-0 p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Semaforo rischio
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block size-3 shrink-0 rounded-full ${sem.dotClass}`} />
            <span className={`text-xl sm:text-2xl font-bold ${sem.textClass}`}>{sem.label}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground break-words">{sem.motivo}</p>
        </Card>

        <Card className="col-span-2 lg:col-span-1 min-w-0 p-3 sm:p-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Richiesta
          </p>
          <dl className="mt-1 space-y-0.5 text-xs sm:text-sm">
            <Info label="Richiesto da" value={userNameDet((r as any).richiedente)} />
            <Info label="Inviata il" value={formatDate(dataInvio)} />
            <Info label="Punto vendita" value={storeNome} />
            <Info label="Scadenza fido" value={formatDate(r.data_scadenza)} />
            {(r.stato === "approvata" || r.stato === "rifiutata") && (
              <Info
                label={r.stato === "approvata" ? "Approvato da" : "Rifiutato da"}
                value={`${userNameDet((r as any).approvatore)}${(r as any).data_approvazione ? ` · ${formatDate((r as any).data_approvazione)}` : r.data_chiusura ? ` · ${formatDate(r.data_chiusura)}` : ""}`}
              />
            )}
            {r.data_chiusura && (
              <Info label="Chiusa il" value={formatDate(r.data_chiusura)} />
            )}
          </dl>
        </Card>
      </div>

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

      {/* 4) QUADRO CLIENTE — variante estesa con metric card */}
      {cliente && (
        <Card className="p-4">
          <PannelloRischioCliente cliente={cliente} variant="extended" />
        </Card>
      )}

      {/* 5) WORKFLOW (step orizzontali) + STORICO DECISIONI */}
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Workflow approvazione</h2>
        <ol className="flex flex-wrap gap-x-6 gap-y-3">
          {[1, 2, 3].slice(0, r.livello_richiesto).map((liv) => {
            const done = approvazioni?.find((a) => a.livello === liv);
            const isCurrent = r.stato === "in_approvazione" && r.livello_corrente === liv;
            return (
              <li key={liv} className="flex min-w-0 items-start gap-2">
                <div className={`size-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  done?.esito === "approvata" ? "bg-success/15 text-success" :
                  done?.esito === "rifiutata" ? "bg-destructive/15 text-destructive" :
                  isCurrent ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"
                }`}>
                  {done?.esito === "approvata" ? <Check className="size-3.5" /> :
                   done?.esito === "rifiutata" ? <X className="size-3.5" /> : liv}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">Livello {liv}</p>
                  {done ? (
                    <p className="text-xs text-muted-foreground break-words">
                      {done.esito === "approvata" ? "Approvato" : "Rifiutato"} da {(done as any).profili?.nome ?? "—"} {(done as any).profili?.cognome ?? ""} il {formatDate(done.created_at)}
                    </p>
                  ) : isCurrent ? (
                    <p className="text-xs text-info">In attesa di decisione</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Da svolgere</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {approvazioni && approvazioni.length > 0 && (
          <div className="border-t pt-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Storico decisioni</h3>
            <ul className="space-y-1">
              {approvazioni.map((a) => (
                <li key={a.id} className="text-sm border-l-2 pl-2 break-words"
                  style={{ borderColor: a.esito === "approvata" ? "var(--success)" : "var(--destructive)" }}>
                  <strong>Liv. {a.livello}</strong> — {a.esito === "approvata" ? "Approvata" : "Rifiutata"}
                  {a.importo_approvato && ` · ${formatEuro(Number(a.importo_approvato))}`}
                  <span className="text-xs text-muted-foreground">
                    {" · "}{(a as any).profili?.nome ?? ""} {(a as any).profili?.cognome ?? ""} · {formatDate(a.created_at)}
                  </span>
                  {a.note && <span className="text-xs"> — {a.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 6) ALLEGATI + COMUNICAZIONI (affiancati su xl) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Card className="p-4 min-w-0">
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

        {r.stato !== "bozza" && r.created_by && (
          <div className="min-w-0">
            <ComunicazioniRichiestaPanel richiestaId={r.id} richiestaCreatedBy={r.created_by} />
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
    <Card className="p-4 border-muted bg-muted/30">
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

function ApprovaForm({ richiesta }: { richiesta: any; userId: string }) {
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
    <Card className="p-4 border-info/40 bg-info/5">
      <h2 className="font-semibold mb-2">
        Decisione <span className="text-xs font-normal text-muted-foreground">(richiede livello {richiesta.livello_richiesto})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="importo_app">Importo da approvare (€)</Label>
          <Input
            id="importo_app"
            type="number"
            step="0.01"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note_app">Note</Label>
          <Textarea
            id="note_app"
            rows={1}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivazione (opzionale)"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button
          onClick={() => decide.mutate("approvata")}
          disabled={decide.isPending}
          className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
        >
          <Check className="size-4" /> Approva
        </Button>
        <Button
          variant="outline"
          onClick={() => decide.mutate("rifiutata")}
          disabled={decide.isPending}
          className="gap-1.5 text-destructive hover:text-destructive border-destructive/30"
        >
          <X className="size-4" /> Rifiuta
        </Button>
      </div>
    </Card>
  );
}
