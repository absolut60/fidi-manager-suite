import { expect, test } from 'bun:test';
import * as XLSX from 'xlsx';
import * as CFB from 'cfb';
import { COLONNE_FILE_GAMMA, costruisciEsportazioneGamma, type DatiOrdineGamma, type RigaOrdineGamma } from '../src/lib/esportazione-gamma';
import { nomeFileGamma, scriviFileGammaXls } from '../src/lib/esportazione-gamma-file';
import { readFileSync } from 'node:fs';
import { rigaInUnita } from '../src/lib/riga-preventivo';

const INTESTAZIONE = 'CODICE_DOCUMENTO,COD_COD_CLI,Ragione_sociale_anagrafica,Indirizzo_anagrafica,NOTE,IND_CLIFOR,TESTATA_RIGHE,SEDE,DATA_CONSEG,Codice_agente,Cap_anagrafica,Citta_anagrafica,Partita_iva,Flag_persona_fisica,Telefono_1,Cellulare,Indirizzo_email,Cognome,Nome,Codice_fiscale,Condizione_pagamento,Descrizione_pagamento,Codice_sede,Raggruppamento_clienti_1,Raggruppamento_clienti_2,Raggruppamento_clienti_3,Codice_listino,Codice_deposito,Codice_macrocategoria,Codice_categoria,Codice_destinatario_prevalente,COD_ART,QTA1,PRZ1,SCT1,SCT2,sct3,magg %,SCONT_IMP,MAGG_Import,descrizione,Codice_famiglia,Codice_sottofamiglia,Marca,Unita_misura_1_articolo,Unita_misura_2_articolo,Fattore_conversione_articolo'.split(',');

function dati(id = 'o1', numeroOrdine = 'ORD-1/26'): DatiOrdineGamma {
  return {
    ordine: { id, numero: numeroOrdine, tipo: 'ordine', cliente_id: 'c1', store_id: 's1', linea: 'showroom', data_consegna: '2026-12-10', preventivo_origine_id: 'p1' },
    righe: [{ id: 'r1', tipo_riga: 'articolo_singolo', articolo_codice: 'GAM-1', quantita: 10, prezzo_unit: 21.123456, descrizione: 'Articolo Gamma', sconti_gamma: [10, 5], sconto_perc: 2, maggiorazione_perc: 3 }],
    articoli: [{ codice: 'GAM-1', fornitore_pref_id: 'f1', codice_famiglia: '01', codice_sottofamiglia: '02', marca_codice: 'GA', um: 'MQ', um2: 'NR', fattore_conversione: 1.44 }],
    listiniAcquisto: [{ articolo_codice: 'GAM-1', listino: 10, acq_prezzo: 12.123456, acq_sc1: 11, acq_sc2: 4, acq_sc3: 0, acq_trasporto_perc: 2, acq_trasporto_euro: 0.25 },
      { articolo_codice: 'GAM-1', listino: 20, acq_prezzo: 18 }],
    fornitori: [{ id: 'f1', codice_gestionale: 100, ragione_sociale: 'Fornitore 1' }, { id: 'f2', codice_gestionale: 200 }],
    cliente: { id: 'c1', codice_gestionale: '005003', ragione_sociale: 'Cliente prova' }, lead: null,
    sede: { id: 's1', codice: 'LI', listino_riferimento: 10 }, sedeLead: null,
    deposito: { codice: 'LI01', store_id: 's1', tipo: 'Centrale', attivo: true },
    codiciPagamento: [{ cod: 'BO02', descrizione: 'Bonifico 60 giorni' }], preventivoOrigine: { id: 'p1', numero: 'PRV-164/26' },
  };
}
function manuale(): RigaOrdineGamma {
  return { id: 'rm', tipo_riga: 'manuale', articolo_codice: null, quantita: 5, prezzo_unit: 30, costo: 100,
    fornitore_id: 'f1', marca: ' ab ', codice_articolo_fornitore: ' x 12 ', codice_famiglia: '03', codice_sottofamiglia: '04',
    um: 'T.', um2: 'NR', fattore_conversione: 0.025, um_scelta: 'um2', descrizione: 'Nuovo articolo' };
}
function lead(): DatiOrdineGamma {
  const d = dati(); d.ordine.cliente_id = null; d.ordine.lead_id = 'l1'; d.cliente = null;
  d.lead = { id: 'l1', nome: 'Mario', cognome: 'Rossi', ragione_sociale: 'Mario Rossi', tipo_soggetto: 'persona_fisica',
    codice_fiscale: 'RSSMRA', indirizzo: 'Via Roma 1', cap: '20000', citta: 'Milano', telefono: '123', cellulare: '456',
    email: 'mario@example.test', agente_codice: '7', condizione_pagamento_cod: 'BO02', listino_rif: 10, macrocategoria_rif: '01', categoria_rif: '02', store_id: 's2' };
  d.sedeLead = { id: 's2', codice: 'ME' }; return d;
}
const clienteT = (d: DatiOrdineGamma) => costruisciEsportazioneGamma([d]).righe.find(r => r.CODICE_DOCUMENTO === 'MD-C-ORDINE' && r.TESTATA_RIGHE === 'T');
const fornitoreR = (d: DatiOrdineGamma) => costruisciEsportazioneGamma([d]).righe.find(r => r.CODICE_DOCUMENTO === 'MD-F-ORDINE' && r.TESTATA_RIGHE === 'R');
const clienteR = (d: DatiOrdineGamma) => costruisciEsportazioneGamma([d]).righe.find(r => r.CODICE_DOCUMENTO === 'MD-C-ORDINE' && r.TESTATA_RIGHE === 'R');
function bloccato(d: DatiOrdineGamma, codice: string) {
  const e = costruisciEsportazioneGamma([d]);
  expect(e.ordiniBloccati).toEqual(['o1']); expect(e.righe).toEqual([]);
  expect(e.problemi.some(p => p.codice === codice && p.livello === 'bloccante')).toBe(true);
}

