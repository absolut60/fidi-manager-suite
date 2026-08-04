import { toast } from "sonner";
import { FileText, Mail, PenLine } from "lucide-react";
import { ModuloConsensoPrivacy, type ModuloConsensoPayload } from "@/components/modulo-consenso-privacy";
import { inviaRichiestaFirmaPrivacy, registraConsensoDiPersona } from "@/lib/firma-privacy.functions";

/**
 * Canali di raccolta privacy allineati a <ContattoPrivacyAzioni>.
 * Sono gli unici percorsi ammessi: qualunque firma passa dai 3 consensi.
 */
export type CanalePrivacy = "di_persona" | "a_distanza" | "nessuno";

export const CANALI_PRIVACY: {
  key: CanalePrivacy;
  titolo: string;
  descrizione: string;
  icona: typeof PenLine;
}[] = [
  {
    key: "di_persona",
    titolo: "Crea e compila di persona",
    descrizione: "Il cliente compila e firma qui, sul tablet.",
    icona: PenLine,
  },
  {
    key: "a_distanza",
    titolo: "Crea e invia richiesta a distanza",
    descrizione: "Gli mandiamo il link da compilare a distanza.",
    icona: Mail,
  },
  {
    key: "nessuno",
    titolo: "Crea senza privacy",
    descrizione: "Inserisco solo i dati, la privacy la raccolgo dopo.",
    icona: FileText,
  },
];

export function SceltaCanalePrivacy({
  onScegli,
}: {
  onScegli: (c: CanalePrivacy) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
      {CANALI_PRIVACY.map((c) => {
        const Icona = c.icona;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onScegli(c.key)}
            className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:bg-accent/40 transition"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icona className="size-5 text-primary" />
              <span className="font-semibold text-sm">{c.titolo}</span>
            </div>
            <p className="text-xs text-muted-foreground">{c.descrizione}</p>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Genera il link di firma, lo copia negli appunti e riporta l'esito dell'email.
 * Non blocca mai: se manca l'email avvisa che il link va inviato a mano.
 */
export async function inviaRichiestaDopoCreazione(
  inviaFn: (args: { data: { contattoId: string; origin: string } }) => Promise<{ link: string; emailInviata: boolean }>,
  contattoId: string,
  haEmail: boolean,
): Promise<void> {
  try {
    const res = await inviaFn({ data: { contattoId, origin: window.location.origin } });
    try {
      await navigator.clipboard.writeText(res.link);
    } catch {
      /* clipboard non disponibile: il link resta nel toast */
    }
    if (res.emailInviata) {
      toast.success("Contatto creato — richiesta inviata via email");
    } else if (!haEmail) {
      toast.warning("Contatto creato senza email — link copiato negli appunti: copialo e invialo tu", {
        description: res.link,
        duration: 12000,
      });
    } else {
      toast.warning("Contatto creato — email non inviata, link copiato negli appunti: copialo e invialo tu", {
        description: res.link,
        duration: 12000,
      });
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Errore nella generazione del link");
  }
}

export { ModuloConsensoPrivacy, inviaRichiestaFirmaPrivacy, registraConsensoDiPersona };
export type { ModuloConsensoPayload };
