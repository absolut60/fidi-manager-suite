import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LineaPreventivo } from './linee-preventivo';

export interface LineeProfilo { linee_abilitate: LineaPreventivo[]; linea_predefinita: LineaPreventivo | null }

/** Linee del preventivatore dell'utente corrente (propria riga di profili, RLS). */
export function useLineeUtente(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['linee-utente', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LineeProfilo> => {
      const { data, error } = await supabase.from('profili').select('linee_abilitate, linea_predefinita').eq('id', userId ?? '').maybeSingle();
      if (error) throw new Error('Impossibile leggere le linee del preventivatore del tuo profilo');
      return { linee_abilitate: data?.linee_abilitate ?? [], linea_predefinita: data?.linea_predefinita ?? null };
    },
    staleTime: 5 * 60_000,
  });
}
