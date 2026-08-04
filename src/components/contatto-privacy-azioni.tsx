import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { FileCheck2, Mail, Link as LinkIcon, Download, Send, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { inviaRichiestaFirmaPrivacy } from "@/lib/firma-privacy.functions";

export type ContattoPrivacy = {
  id: string;
  nome?: string | null;
  cognome?: string | null;
  email?: string | null;
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
  const [loading, setLoading] = useState<"invia" | "copia" | null>(null);

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
          <Button size="sm" variant="outline" disabled={loading !== null} onClick={() => esegui("invia")}>
            <Send className="size-3.5 mr-1" /> {loading === "invia" ? "Invio..." : "Rinvia richiesta"}
          </Button>
          <Button size="sm" variant="ghost" disabled={loading !== null} onClick={() => esegui("copia")}>
            <LinkIcon className="size-3.5 mr-1" /> {loading === "copia" ? "..." : "Copia link"}
          </Button>
        </div>
      </div>
    );
  }

  // STATO DA RACCOGLIERE
  const senzaEmail = !contatto.email;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          disabled={senzaEmail || loading !== null}
          title={senzaEmail ? "Manca l'email del contatto" : undefined}
          onClick={() => esegui("invia")}
        >
          <Mail className="size-3.5 mr-1" />
          {loading === "invia" ? "Invio..." : "Invia richiesta via email"}
        </Button>
        <Button size="sm" variant="outline" disabled={loading !== null} onClick={() => esegui("copia")}>
          <LinkIcon className="size-3.5 mr-1" /> {loading === "copia" ? "..." : "Copia link"}
        </Button>
      </div>
      {senzaEmail && (
        <p className="text-xs text-muted-foreground">Manca l'email del contatto: usa "Copia link".</p>
      )}
    </div>
  );
}
