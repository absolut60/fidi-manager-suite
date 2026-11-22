import { useState } from 'react';
import { FileGammaDiProvaVista, type ProvaGammaPronta } from '../../src/components/preventivatore/FileGammaDiProvaDialog';
import { CampoCodiceSdi } from '../../src/components/lead/campo-codice-sdi';
import { costruisciEsportazioneGamma, type DatiOrdineGamma } from '../../src/lib/esportazione-gamma';
import { nomeFileGamma, scriviFileGammaXls } from '../../src/lib/esportazione-gamma-file';
import { Button } from '../../src/components/ui/button';
import { NuovoPreventivoDialog } from '../../src/components/preventivatore/NuovoPreventivoDialog';

function prepara(bloccato: boolean): ProvaGammaPronta {
  const dati: DatiOrdineGamma[] = [{
    ordine: { id: 'ordine-test', numero: 'ORD-PROVA/26', tipo: 'ordine', cliente_id: 'cliente', store_id: 'sede', linea: 'showroom' },
    righe: [{ id: 'riga', tipo_riga: 'manuale', descrizione: 'Articolo di prova con una descrizione leggibile anche su telefono',
      quantita: 2, prezzo_unit: 12, costo: 10, um: 'NR', codice_famiglia: '01', marca: bloccato ? '' : 'AB', codice_articolo_fornitore: 'X1', fornitore_id: 'fornitore' }],
    articoli: [], listiniAcquisto: [], fornitori: [{ id: 'fornitore', codice_gestionale: 100 }],
    cliente: { id: 'cliente', codice_gestionale: '5003', ragione_sociale: 'Soggetto di prova' }, lead: null,
    sede: { id: 'sede', codice: 'LI', listino_riferimento: 10 }, sedeLead: null,
    deposito: { codice: 'LI01', store_id: 'sede', tipo: 'Centrale', attivo: true }, codiciPagamento: [], preventivoOrigine: null,
  }];
  if (bloccato) {
    for (let i = 0; i < 6; i++) dati[0]?.righe.push({ ...dati[0].righe[0], id: `riga-${i}`, quantita: 0 });
  }
  const esito = costruisciEsportazioneGamma(dati);
  return { dati, esito, file: bloccato ? null : { blob: new Blob([new Uint8Array(scriviFileGammaXls(esito.righe))], { type: 'application/vnd.ms-excel' }), nome: nomeFileGamma(new Date('2026-11-22T17:45:00Z')) } };
}
export function FixtureFm95() {
  const [sdi, setSdi] = useState('');
  const [scenario, setScenario] = useState<ProvaGammaPronta | null>(null);
  const [ordine, setOrdine] = useState(false);
  return <main className="mx-auto grid max-w-2xl gap-4 p-3 sm:p-6">
    <CampoCodiceSdi value={sdi} onChange={setSdi} />
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setScenario(prepara(false))}>Prova pronta</Button>
      <Button variant="outline" onClick={() => setScenario(prepara(true))}>Prova bloccata</Button>
      <Button variant="outline" onClick={() => setOrdine(true)}>Nuovo ordine</Button>
    </div>
    {scenario && <FileGammaDiProvaVista open onOpenChange={v => { if (!v) setScenario(null); }} pronta={scenario} />}
    {ordine && <NuovoPreventivoDialog tipo="ordine" open onOpenChange={setOrdine} />}
  </main>;
}