import { createFileRoute } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArticoloGammaPicker } from '@/components/preventivatore/ArticoloGammaPicker';
import { sedeGiacenzePreventivo } from '@/lib/preventivo-creazione';

export const Route = createFileRoute('/fm70-verifica-temporanea')({ component: Verifica });
function Verifica() {
  const qc = useQueryClient();
  qc.setQueryData(['terne-articoli-filtri'], [{ famiglia: 'F1', famiglia_label: 'Lastre', sottofamiglia: 'S1', sottofamiglia_label: 'Cartongesso', marca: 'M1', marca_label: 'Gyproc', conteggio: 65 }]);
  const [scelto, setScelto] = useState('');
  const sede = sedeGiacenzePreventivo({ store_id: null, filiale: null }, { store_id: '11111111-1111-4111-8111-111111111111', sede_nome: 'Cinisello' });
  return <main className="p-3"><ArticoloGammaPicker codice={null} descrizione={null} preventivoId="prova-fm70-3c" cantiereId="22222222-2222-4222-8222-222222222222" {...sede} onChange={a => setScelto(a.codice)} /><p role="status">{scelto}</p></main>;
}