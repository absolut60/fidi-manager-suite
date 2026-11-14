import { useCallback, useMemo, useState } from "react";
import { useIsMutating, useMutationState, useQueryClient, type QueryClient } from "@tanstack/react-query";

/** FM65 Punto 3: fonte unica dello stato di salvataggio della scheda preventivo (B2, usata anche dalla B3). */
export type StatoSalvataggio = "modifiche" | "salvataggio" | "errore" | "salvato";

export const chiaveSalvaPreventivo = (id: string) => ["salva-preventivo", id] as const;

/** Precedenza: errore > salvataggio > modifiche > salvato. */
export function derivaStatoSalvataggio(s: { errore: boolean; inCorso: boolean; caselleAperte: boolean }): StatoSalvataggio {
  if (s.errore) return "errore";
  if (s.inCorso) return "salvataggio";
  if (s.caselleAperte) return "modifiche";
  return "salvato";
}

/** FM65 B3: la finestra d'uscita compare solo con modifiche aperte, salvataggio in corso o errore. */
export function devoBloccareUscita(stato: StatoSalvataggio): boolean {
  return stato === "modifiche" || stato === "salvataggio" || stato === "errore";
}

type Esito = { status: string; submittedAt: number };

/** Vero se l'ultima scrittura conclusa è finita in errore (non seguita da una riuscita). */
export function ultimaScritturaInErrore(esiti: Esito[]): boolean {
  const concluse = esiti.filter((e) => e.status === "success" || e.status === "error");
  if (!concluse.length) return false;
  const ultima = concluse.reduce((a, b) => (b.submittedAt >= a.submittedAt ? b : a));
  return ultima.status === "error";
}

function esitiDaCache(qc: QueryClient, id: string): Esito[] {
  return qc.getMutationCache().findAll({ mutationKey: chiaveSalvaPreventivo(id) })
    .map((m) => ({ status: m.state.status, submittedAt: m.state.submittedAt }));
}

export function useStatoSalvataggioPreventivo(id: string) {
  const qc = useQueryClient();
  const key = chiaveSalvaPreventivo(id);
  const inCorso = useIsMutating({ mutationKey: key }) > 0;
  const esiti = useMutationState({
    filters: { mutationKey: key },
    select: (m) => ({ status: m.state.status, submittedAt: m.state.submittedAt }),
  });
  const errore = useMemo(() => ultimaScritturaInErrore(esiti), [esiti]);
  const [caselleAperte, setCaselleAperte] = useState(false);
  const stato = derivaStatoSalvataggio({ errore, inCorso, caselleAperte });

  /** Da mettere sul contenitore della scheda: input segna "aperta", uscita azzera (il blur salva già). */
  const contenitoreProps = useMemo(() => ({
    // Dopo gli onChange delle celle controllate: in capture React ripristina il
    // vecchio value prima che la cella possa leggere il carattere appena scritto.
    onInput: () => setCaselleAperte(true),
    onBlurCapture: () => setCaselleAperte(false),
  }), []);

  const salvaOra = useCallback(async (): Promise<boolean> => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
    // lascia partire il salvataggio avviato dall'uscita dalla casella
    await new Promise((r) => setTimeout(r, 50));
    while (qc.isMutating({ mutationKey: chiaveSalvaPreventivo(id) }) > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return !ultimaScritturaInErrore(esitiDaCache(qc, id));
  }, [qc, id]);

  return { stato, inCorso, errore, caselleAperte, salvaOra, contenitoreProps };
}
