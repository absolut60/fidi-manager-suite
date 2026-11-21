import { campiPrezzoDaMotore, patchConFontePrezzo, prezzoConPrioritaCantiere, type PrezzoClienteGamma } from './riga-preventivo';
import type { PrezzoDedicatoCantiere } from './riga-preventivo';

export type ArticoloPerRigaGamma = { codice: string; descrizione: string | null; um: string | null };

/** Identica preparazione per scelta nel picker e kit: prezzi già risolti dal dispatcher FM71. */
export function campiRigaGammaPreventivo(
  riga: { tipo_riga?: string | null }, articolo: ArticoloPerRigaGamma, quantita: number, scontoPiede: number,
  motore?: (PrezzoClienteGamma & { um?: string | null }) | null, dedicato?: PrezzoDedicatoCantiere | null,
) {
  const scelta = prezzoConPrioritaCantiere(motore, dedicato);
  return patchConFontePrezzo(riga, {
    ...(riga.tipo_riga === 'manuale' ? { tipo_riga: 'articolo_singolo' as const } : {}),
    articolo_codice: articolo.codice, articolo_id: null, um_scelta: 'um1',
    descrizione: articolo.descrizione, um: articolo.um ?? motore?.um ?? null,
    quantita, vendita: null, ...campiPrezzoDaMotore(scelta.prezzo, quantita, scontoPiede),
  }, scelta.fonte);
}