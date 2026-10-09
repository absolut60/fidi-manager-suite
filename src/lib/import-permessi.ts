/**
 * Fonte unica TypeScript: chi può avviare gli import Gamma.
 * Regola decisa da Andrea il 09/10/2026 (FM41): `amministratore` oppure
 * `amministrazione_strumenti`. Gemella della voce di menu "/import-export"
 * in src/components/app-shell.tsx.
 */
export const RUOLI_IMPORT_GAMMA = ["amministratore", "amministrazione_strumenti"] as const;

export function puoImportareGamma(roles: readonly string[]): boolean {
  return roles.some((r) => (RUOLI_IMPORT_GAMMA as readonly string[]).includes(r));
}
