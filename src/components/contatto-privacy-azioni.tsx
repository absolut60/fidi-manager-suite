import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { FileCheck2, Mail, Link as LinkIcon, Download, Send, Clock, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ModuloConsensoPrivacy, type ModuloConsensoPayload } from "@/components/modulo-consenso-privacy";
import { inviaRichiestaFirmaPrivacy, registraConsensoDiPersona } from "@/lib/firma-privacy.functions";


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
