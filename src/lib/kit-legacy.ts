/** FM90: ponte storico riservato all'inserimento nel preventivo, da rimuovere nella 1c. */
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { ArticoloConListini } from './kit-api';

export type KitStoricoConComponenti = Database['public']['Tables']['kit']['Row'] & {
  componenti: (Database['public']['Tables']['kit_componenti']['Row'] & { articolo: ArticoloConListini | null })[];
};
const SELECT_STORICO = `*, componenti:kit_componenti(*, articolo:articoli(id,cod_gamma,descrizione,um,peso_unit,qta_fornitore,qta_cliente,listini_acquisto:listini_acquisto(*),listini_vendita:listini_vendita(*)))`;
export async function fetchKitStorico(id: string): Promise<KitStoricoConComponenti> {
  const { data, error } = await supabase.from('kit').select(SELECT_STORICO).eq('id', id).single();
  if (error) throw error;
  const kit = data as unknown as KitStoricoConComponenti;
  kit.componenti.sort((a,b) => a.ordine-b.ordine);
  return kit;
}
export async function fetchKitsStorici(): Promise<KitStoricoConComponenti[]> {
  const { data, error } = await supabase.from('kit').select(SELECT_STORICO).order('famiglia').order('nome');
  if (error) throw error;
  const kit = (data ?? []) as unknown as KitStoricoConComponenti[];
  kit.forEach(k => k.componenti.sort((a,b) => a.ordine-b.ordine));
  return kit;
}