import type { Database } from '@/integrations/supabase/types';

export type LineaPreventivo = Database['public']['Enums']['linea_preventivo'];
export interface ConfigurazioneLineaPreventivo {
  codice: LineaPreventivo;
  etichetta: string;
  attiva: boolean;
  classiBadge: string;
  classiBordo: string;
}

/** Tutti i comportamenti per linea passano da questo catalogo, non da confronti nei chiamanti. */
export const LINEE_PREVENTIVO: Record<LineaPreventivo, ConfigurazioneLineaPreventivo> = {
  sistema_made: { codice: 'sistema_made', etichetta: 'Sistema MADE', attiva: true, classiBadge: 'border-pv-azzurro-bordo bg-pv-azzurro text-pv-blu', classiBordo: 'border-l-pv-blu' },
  showroom: { codice: 'showroom', etichetta: 'Showroom', attiva: false, classiBadge: 'border-pv-viola/30 bg-pv-viola-tenue text-pv-viola', classiBordo: 'border-l-pv-viola' },
  edilizia: { codice: 'edilizia', etichetta: 'Edilizia', attiva: false, classiBadge: 'border-pv-verde/30 bg-pv-verde-tenue text-pv-verde', classiBordo: 'border-l-pv-verde' },
  fotovoltaico: { codice: 'fotovoltaico', etichetta: 'Fotovoltaico', attiva: false, classiBadge: 'border-pv-giallo/30 bg-pv-giallo-tenue text-pv-giallo', classiBordo: 'border-l-pv-giallo' },
};

export function lineaPreventivo(codice: unknown): ConfigurazioneLineaPreventivo {
  return typeof codice === 'string' && Object.hasOwn(LINEE_PREVENTIVO, codice)
    ? LINEE_PREVENTIVO[codice as LineaPreventivo]
    : LINEE_PREVENTIVO.sistema_made;
}

export function lineeAttive(): ConfigurazioneLineaPreventivo[] {
  return Object.values(LINEE_PREVENTIVO).filter(linea => linea.attiva);
}

export const mostraFiltroLinee = lineeAttive().length > 1;