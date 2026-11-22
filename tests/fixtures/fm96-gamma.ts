import type { DatiOrdineGamma } from '../../src/lib/esportazione-gamma';

/** Ordine sintetico con cinque fornitori: mai inserito nel database dell'app. */
export function ordineFm96(id = '96000000-0000-0000-0000-000000000001', bloccato = false): DatiOrdineGamma {
  return {
    ordine: { id, numero: id.endsWith('1') ? 'ORD-104/26' : 'ORD-PROVA/26', tipo: 'ordine', cliente_id: '96000000-0000-0000-0000-000000000010', store_id: '96000000-0000-0000-0000-000000000020', linea: 'showroom' },
    righe: Array.from({ length: 5 }, (_, i) => ({ id: `${id}-${i}`, tipo_riga: 'manuale', descrizione: `Materiale ${i + 1} con descrizione lunga per verificare telefono e tablet`, quantita: 10, prezzo_unit: 20, costo: 12, um: 'NR', codice_famiglia: '01', marca: bloccato ? '' : 'AB', codice_articolo_fornitore: `X${i}`, fornitore_id: `f${i}` })),
    articoli: [], listiniAcquisto: [], fornitori: Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, codice_gestionale: 100 + i })),
    cliente: { id: '96000000-0000-0000-0000-000000000010', codice_gestionale: '5003', ragione_sociale: 'Impresa di prova con ragione sociale lunga e completa' }, lead: null,
    sede: { id: '96000000-0000-0000-0000-000000000020', codice: 'LI', listino_riferimento: 10 }, sedeLead: null,
    deposito: { codice: 'LI01', store_id: '96000000-0000-0000-0000-000000000020', tipo: 'Centrale', attivo: true }, codiciPagamento: [], preventivoOrigine: null,
  };
}