import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PiedePreventivo } from '@/components/preventivatore/PiedePreventivo';
import { TestataPreventivo } from '@/components/preventivatore/TestataPreventivo';
import { Button } from '@/components/ui/button';
import { updatePreventivo, type PreventivoConDettagli, type PreventivoUpdate } from '@/lib/preventivi-api';
import { chiaveSalvaPreventivo } from '@/lib/use-stato-salvataggio-preventivo';
import { useAuth } from '@/hooks/use-auth';

/** Fixture locale: tutte le richieste dati sono intercettate dallo script browser. */
export function NoteClienteFixture() {
  const { roles } = useAuth();
  const [tab, setTab] = useState('piede');
  const [prev, setPrev] = useState({ id: '98000000-0000-0000-0000-000000000100', linea: 'showroom', tipo: 'ordine', stato: 'bozza', tipo_doc: 'PREVENTIVO', titolo: 'Ordine di prova', numero: 'ORD-PROVA/26', data: '2026-11-23', validita: null, cliente_id: null, lead_id: null, cliente: null, lead: null, cantiere: null, agente: null, agente_codice: null, assegnato_a: null, assegnati_copia: [], store_id: '98000000-0000-0000-0000-000000000101', condizione_pagamento_cod: null, iva_perc: 22, regime_iva: 'ordinaria', blocchi: [], note: 'Promemoria riservato interno', note_cliente: '' } as unknown as PreventivoConDettagli);
  const modificabile = roles.includes('preventivi_write');
  const save = useMutation({ mutationKey: chiaveSalvaPreventivo(prev.id), mutationFn: (patch: PreventivoUpdate) => updatePreventivo(prev.id, patch), onSuccess: row => setPrev(p => ({ ...p, ...row })) });
  return <main className="mx-auto max-w-6xl space-y-3 p-3 sm:p-5">
    <div className="flex gap-2"><Button onClick={() => setTab('testata')}>Testata</Button><Button onClick={() => setTab('piede')}>Piede</Button></div>
    <output hidden data-testid="persistito">{JSON.stringify({ note_cliente: prev.note_cliente, note: prev.note })}</output>
    {tab === 'piede' ? <PiedePreventivo prev={prev} onNoteCliente={async note_cliente => { await save.mutateAsync({ note_cliente }); }} dati={{ pagamento: 'Bonifico', validita: '—', marginePerc: 20, margineEuro: 40, imponibile: 200 } as never} iva={44} totale={244} ivaPerc={22} sconto={0} modificabile={modificabile} inCorso={false} onSconto={() => {}} onTestata={() => setTab('testata')}/>
      : <TestataPreventivo prev={prev} cliente={null} modificabile={modificabile} statoEditabile={modificabile} agenti={[]} principali={[]} haAlternative={false} listino="20" categoria="—" sede="Sede prova" onSave={p => save.mutate(p)} onCliente={() => {}} onChangeCliente={() => {}} onCantiere={() => {}} caricamentoCataloghi={false} onRiferimento={async () => {}}/>}
  </main>;
}