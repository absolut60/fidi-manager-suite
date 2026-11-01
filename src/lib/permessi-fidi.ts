// Fonte unica (FM55, decisione di Andrea 01/11/2026): chi vede l'area Alert fidi
// e chi può aprire la proposta / usare la selezione multipla.
// Documentata in docs/regole/sicurezza-permessi.md. La lettura dei dati resta
// filtrata dalla RLS esistente (clienti visibili): questa regola decide solo lo schermo.

export const RUOLI_VEDONO_FIDI = [
  "amministratore",
  "direzione",
  "amministrazione",
  "store_manager",
  "approvatore_liv1",
  "approvatore_liv2",
  "approvatore_liv3",
  "responsabile_agenti",
  "agente",
] as const;

export const RUOLI_PROPONGONO_FIDI = ["amministratore", "direzione", "amministrazione", "store_manager"] as const;

export function puoVedereAlertFidi(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => (RUOLI_VEDONO_FIDI as readonly string[]).includes(r));
}

/** "Apri proposta" e selezione multipla; gli altri ruoli che vedono la pagina sono in sola lettura. */
export function puoProporreDaAlertFidi(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => (RUOLI_PROPONGONO_FIDI as readonly string[]).includes(r));
}
