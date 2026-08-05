import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { FileCheck2, Mail, Link as LinkIcon, Download, Send, Clock, PenLine, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ModuloConsensoPrivacy, type ModuloConsensoPayload } from "@/components/modulo-consenso-privacy";
import {
  inviaRichiestaFirmaPrivacy,
  registraConsensoDiPersona,
  getDettagliConsenso,
} from "@/lib/firma-privacy.functions";


export type ContattoPrivacy = {
  id: string;
  nome?: string | null;
  cognome?: string | null;
  email?: string | null;
  cellulare?: string | null;
  luogo_nascita?: string | null;
  data_nascita?: string | null;
  codice_fiscale?: string | null;
  residenza?: string | null;
  privacy_firmata?: boolean | null;
  data_firma?: string | null;
  consenso_profilazione?: boolean | null;
  consenso_marketing_media?: boolean | null;
  consenso_marketing_diretto?: boolean | null;
  pdf_privacy_url?: string | null;
  richiesta_privacy_generata_il?: string | null;
  richiesta_privacy_inviata_il?: string | null;
  richiesta_privacy_aperta_il?: string | null;
};


function fmt(v?: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("it-IT");
  } catch {
    return String(v);
  }
}

const ORIGINE_LABEL: Record<string, string> = {
  di_persona: "Firmato di persona",
  link_pubblico: "Compilato a distanza dal link",
  firma_grafica: "Firma grafica da link",
  operatore: "Registrato da operatore",
  import: "Importato",
};

function fmtDataOra(v?: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "medium" });
  } catch {
    return String(v);
  }
}

/** User agent in forma leggibile ("iPhone · Safari"), con fallback ai primi 60 caratteri. */
function dispositivoLeggibile(ua?: string | null): { label: string; full: string } {
  if (!ua) return { label: "—", full: "" };
  const os =
    /iPhone/i.test(ua) ? "iPhone" :
    /iPad/i.test(ua) ? "iPad" :
    /Android/i.test(ua) ? "Android" :
    /Windows/i.test(ua) ? "Windows" :
    /Mac OS X|Macintosh/i.test(ua) ? "Mac" :
    /Linux/i.test(ua) ? "Linux" : null;
  const browser =
    /Edg\//i.test(ua) ? "Edge" :
    /OPR\/|Opera/i.test(ua) ? "Opera" :
    /Chrome\//i.test(ua) ? "Chrome" :
    /Firefox\//i.test(ua) ? "Firefox" :
    /Safari\//i.test(ua) ? "Safari" : null;
  if (os || browser) {
    return { label: [os, browser].filter(Boolean).join(" · "), full: ua };
  }
  return { label: ua.slice(0, 60), full: ua };
}

function RigaProva({ label, valore, title }: { label: string; valore: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all" title={title}>{valore}</span>
    </div>
  );
}

function DettagliRaccolta({ contattoId }: { contattoId: string }) {
  const [open, setOpen] = useState(false);
  const fn = useServerFn(getDettagliConsenso);
  const { data, isLoading, error } = useQuery({
    queryKey: ["dettagli-consenso", contattoId],
    queryFn: () => fn({ data: { contattoId } }),
    enabled: open,
    retry: false,
  });
  const disp = dispositivoLeggibile(data?.user_agent);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-medium">
        Dettagli della raccolta
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-1.5">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Caricamento…</p>
        ) : error ? (
          <p className="text-xs text-destructive">
            {error instanceof Error ? error.message : "Errore nel recupero dei dettagli"}
          </p>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">Nessun dato di prova registrato.</p>
        ) : (
          <>
            <RigaProva label="Data e ora" valore={fmtDataOra(data.created_at)} />
            <RigaProva
              label="Modalità"
              valore={(data.origine && (ORIGINE_LABEL[data.origine] ?? data.origine)) || "—"}
            />
            <RigaProva label="Indirizzo IP" valore={data.ip_address || "—"} />
            <RigaProva label="Dispositivo" valore={disp.label} title={disp.full || undefined} />
            <RigaProva label="Versione informativa" valore={data.informativa_versione || "—"} />
            <RigaProva
              label="Impronta del testo"
              valore={data.informativa_hash ? data.informativa_hash.slice(0, 12) : "—"}
              title={data.informativa_hash ?? undefined}
            />
            <RigaProva
              label="Tempo di compilazione"
              valore={
                typeof data.secondi_permanenza === "number" ? `${data.secondi_permanenza} s` : "—"
              }
            />
          </>
        )}
        <p className="text-[10px] text-muted-foreground pt-1">
          Questi dati costituiscono la prova del consenso ai sensi dell'art. 7 GDPR.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConsensoBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Badge className="bg-success/15 text-success border-success/30">{label}</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">{label}: no</Badge>
  );
}

/**
 * Azioni privacy sulla riga di un contatto (cliente o lead).
 * Macchina a stati: FIRMATA · IN ATTESA · DA RACCOGLIERE.
 */
