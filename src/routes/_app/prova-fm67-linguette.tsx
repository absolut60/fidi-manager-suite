import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FasciaPreventivo } from '@/components/preventivatore/FasciaPreventivo';

export const Route = createFileRoute('/_app/prova-fm67-linguette')({ component: Prova });

function Prova() {
  const [tab, setTab] = useState('corpo');
  return (
    <div className="space-y-3 p-3">
      <FasciaPreventivo
        dati={{ cliente: '000123 · Rossi Costruzioni Srl', cantiere: 'Cantiere via Roma 12', listino: 'LI01', categoria: 'Edilizia', pagamento: 'Bonifico 60 gg', validita: '31/12/2026', imponibile: 1234.56, marginePerc: 19.7, margineEuro: 243.21 }}
        titolo="Preventivo di prova linguette"
        onCliente={() => {}}
      />
      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <TabsList variant="linguette" className="w-full justify-start">
          {(['testata', 'corpo', 'piede'] as const).map((t) => (
            <TabsTrigger key={t} variant="linguette" value={t}>
              {t === 'testata' ? 'Testata' : t === 'piede' ? 'Piede' : 'Corpo · 2 blocchi'}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="testata"><p className="text-sm">Contenuto testata</p></TabsContent>
        <TabsContent value="corpo"><p className="text-sm">Contenuto corpo</p></TabsContent>
        <TabsContent value="piede"><p className="text-sm">Contenuto piede</p></TabsContent>
      </Tabs>
    </div>
  );
}