test('Gamma: 47 intestazioni esatte, ordine e colonne vuote mantenuti', () => {
  expect(COLONNE_FILE_GAMMA).toEqual(INTESTAZIONE); expect(COLONNE_FILE_GAMMA.length).toBe(47);
  for (const r of costruisciEsportazioneGamma([dati()]).righe) expect(Object.keys(r)).toEqual(INTESTAZIONE);
});
test('Gamma: tutti i fornitori prima dei clienti, numero ordine naturale e fornitore ordinato', () => {
  const a = dati('o10', 'ORD-10/26'), b = dati('o2', 'ORD-2/26');
  b.righe.push({ ...b.righe[0], id: 'r2', fornitore_id: 'f2' });
  const e = costruisciEsportazioneGamma([a, b]);
  expect(e.righe.filter(r => r.TESTATA_RIGHE === 'T').map(r => [r.CODICE_DOCUMENTO, r.COD_COD_CLI])).toEqual([
    ['MD-F-ORDINE', '100'], ['MD-F-ORDINE', '200'], ['MD-F-ORDINE', '100'], ['MD-C-ORDINE', '005003'], ['MD-C-ORDINE', '005003'],
  ]);
  expect(e.ordiniEsportati).toEqual(['o2', 'o10']);
});
test('Gamma: raggruppa più righe dello stesso fornitore sotto una sola T', () => {
  const d = dati(); d.righe.push({ ...d.righe[0], id: 'r2' }, { ...d.righe[0], id: 'r3', fornitore_id: 'f2' });
  const e = costruisciEsportazioneGamma([d]);
  expect(e.righe.filter(r => r.CODICE_DOCUMENTO === 'MD-F-ORDINE').map(r => [r.TESTATA_RIGHE, r.COD_COD_CLI])).toEqual([
    ['T', '100'], ['R', '100'], ['T', '200'], ['R', '200'],
  ]);
});
test('Gamma: fornitore preferenziale e scelta della riga prevalente', () => {
  const d = dati(); expect(fornitoreR(d)?.COD_COD_CLI).toBe('100');
  d.righe = d.righe.map(r => ({ ...r, fornitore_id: 'f2' })); expect(fornitoreR(d)?.COD_COD_CLI).toBe('200');
});
test('Gamma: manuale genera codice ABC + codice fornitore e usa costo unitario netto, senza sconti', () => {
  const d = dati(); d.righe = [manuale()];
  expect(fornitoreR(d)).toMatchObject({ COD_ART: 'ABX12', PRZ1: 20, QTA1: 5, SCT1: '', SCT2: '', sct3: '', 'magg %': '', MAGG_Import: '',
    Marca: 'ab', Codice_famiglia: '03', Unita_misura_1_articolo: 'T.', Unita_misura_2_articolo: 'NR', Fattore_conversione_articolo: 0.025 });
});
test('Gamma: acquisto dal listino della sede ordine, non da cliente o listino riferimento commerciale', () => {
  const a = dati(), b = dati('o2', 'ORD-2/26');
  b.sede = { id: 's2', codice: 'ME', listino_riferimento: 20 }; b.ordine.store_id = 's2'; b.ordine.listino_rif = 10;
  b.deposito = { codice: 'ME01', store_id: 's2', tipo: 'Centrale', attivo: true };
  expect(fornitoreR(a)?.PRZ1).toBe(12.1235); expect(fornitoreR(b)?.PRZ1).toBe(18);
  expect(fornitoreR(a)).toMatchObject({ SCT1: 11, SCT2: 4, sct3: '', 'magg %': 2, MAGG_Import: 0.25 });
});
test('Gamma: quantità e prezzo restano UM1 anche con scelta UM2', () => {
  const d = dati(); d.righe = d.righe.map(r => ({ ...r, um_scelta: 'um2' }));
  expect(clienteR(d)).toMatchObject({ QTA1: 10, PRZ1: 21.1235, Fattore_conversione_articolo: 1.44 });
});
test('Gamma: sconto extra dopo gli sconti Gamma, nulli/zeri vuoti, maggiorazione vendita', () => {
  const d = dati(); expect(clienteR(d)).toMatchObject({ SCT1: 10, SCT2: 5, sct3: 2, 'magg %': 3, SCONT_IMP: '', MAGG_Import: '' });
  d.righe = d.righe.map(r => ({ ...r, sconti_gamma: [0, 10, 0], sconto_perc: 2, maggiorazione_perc: 0 }));
  expect(clienteR(d)).toMatchObject({ SCT1: 2, SCT2: 10, sct3: '', 'magg %': '' });
});
test('Gamma: sconto extra nel primo slot libero senza spostare gli sconti Gamma', () => {
  const d = dati(); d.righe = d.righe.map(r => ({ ...r, sconti_gamma: [10, 0, 5], sconto_perc: 2 }));
  expect(clienteR(d)).toMatchObject({ SCT1: 10, SCT2: 2, sct3: 5 });
});
test('Gamma: quattro sconti incluso extra bloccano', () => {
  const d = dati(); d.righe = d.righe.map(r => ({ ...r, sconti_gamma: [10, 5, 3], sconto_perc: 2 })); bloccato(d, 'troppi_sconti');
});
for (const gamma of [true, false]) test(`Gamma: UM2 assente → UM1 e fattore 1 espliciti, gamma=${gamma}`, () => {
  const d = dati(); if (gamma) d.articoli = d.articoli.map(a => ({ ...a, um2: null, fattore_conversione: null }));
  else d.righe = [{ ...manuale(), um2: null, fattore_conversione: null }];
  expect(fornitoreR(d)).toMatchObject({ Unita_misura_2_articolo: gamma ? 'MQ' : 'T.', Fattore_conversione_articolo: 1 });
});
test('Gamma: lead persona fisica senza SDI → 0000000, SDI presente conservato', () => {
  const d = lead(); expect(clienteT(d)).toMatchObject({ COD_COD_CLI: '', Flag_persona_fisica: 1, Codice_destinatario_prevalente: '0000000' });
  d.lead = { ...d.lead, codice_sdi: 'ABC1234' }; expect(clienteT(d)?.Codice_destinatario_prevalente).toBe('ABC1234');
  d.lead = { ...d.lead, tipo_soggetto: 'societa', codice_sdi: null }; expect(clienteT(d)).toMatchObject({ Flag_persona_fisica: 0, Codice_destinatario_prevalente: '' });
});
test('Gamma: ordine prevale sul lead per listino/macro/categoria e pagamento; descrizione dal catalogo', () => {
  const d = lead(); Object.assign(d.ordine, { listino_rif: 20, macrocategoria_rif: '03', categoria_rif: '04', condizione_pagamento_cod: 'BO99' });
  d.codiciPagamento.push({ cod: 'BO99', descrizione: 'Bonifico speciale' });
  expect(clienteT(d)).toMatchObject({ Codice_listino: 20, Codice_macrocategoria: '03', Codice_categoria: '04', Condizione_pagamento: 'BO99', Descrizione_pagamento: 'Bonifico speciale' });
});
test('Gamma: fallback condizioni lead e sede lead, anagrafica completa', () => {
  const d = lead(); expect(clienteT(d)).toMatchObject({ Ragione_sociale_anagrafica: 'Mario Rossi', Cognome: 'Rossi', Nome: 'Mario',
    Indirizzo_anagrafica: 'Via Roma 1', Cap_anagrafica: '20000', Citta_anagrafica: 'Milano', Codice_fiscale: 'RSSMRA',
    Telefono_1: '123', Cellulare: '456', Indirizzo_email: 'mario@example.test', Codice_agente: '7', Codice_sede: 'ME',
    Condizione_pagamento: 'BO02', Descrizione_pagamento: 'Bonifico 60 giorni', Codice_listino: 10, Codice_macrocategoria: '01', Codice_categoria: '02' });
  d.sedeLead = null; expect(clienteT(d)?.Codice_sede).toBe('LI');
});
test('Gamma: cliente con codice non sovrascrive anagrafica né condizioni', () => {
  const d = dati(); Object.assign(d.ordine, { condizione_pagamento_cod: 'BO02', listino_rif: 20 });
  expect(clienteT(d)).toMatchObject({ COD_COD_CLI: '005003', Ragione_sociale_anagrafica: '', Indirizzo_anagrafica: '',
    Codice_listino: '', Condizione_pagamento: '', Flag_persona_fisica: '', Codice_sede: '' });
});
test('Gamma: note da origine e linea, nome soggetto solo al fornitore; date solo T', () => {
  const d = dati(); const e = costruisciEsportazioneGamma([d]);
  expect(e.righe[0]).toMatchObject({ NOTE: 'ORD-1/26 da PRV-164/26 - Showroom - Cliente prova', DATA_CONSEG: new Date('2026-12-10T00:00:00Z'), SEDE: 'LI', Codice_deposito: 'LI01' });
  expect(clienteT(d)?.NOTE).toBe('ORD-1/26 da PRV-164/26 - Showroom'); expect(clienteR(d)?.DATA_CONSEG).toBe('');
  d.preventivoOrigine = null; d.ordine.preventivo_origine_id = null; d.ordine.data_consegna = null;
  expect(clienteT(d)).toMatchObject({ NOTE: 'ORD-1/26 - Showroom', DATA_CONSEG: '' });
});
test('Gamma: ordine bloccato escluso interamente, gli altri esportati', () => {
  const d = dati(); d.deposito = null; const e = costruisciEsportazioneGamma([d, dati('o2', 'ORD-2/26')]);
  expect(e.ordiniBloccati).toEqual(['o1']); expect(e.ordiniEsportati).toEqual(['o2']);
  expect(e.righe).toHaveLength(4); expect(e.righe.filter(r => r.TESTATA_RIGHE === 'T').every(r => String(r.NOTE).startsWith('ORD-2/26'))).toBe(true);
});
for (const [campo, valore, codice] of [
  ['marca', null, 'manuale_senza_marca'], ['codice_articolo_fornitore', null, 'manuale_senza_codice_fornitore'],
  ['um', null, 'manuale_senza_um'], ['codice_famiglia', null, 'manuale_senza_famiglia'], ['costo', null, 'manuale_senza_costo'],
  ['codice_articolo_fornitore', 'X'.repeat(24), 'codice_troppo_lungo'], ['descrizione', 'X'.repeat(71), 'descrizione_troppo_lunga'],
  ['fattore_conversione', 0, 'fattore_non_valido'], ['fattore_conversione', -1, 'fattore_non_valido'], ['fattore_conversione', null, 'fattore_non_valido'],
] as const) test(`Gamma: manuale bloccante ${codice} (${valore})`, () => {
  const d = dati(); d.righe = [{ ...manuale(), [campo]: valore }]; bloccato(d, codice);
});
test('Gamma: costo manuale zero valido e codice esattamente 25 valido', () => {
  const d = dati(); d.righe = [{ ...manuale(), costo: 0, marca: 'A', codice_articolo_fornitore: 'X'.repeat(24), descrizione: 'X'.repeat(70) }];
  expect(fornitoreR(d)?.PRZ1).toBe(0); expect(fornitoreR(d)?.COD_ART).toBe('A' + 'X'.repeat(24));
});
test('Gamma: fornitore assente bloccante', () => { const d = dati(); d.articoli = d.articoli.map(a => ({ ...a, fornitore_pref_id: null })); bloccato(d, 'fornitore_assente'); });
test('Gamma: fornitore senza codice bloccante', () => { const d = dati(); d.fornitori = [{ id: 'f1', codice_gestionale: null }]; bloccato(d, 'fornitore_senza_codice'); });
test('Gamma: cliente senza codice bloccante', () => { const d = dati(); d.cliente = { id: 'c1', codice_gestionale: null }; bloccato(d, 'cliente_senza_codice'); });
test('Gamma: sede senza listino usa il ripiego 20 con avviso, senza bloccare', () => {
  const d = dati(); d.sede = { ...d.sede, listino_riferimento: null };
  const e = costruisciEsportazioneGamma([d]);
  expect(e.ordiniEsportati).toEqual(['o1']); expect(e.ordiniBloccati).toEqual([]);
  expect(fornitoreR(d)?.PRZ1).toBe(18);
  const avvisi = e.problemi.filter(p => p.codice === 'listino_ripiego');
  expect(avvisi).toHaveLength(1); expect(avvisi[0]?.livello).toBe('avviso');
  expect(avvisi[0]?.messaggio).toContain('listino 20');
  expect(e.problemi.map(p => p.codice)).not.toContain('listino_sede_assente');
  d.righe = [manuale()]; const solo = costruisciEsportazioneGamma([d]);
  expect(solo.ordiniEsportati).toEqual(['o1']); expect(solo.problemi.map(p => p.codice)).not.toContain('listino_ripiego');
});
test('Gamma: deposito di altra sede, non centrale o inattivo bloccante', () => {
  for (const patch of [{ store_id: 'altra' }, { tipo: 'Periferico' }, { attivo: false }]) {
    const d = dati(); d.deposito = { ...d.deposito, ...patch }; bloccato(d, 'deposito_centrale_assente');
  }
});
test('Gamma: acquisto assente avviso con prezzo vuoto (nessun fallback da altro listino)', () => {
  const d = dati(); d.listiniAcquisto = d.listiniAcquisto.filter(l => l.listino === 20);
  const e = costruisciEsportazioneGamma([d]); expect(e.ordiniEsportati).toEqual(['o1']); expect(fornitoreR(d)?.PRZ1).toBe('');
  expect(e.problemi.map(p => p.codice)).toContain('acquisto_assente');
});
test('Gamma: descrizione Gamma troncata con avviso ma input intatto', () => {
  const d = dati(); d.righe = d.righe.map(r => ({ ...r, descrizione: 'X'.repeat(80) }));
  const e = costruisciEsportazioneGamma([d]); expect(fornitoreR(d)?.descrizione).toBe('X'.repeat(70));
  expect(e.problemi.map(p => p.codice)).toContain('descrizione_troncata'); expect(d.righe[0]?.descrizione?.length).toBe(80);
});
test('Gamma: caratteri provvisori permessi e avviso per gli altri', () => {
  const d = dati(); d.righe = [{ ...manuale(), codice_articolo_fornitore: 'a-1.2/3' }];
  expect(costruisciEsportazioneGamma([d]).problemi.map(p => p.codice)).not.toContain('caratteri_codice');
  d.righe = [{ ...manuale(), codice_articolo_fornitore: 'a_1' }];
  const e = costruisciEsportazioneGamma([d]); expect(e.ordiniEsportati).toEqual(['o1']); expect(e.problemi.map(p => p.codice)).toContain('caratteri_codice');
});
test('Gamma: avvisi anagrafica lead e riferimenti incompleti non bloccano', () => {
  const d = lead(); d.lead = { id: 'l1' };
  const e = costruisciEsportazioneGamma([d]); expect(e.ordiniEsportati).toEqual(['o1']);
  expect(e.problemi.map(p => p.codice)).toEqual(['lead_senza_nome', 'lead_senza_identificativo_fiscale', 'lead_senza_indirizzo', 'lead_senza_cap', 'lead_senza_citta', 'lead_senza_listino', 'lead_senza_macrocategoria', 'lead_senza_categoria']);
});
test('Gamma: note/sottototali/separatori/intestazioni kit non esportate', () => {
  const d = dati(); for (const tipo_riga of ['nota', 'sotto_totale', 'separatore', 'da_kit'] as const) d.righe.push({ id: tipo_riga, tipo_riga, quantita: 1 });
  expect(costruisciEsportazioneGamma([d]).righe.filter(r => r.TESTATA_RIGHE === 'R')).toHaveLength(2);
  expect(costruisciEsportazioneGamma([d]).problemi).toEqual([]);
});
test('Gamma: quantità zero/null esclusa con avviso, non con errore fornitore', () => {
  const d = dati(); d.righe.push({ id: 'zero', tipo_riga: 'manuale', quantita: 0 }, { id: 'null', tipo_riga: 'manuale', quantita: null });
  const e = costruisciEsportazioneGamma([d]); expect(e.ordiniEsportati).toEqual(['o1']); expect(e.righe).toHaveLength(4);
  expect(e.problemi.map(p => [p.rigaId, p.codice, p.livello])).toEqual([['zero', 'quantita_zero', 'avviso'], ['null', 'quantita_zero', 'avviso']]);
});
test('Gamma: file vero BIFF8/CFB con Sheet1, 47 colonne, data italiana e prezzo 4 decimali', () => {
  const bytes = scriviFileGammaXls(costruisciEsportazioneGamma([dati()]).righe);
  expect(Array.from(bytes.slice(0, 8))).toEqual([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const cfb = CFB.read(bytes, { type: 'array' }); const stream = CFB.find(cfb, 'Workbook');
  expect(stream?.content).toBeDefined();
  if (!stream?.content) throw new Error('Workbook BIFF assente');
  // BOF record 0x0809 e versione 0x0600: BIFF8, non semplice XLS rinominato.
  expect(Array.from(stream.content.slice(0, 6))).toEqual([0x09, 0x08, 0x10, 0x00, 0x00, 0x06]);
  const wb = XLSX.read(bytes, { type: 'array', cellNF: true }); expect(wb.SheetNames).toEqual(['Sheet1']);
  const ws = wb.Sheets['Sheet1']; if (!ws) throw new Error('Sheet1 assente');
  const righe = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  expect(righe[0]).toEqual(INTESTAZIONE); expect(ws['I2']?.w).toBe('10/12/2026');
  expect(ws['AH3']?.w).toBe('12.1235'); expect(ws['AU3']?.v).toBe(1.44);
});
test('Gamma: file vuoto conserva tutte le intestazioni e nome .xls con calendario italiano', () => {
  const wb = XLSX.read(scriviFileGammaXls([]), { type: 'array' }); const ws = wb.Sheets['Sheet1'];
  if (!ws) throw new Error('Sheet1 assente'); expect(XLSX.utils.sheet_to_json(ws, { header: 1 })[0]).toEqual(INTESTAZIONE);
  expect(nomeFileGamma(new Date('2026-11-22T17:29:00Z'))).toBe('Gamma_ordini_20261122_1829.xls');
});
test('FM95: migrazione mantiene RPC verbatim salvo i tre campi di testata', () => {
  const prima = readFileSync('drizzle/migrations/0261_fm94_copia_campi_gamma.sql', 'utf8');
  const dopo = readFileSync('drizzle/migrations/0263_fm95_ordini_riferimenti_gamma.sql', 'utf8');
  const estrai = (s: string) => s.match(/CREATE OR REPLACE FUNCTION public\.trasforma_preventivo_in_ordine[\s\S]*?\$function\$;/)?.[0];
  expect(estrai(prima)).toBeDefined(); expect(estrai(dopo)?.replace(', listino_rif, macrocategoria_rif, categoria_rif', '')
    .replace(', v_prev.listino_rif, v_prev.macrocategoria_rif, v_prev.categoria_rif', '')).toBe(estrai(prima));
});
test('FM95 3b: funzione finale copia solo lead_id, resto verbatim dopo correzione 0265', () => {
  const prima = readFileSync('drizzle/migrations/0263_fm95_ordini_riferimenti_gamma.sql', 'utf8');
  const dopo = readFileSync('drizzle/migrations/0264_fm95_ordini_lead.sql', 'utf8');
  const correzione = readFileSync('drizzle/migrations/0265_fm95_ordini_lead_correzione_verbatim.sql', 'utf8');
  const estrai = (s: string) => s.match(/CREATE OR REPLACE FUNCTION public\.trasforma_preventivo_in_ordine[\s\S]*?\$function\$;/)?.[0];
  expect(correzione).toContain("replace(definizione, 'iva_importo = t.imp + t.iva - t.imp', 'iva_importo = t.iva')");
  const finale = estrai(dopo)?.replace('iva_importo = t.imp + t.iva - t.imp', 'iva_importo = t.iva');
  expect(finale).toContain(', v_prev.lead_id');
  expect(finale?.replace(', lead_id\n', '\n').replace(', v_prev.lead_id\n', '\n')).toBe(estrai(prima));
});

test('FM96: ORD-104/26, 600 + 100 Fassa = 700 e 11 + 11 righe R nel BIFF8', () => {
  const d = dati('o104', 'ORD-104/26');
  const articoli = [
    ['FASL00H003300A0', 40, 4.167, 120.40], ['MANUALE', 2, 10, 14],
    ['FASL00A003300A0', 600, 2.695, 1188], ['COG10U050/40', 71.67, 1.026, 52.18],
    ['COG10C050/50', 338.33, 1.278, 272.06], ['KNI730060', 100, 2.171, 142],
    ['FASL00A003300A0', 100, 2.695, 198], ['AKINAF07003', 5, 8.068, 16],
    ['AKINF02002B', 143.33, 0.042, 3.08], ['AKINF57002JY', 1.69, 8.604, 10.99],
    ['FAS351E1', 8, 8.7136, 44.80], ['AKINAF01005', 3.2, 5.868, 9.41],
  ] as const;
  // Quantità/prezzi/costi reali; anagrafiche sintetiche, nessun accesso o scrittura DB.
  d.articoli = articoli.filter(([c]) => c !== 'MANUALE').map(([codice]) => ({ codice, um: 'KG', fornitore_pref_id: 'f1' }));
  d.listiniAcquisto = [...new Map(articoli.map(([codice, q, , costo]) => [codice,
    { articolo_codice: codice, listino: 10, acq_prezzo: costo / q }])).values()];
  d.righe = articoli.map(([codice, quantita, prezzo_unit, costo], i) => codice === 'MANUALE'
    ? { ...manuale(), id: `r${i}`, quantita, prezzo_unit, costo, um2: null, fattore_conversione: null }
    : { id: `r${i}`, tipo_riga: 'articolo_singolo', articolo_codice: codice, quantita, prezzo_unit, costo, sconti_gamma: [10] });
  const prima = JSON.stringify(d);
  const e = costruisciEsportazioneGamma([d]);
  for (const documento of ['MD-F-ORDINE', 'MD-C-ORDINE']) {
    const righe = e.righe.filter(r => r.CODICE_DOCUMENTO === documento && r.TESTATA_RIGHE === 'R');
    expect(righe).toHaveLength(11);
    expect(righe.filter(r => r.COD_ART === 'FASL00A003300A0')).toHaveLength(1);
    expect(righe.find(r => r.COD_ART === 'FASL00A003300A0')?.QTA1).toBe(700);
  }
  expect(clienteR(d)).toBeDefined();
  expect(e.righe.find(r => r.COD_ART === 'FASL00A003300A0' && r.IND_CLIFOR === 0)).toMatchObject({ PRZ1: 2.695, SCT1: 10 });
  expect(e.righe.find(r => r.COD_ART === 'FASL00A003300A0' && r.IND_CLIFOR === 1)?.PRZ1).toBe(1.98);
  const wb = XLSX.read(scriviFileGammaXls(e.righe), { type: 'array' });
  const ws = wb.Sheets['Sheet1']; if (!ws) throw new Error('Sheet1 assente');
  const file = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  expect(file.filter(r => r['TESTATA_RIGHE'] === 'R')).toHaveLength(22);
  expect(JSON.stringify(d)).toBe(prima);
});
test('FM96: prezzi diversi, due righe cliente e avviso unico per articolo/documento', () => {
  const d = dati(); const prima = d.righe[0]; if (!prima) throw new Error('Riga assente');
  d.righe.push({ ...prima, id: 'r2', prezzo_unit: 22 }, { ...prima, id: 'r3', prezzo_unit: 23 });
  const e = costruisciEsportazioneGamma([d]);
  expect(e.righe.filter(r => r.CODICE_DOCUMENTO === 'MD-C-ORDINE' && r.TESTATA_RIGHE === 'R')).toHaveLength(3);
  expect(e.righe.filter(r => r.CODICE_DOCUMENTO === 'MD-F-ORDINE' && r.TESTATA_RIGHE === 'R')).toHaveLength(1);
  expect(e.problemi.filter(p => p.codice === 'articolo_ripetuto_condizioni_diverse')).toHaveLength(1);
  d.righe.pop();
  expect(costruisciEsportazioneGamma([d]).righe.filter(r => r.CODICE_DOCUMENTO === 'MD-C-ORDINE' && r.TESTATA_RIGHE === 'R')).toHaveLength(2);
});
test('FM96: due fornitori restano separati, cliente sommato e nessuna unione tra ordini', () => {
  const d = dati(); const prima = d.righe[0]; if (!prima) throw new Error('Riga assente');
  d.righe.push({ ...prima, id: 'r2', fornitore_id: 'f2', quantita: 5 });
  const e = costruisciEsportazioneGamma([d, dati('o2', 'ORD-2/26')]);
  expect(e.righe.filter(r => r.TESTATA_RIGHE === 'T' && r.IND_CLIFOR === 1)).toHaveLength(3);
  expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R' && r.IND_CLIFOR === 1).map(r => r.QTA1)).toEqual([10, 5, 10]);
  expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R' && r.IND_CLIFOR === 0).map(r => r.QTA1)).toEqual([15, 10]);
  expect(e.problemi).toEqual([]);
});
test('FM96: riga inserita UM2 e riga UM1 unite in UM1 tramite patch canonica', () => {
  const d = dati(); const prima = d.righe[0]; if (!prima) throw new Error('Riga assente');
  const r = { ...prima, um: 'KG', um2: 'NR', fattore_conversione: 25, um_scelta: 'um2' };
  d.righe = [{ ...r, id: 'um2', ...rigaInUnita(r, { um: 'KG', um2: 'NR', fattore_conversione: 25 }, { quantita: 4, prezzo_unit: 50 }).patchUm1 },
    { ...r, id: 'um1', um_scelta: 'um1', quantita: 50, prezzo_unit: 2 }];
  d.articoli = d.articoli.map(a => ({ ...a, um: 'KG', um2: 'NR', fattore_conversione: 25 }));
  const e = costruisciEsportazioneGamma([d]);
  expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R')).toHaveLength(2);
  expect(clienteR(d)).toMatchObject({ QTA1: 150, PRZ1: 2, Unita_misura_1_articolo: 'KG' });
  expect(fornitoreR(d)?.QTA1).toBe(150);
});
test('FM96: confronto prezzi già a 4 decimali, somma quantità a 4 e posizione/descrizione prima occorrenza', () => {
  const d = dati(); const prima = d.righe[0]; if (!prima) throw new Error('Riga assente');
  d.righe = [{ ...prima, quantita: 0.1, prezzo_unit: 2.69501, descrizione: 'Prima' },
    { ...manuale(), id: 'intermedia' }, { ...prima, id: 'r2', quantita: 0.2, prezzo_unit: 2.69502, descrizione: 'Seconda' }];
  expect(clienteR(d)).toMatchObject({ QTA1: 0.3, PRZ1: 2.695, descrizione: 'Prima' });
  expect(costruisciEsportazioneGamma([d]).righe.filter(r => r.IND_CLIFOR === 0 && r.TESTATA_RIGHE === 'R').map(r => r.COD_ART)).toEqual(['GAM-1', 'ABX12']);
  d.righe = [{ ...prima, quantita: 0.123456 }, { ...prima, id: 'r2', quantita: 0.000006 }];
  expect(clienteR(d)?.QTA1).toBe(0.1235);
  d.righe.pop();
  expect(clienteR(d)?.QTA1).toBe(0.123456);
});
test('FM96: avvisi preesistenti restano uno per riga anche dopo somma', () => {
  const d = dati(); const prima = d.righe[0]; if (!prima) throw new Error('Riga assente');
  d.righe = [{ ...prima, descrizione: 'X'.repeat(80) }, { ...prima, id: 'r2', descrizione: 'Y'.repeat(80) }];
  d.listiniAcquisto = [];
  const e = costruisciEsportazioneGamma([d]);
  expect(e.problemi.filter(p => p.codice === 'descrizione_troncata').map(p => p.rigaId)).toEqual(['r1', 'r2']);
  expect(e.problemi.filter(p => p.codice === 'acquisto_assente').map(p => p.rigaId)).toEqual(['r1', 'r2']);
  expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R')).toHaveLength(2);
});
for (const campo of ['acq_sc1', 'acq_sc2', 'acq_sc3', 'acq_trasporto_perc', 'acq_trasporto_euro', 'acq_prezzo'] as const)
  test(`FM96: condizioni fornitore diverse ${campo}, righe separate solo nel fornitore`, () => {
    const d = dati();
    d.righe = [{ id: 'gamma', tipo_riga: 'articolo_singolo', articolo_codice: 'GAM-1', quantita: 10, prezzo_unit: 30 },
      { ...manuale(), id: 'manuale', marca: 'GAM', codice_articolo_fornitore: '-1', quantita: 5, costo: 100 }];
    d.listiniAcquisto = [{ articolo_codice: 'GAM-1', listino: 10, acq_prezzo: 20, [campo]: campo === 'acq_prezzo' ? 21 : 2 }];
    const e = costruisciEsportazioneGamma([d]);
    expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R' && r.IND_CLIFOR === 1)).toHaveLength(2);
    expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R' && r.IND_CLIFOR === 0)).toHaveLength(1);
    expect(e.problemi.filter(p => p.codice === 'articolo_ripetuto_condizioni_diverse')).toHaveLength(1);
  });
for (const campo of ['SCT1', 'SCT2', 'sct3', 'magg %'] as const)
  test(`FM96: condizioni cliente diverse ${campo} non unite`, () => {
    const d = dati(); const prima = d.righe[0]; if (!prima) throw new Error('Riga assente');
    const patch = campo === 'magg %' ? { maggiorazione_perc: 5 }
      : { sconti_gamma: campo === 'SCT1' ? [12, 5, 2] : campo === 'SCT2' ? [10, 6, 2] : [10, 5, 4], sconto_perc: 0 };
    d.righe.push({ ...prima, id: 'r2', ...patch });
    const e = costruisciEsportazioneGamma([d]);
    expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R' && r.IND_CLIFOR === 0)).toHaveLength(2);
    expect(e.problemi.filter(p => p.codice === 'articolo_ripetuto_condizioni_diverse')).toHaveLength(1);
  });
test('FM96: avviso una volta per articolo in ciascun documento, anche con tre condizioni', () => {
  const d = dati(); const r = manuale();
  d.righe = [r, { ...r, id: 'r2', costo: 200, prezzo_unit: 60 }, { ...r, id: 'r3', costo: 300, prezzo_unit: 90 }];
  const e = costruisciEsportazioneGamma([d]);
  expect(e.righe.filter(r => r.TESTATA_RIGHE === 'R')).toHaveLength(6);
  expect(e.problemi.filter(p => p.codice === 'articolo_ripetuto_condizioni_diverse')).toHaveLength(2);
});
test('FM96: trigger verbatim salvo filtro ordine e FOR SHARE', () => {
  const prima = readFileSync('drizzle/migrations/0267_fm96_gamma_campi_servizio_ruoli.sql', 'utf8');
  const dopo = readFileSync('drizzle/migrations/0268_fm96_gamma_lock_solo_ordini.sql', 'utf8');
  expect(dopo.replace(" AND p.tipo = 'ordine' ORDER BY p.id FOR SHARE LOOP", ' ORDER BY p.id FOR UPDATE LOOP').trimEnd()).toBe(prima.trimEnd());
});