import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { nomeUtenteAssegnabile, type UtenteAssegnabile } from './assegnazione-preventivo';

export function useUtentiAssegnabili() {
  return useQuery({
    queryKey: ['utenti-assegnabili'],
    queryFn: async (): Promise<UtenteAssegnabile[]> => {
      const { data, error } = await supabase.rpc('get_utenti_assegnabili');
      if (error) throw new Error('Impossibile caricare gli utenti assegnabili');
      return [...(data ?? [])].sort((a, b) => nomeUtenteAssegnabile(a).localeCompare(nomeUtenteAssegnabile(b), 'it'));
    },
    staleTime: 5 * 60_000,
  });
}