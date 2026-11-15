import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { AssegnazionePreventivo } from '@/components/preventivatore/AssegnazionePreventivo';
import { PreventiviListView } from '@/components/preventivatore/PreventiviListView';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export const Route = createFileRoute('/fm72-assegnazione-verifica')({ component: Verifica });
function Verifica() {
  const [stato, setStato] = useState('bozza');
  const {data} = useQuery({queryKey:['preventivo','f0720000-0000-4000-8000-000000000001'],queryFn:async()=>{const {data}=await supabase.from('preventivi').select('id,assegnato_a,assegnati_copia').eq('id','f0720000-0000-4000-8000-000000000001').single();return data;}});
  return <div className="mx-auto max-w-7xl p-3"><Button onClick={() => setStato(stato === 'bozza' ? 'confermato' : 'bozza')}>Cambia stato prova</Button>
    <AssegnazionePreventivo prev={{id:'f0720000-0000-4000-8000-000000000001',stato,tipo:'preventivo',assegnato_a:data?.assegnato_a??'f0720000-0000-4000-8000-000000000002',assegnati_copia:data?.assegnati_copia??['f0720000-0000-4000-8000-000000000003']}} modificabile={stato==='bozza'}/>
    <PreventiviListView tipo="preventivo"/>
  </div>;
}