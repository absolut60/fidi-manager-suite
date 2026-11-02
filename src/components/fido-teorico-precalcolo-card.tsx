/**
 * Card e pulsante per il ricalcolo del precalcolo persistente del fido teorico.
 * Il pulsante avvia sul server lo stesso job Inngest dell'automatico
 * (avvia → blocchi → finalizza → aggiorna_alert_fidi → avvisi; mai il legacy ricalcola_fido_teorico).
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Calculator, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ricalcoloFidoAvvia } from "@/lib/fido-teorico-precalcolo.functions";
import { intervalloAttesaPrecalcolo } from "@/lib/precalcolo-polling";
import {
  elencoMancantiTesto,
  istanteDa,
  leggiStatoImportCompleti,
} from "@/lib/fido-teorico-import-completi";
import {
  LOCK_CHIAVE,
  barraRicalcolo,
  ricalcoloAttivo,
  type RigaLock,
} from "@/lib/fido-teorico-ricalcolo-lock";
import { RiquadroRicalcoloFido } from "@/components/ricalcolo-fido-barra";

const TESTO_ATTENDI = "Attendi la fine del ricalcolo in corso";

const POLL_MS = 5_000;

function formatData(iso: string | null): string | null {
  if (!iso) return null;
  const t = istanteDa(iso);
  if (t === null) return null;
  const d = new Date(t);
  return `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} del ${d.toLocaleDateString("it-IT")}`;
}

function useStatoPrecalcolo(pollingAttivo = false) {
  const attesaDa = useRef<number | null>(null);
  return useQuery({
    queryKey: ["fido-teorico-precalcolo-stato"],
    queryFn: async () => {
      const [stato, orig, cnt, imp, lock] = await Promise.all([
        leggiStatoImportCompleti(supabase),
        supabase
          .from("configurazioni")
          .select("valore")
          .eq("chiave", "fido_teorico_ultimo_ricalcolo_origine")
          .maybeSingle(),
        supabase
          .from("fido_teorico_cliente" as never)
          .select("cliente_id", { count: "exact", head: true }),
        supabase
          .from("importazioni")
          .select("created_at")
          .in("stato", ["completata", "completata_con_errori"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("configurazioni")
          .select("valore, updated_at")
          .eq("chiave", LOCK_CHIAVE)
          .maybeSingle(),
      ]);
      return {
        ultimoRicalcolo: stato.ultimoRicalcolo,
        origine: (orig.data?.valore as string | undefined) ?? null,
        importCompleti: stato,
        righe: cnt.count ?? 0,
        ultimoImport: (imp.data?.created_at as string | undefined) ?? null,
        lock: (lock.data as RigaLock | null) ?? null,
      };
    },
    staleTime: pollingAttivo ? 0 : 30_000,
    refetchInterval: (query) => {
      if (pollingAttivo) return POLL_MS;
      // Ricalcolo in corso (automatico o di un altro utente): avanzamento letto dal DB.
      if (ricalcoloAttivo(query.state.data?.lock ?? null, Date.now())) return POLL_MS;
      const pronto = query.state.data?.importCompleti.pronto === true;
      if (!pronto) attesaDa.current = null;
      else if (attesaDa.current === null) attesaDa.current = Date.now();
      return intervalloAttesaPrecalcolo(pronto, attesaDa.current, Date.now());
    },
  });
}

/**
 * Il pulsante prende il lock e invia il job Inngest (stesso job dell'automatico):
 * nessun blocco gira nella pagina. Avanzamento, fasi e "avviato da …" si leggono
 * solo dal lock, per tutti, compreso chi ha cliccato.
 */
function useRicalcolo() {
  const qc = useQueryClient();
  const avvia = useServerFn(ricalcoloFidoAvvia);
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const esegui = async () => {
    if (invio) return;
    setInvio(true); setErrore(null);
    try {
      await avvia();
      toast.success("Ricalcolo avviato: prosegue sul server anche se chiudi la pagina");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErrore(m);
      toast.error(`Ricalcolo non avviato: ${m}`);
    } finally {
      setInvio(false);
      qc.invalidateQueries({ queryKey: ["fido-teorico-precalcolo-stato"] });
    }
  };
  return { avvia: () => void esegui(), invio, errore };
}