export function ContattoPrivacyAzioni({
  contatto,
  onRefresh,
}: {
  contatto: ContattoPrivacy;
  onRefresh: () => void;
}) {
  const inviaFn = useServerFn(inviaRichiestaFirmaPrivacy);
  const diPersonaFn = useServerFn(registraConsensoDiPersona);
  const [loading, setLoading] = useState<"invia" | "copia" | null>(null);
  const [openDiPersona, setOpenDiPersona] = useState(false);
  const [savingDiPersona, setSavingDiPersona] = useState(false);

  const nomeContatto = [contatto.nome, contatto.cognome].filter(Boolean).join(" ").trim() || "Contatto";

  async function esegui(azione: "invia" | "copia") {
    setLoading(azione);
    try {
      const res = await inviaFn({
        data: { contattoId: contatto.id, origin: window.location.origin },
      });
      try {
        await navigator.clipboard.writeText(res.link);
      } catch {
        /* clipboard non disponibile: il link resta nel toast */
      }
      if (azione === "copia") {
        toast.success("Link copiato negli appunti", { description: res.link });
      } else if (res.emailInviata) {
        toast.success("Richiesta inviata via email", { description: contatto.email ?? "" });
      } else {
        toast.warning("Link generato ma email non inviata — copialo e invialo tu", {
          description: res.link,
          duration: 12000,
        });
      }
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(null);
    }
  }

  async function salvaDiPersona(p: ModuloConsensoPayload) {
    setSavingDiPersona(true);
    try {
      const res = await diPersonaFn({ data: { contattoId: contatto.id, ...p } });
      toast.success(
        res.emailInviata
          ? "Consenso registrato — copia PDF inviata via email"
          : "Consenso registrato — invio email non riuscito, il PDF è archiviato"
      );
      setOpenDiPersona(false);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSavingDiPersona(false);
    }
  }

  const dialogDiPersona = (
    <Dialog open={openDiPersona} onOpenChange={(v) => !savingDiPersona && setOpenDiPersona(v)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consenso privacy — {nomeContatto}</DialogTitle>
          <DialogDescription>
            Fai compilare e firmare questo modulo direttamente all'interessato. Riceverà via email
            copia del documento firmato.
          </DialogDescription>
        </DialogHeader>
        <ModuloConsensoPrivacy
          valoriIniziali={{
            nome: contatto.nome,
            cognome: contatto.cognome,
            luogo_nascita: contatto.luogo_nascita,
            data_nascita: contatto.data_nascita,
            codice_fiscale: contatto.codice_fiscale,
            residenza: contatto.residenza,
            email: contatto.email,
            cellulare: contatto.cellulare,
          }}
          onSubmit={salvaDiPersona}
          isPending={savingDiPersona}
          inviaLabel="Conferma e firma"
        />
      </DialogContent>
    </Dialog>
  );

  // STATO FIRMATA
  if (contatto.privacy_firmata) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-success/15 text-success gap-1">
            <FileCheck2 className="size-3" /> Firmata il {fmt(contatto.data_firma)}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ConsensoBadge ok={!!contatto.consenso_profilazione} label="Profilazione" />
          <ConsensoBadge ok={!!contatto.consenso_marketing_media} label="Marketing media" />
          <ConsensoBadge ok={!!contatto.consenso_marketing_diretto} label="Marketing diretto" />
        </div>
        <p className="text-xs text-muted-foreground">
          Privacy già firmata il {fmt(contatto.data_firma)} — nessuna richiesta necessaria.
        </p>
        <DettagliRaccolta contattoId={contatto.id} />
        {contatto.pdf_privacy_url && (
          <Button size="sm" variant="outline" asChild>
            <a href={contatto.pdf_privacy_url} target="_blank" rel="noreferrer">
              <Download className="size-3.5 mr-1" /> Scarica PDF
            </a>
          </Button>
        )}
      </div>
    );
  }

  const senzaEmail = !contatto.email;

  // STATO IN ATTESA
  if (contatto.richiesta_privacy_generata_il) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Clock className="size-3.5 mt-0.5 shrink-0" />
          <span>
            Richiesta generata il {fmt(contatto.richiesta_privacy_generata_il)}
            {contatto.richiesta_privacy_inviata_il && ` · inviata il ${fmt(contatto.richiesta_privacy_inviata_il)}`}
            {contatto.richiesta_privacy_aperta_il && ` · aperta il ${fmt(contatto.richiesta_privacy_aperta_il)}`}
            {" · non ancora firmata"}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={loading !== null} onClick={() => setOpenDiPersona(true)}>
            <PenLine className="size-3.5 mr-1" /> Compila di persona
          </Button>
          <Button size="sm" variant="outline" disabled={loading !== null} onClick={() => esegui("invia")}>
            <Send className="size-3.5 mr-1" /> {loading === "invia" ? "Invio..." : "Rinvia richiesta"}
          </Button>
          <Button size="sm" variant="ghost" disabled={loading !== null} onClick={() => esegui("copia")}>
            <LinkIcon className="size-3.5 mr-1" /> {loading === "copia" ? "..." : "Copia link"}
          </Button>
        </div>
        {dialogDiPersona}
      </div>
    );
  }

  // STATO DA RACCOGLIERE
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" disabled={loading !== null} onClick={() => setOpenDiPersona(true)}>
          <PenLine className="size-3.5 mr-1" /> Compila di persona
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={senzaEmail || loading !== null}
          title={senzaEmail ? "Manca l'email del contatto" : undefined}
          onClick={() => esegui("invia")}
        >
          <Mail className="size-3.5 mr-1" />
          {loading === "invia" ? "Invio..." : "Invia richiesta a distanza"}
        </Button>
        <Button size="sm" variant="ghost" disabled={loading !== null} onClick={() => esegui("copia")}>
          <LinkIcon className="size-3.5 mr-1" /> {loading === "copia" ? "..." : "Copia link"}
        </Button>
      </div>
      {senzaEmail && (
        <p className="text-xs text-muted-foreground">
          Manca l'email del contatto: usa "Compila di persona" oppure "Copia link".
        </p>
      )}
      {dialogDiPersona}
    </div>
  );

}
