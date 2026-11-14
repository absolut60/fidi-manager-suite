import { testoRiferimentoPreventivo, type CataloghiRiferimento, type RiferimentoPreventivo } from "@/lib/condizioni-riferimento";

export function BadgeCondizioniRiferimento({ riferimento, cataloghi }: { riferimento: RiferimentoPreventivo; cataloghi?: CataloghiRiferimento }) {
  const testo = testoRiferimentoPreventivo(riferimento, cataloghi);
  if (testo == null) return null;
  return <span className="inline-block max-w-full rounded-full bg-pv-arancio-tenue px-2 py-0.5 text-xs font-semibold text-pv-arancio break-words">{testo}</span>;
}