export function FidoTeoricoPrecalcoloCard() {
  const { data } = useStatoPrecalcolo();
  const ric = useRicalcolo();
  const barra = barraRicalcolo(data?.lock ?? null, Date.now());
  const attivo = barra?.tipo === "attivo";

  const ultimoRicalcolo = data?.ultimoRicalcolo ?? null;
  const ultimoImport = data?.ultimoImport ?? null;
  const daRicalcolare =
    !ultimoRicalcolo ||
    (!!ultimoImport && (istanteDa(ultimoImport) ?? 0) > (istanteDa(ultimoRicalcolo) ?? 0));
  const attesa = data?.importCompleti && !data.importCompleti.pronto
    ? elencoMancantiTesto(data.importCompleti)
    : null;

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Calculator className="size-5 text-primary mt-0.5 shrink-0" />
        <div>
          <h2 className="font-semibold">Fido teorico (precalcolo)</h2>
          <p className="text-sm text-muted-foreground">
            Calcola e conserva il fido teorico di tutti i clienti, a blocchi, usando la
            stessa regola della scheda cliente.
          </p>
        </div>
      </div>

      <RiquadroRicalcoloFido barra={barra} />

      {attivo ? null : daRicalcolare ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {attesa
              ? `Il giro di oggi è incompleto. Il fido teorico si aggiornerà da solo quando saranno completate anche queste importazioni di oggi: ${attesa}.`
              : data?.importCompleti.inElaborazione.length
                ? "Importazioni ancora in corso: il ricalcolo automatico attende che finiscano."
                : data?.importCompleti.pronto
                  ? "Le quattro fonti sono state importate oggi e ci sono dati nuovi: il ricalcolo automatico partirà a breve, oppure puoi avviarlo ora."
                  : "Non ci sono nuove importazioni delle quattro fonti di oggi successive all'ultimo ricalcolo automatico. Puoi ricalcolare ora."}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {ultimoRicalcolo ? `Fido teorico aggiornato alle ${formatData(ultimoRicalcolo)}` : "Fido teorico già aggiornato"}
        </div>
      )}

      <div className="text-sm text-muted-foreground space-y-1">
        <p>
          {ultimoRicalcolo
            ? `Fido teorico aggiornato alle ${formatData(ultimoRicalcolo)}${data?.origine ? ` (${data.origine})` : ""}.`
            : "Nessun ricalcolo eseguito finora."}
        </p>
        {daRicalcolare && attesa && <p className="break-words">In attesa di: {attesa}</p>}
        <p>
          Clienti nel precalcolo:{" "}
          <span className="font-medium text-foreground tabular-nums">
            {(data?.righe ?? 0).toLocaleString("it-IT")}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant={daRicalcolare ? "default" : "secondary"}
          disabled={ric.invio || attivo}
          onClick={ric.avvia}
        >
          {ric.invio && <Loader2 className="size-4 animate-spin" />}
          Ricalcola fido teorico ora
        </Button>
        {attivo && <span className="text-sm text-muted-foreground">{TESTO_ATTENDI}</span>}
      </div>
      {ric.errore && (
        <p className="break-words rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Ricalcolo non avviato: {ric.errore}
        </p>
      )}
    </Card>
  );
}

/** Avviso compatto mostrato al termine di un import che incide sul fido. */
export function RicalcolaFidoTeoricoAvviso() {
  const ric = useRicalcolo();
  const { data } = useStatoPrecalcolo();
  const barra = barraRicalcolo(data?.lock ?? null, Date.now());
  const attivo = barra?.tipo === "attivo";
  const attesa = data?.importCompleti && !data.importCompleti.pronto
    ? elencoMancantiTesto(data.importCompleti)
    : null;
  return (
    <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm space-y-2">
      <RiquadroRicalcoloFido barra={barra} />
      <p className="break-words">
        {attesa
          ? `Import completato. Il giro di oggi attende ancora: ${attesa}. Il fido teorico si aggiornerà da solo quando saranno completate tutte le quattro fonti di oggi. Se vuoi, puoi ricalcolarlo subito.`
          : data?.importCompleti.inElaborazione.length
            ? "Import completato. Altre importazioni sono ancora in corso: il ricalcolo automatico attende che finiscano."
            : data?.importCompleti.pronto
              ? "Import completato. Le quattro fonti sono state importate oggi e ci sono dati nuovi: il fido teorico si aggiornerà da solo tra pochi minuti. Se vuoi, puoi ricalcolarlo subito."
              : "Import completato. Non ci sono nuove importazioni delle quattro fonti di oggi successive all'ultimo ricalcolo. Se vuoi, puoi ricalcolarlo subito."}
      </p>
      {data?.ultimoRicalcolo && !attivo && (
        <p className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="size-3.5 shrink-0" />
          Fido teorico aggiornato alle {formatData(data.ultimoRicalcolo)}
          {data.origine ? ` (${data.origine})` : ""}.
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" disabled={ric.invio || attivo} onClick={ric.avvia}>
          {ric.invio && <Loader2 className="size-4 animate-spin" />}
          Ricalcola fido teorico
        </Button>
        {attivo && <span className="break-words text-xs text-muted-foreground">{TESTO_ATTENDI}</span>}
        {ric.errore && (
          <span className="break-words text-xs text-destructive">Ricalcolo non avviato: {ric.errore}</span>
        )}
      </div>
    </div>
  );
}
