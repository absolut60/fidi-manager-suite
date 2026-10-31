import { test, expect, mock } from 'bun:test';
mock.module('@/integrations/supabase/client', () => ({ supabase: {} }));
const { costruisciWorkbook } = await import('../src/lib/fido-teorico-export');
import type { RigaExport } from '../src/lib/fido-teorico-export';
const r: RigaExport = {
 codice_gestionale:'5737', ragione_sociale:'Cliente test', partita_iva:'00123', sede:'Sede', agente:'', categoria:'', condizione_pagamento:'',
 giorni:60, fatturato_rolling:20000, fido_base:4000, fido_proposto:60000, fido_attuale:60000, scostamento:0, regola:'calcolo',
 scaduto:50000, a_scadere:0, totale_rischio:55450.06, doc_da_fatturare:0, doc_da_evadere:0, picco_esposizione:55450.06,
 num_insoluti:1, bloccato:false, attivo:true, mesi_attivi:12, fatturato_anno_corrente:10000, fatturato_anno_precedente:20000,
 dinamica:'consolidato', ritmo_mensile:1000, giorni_oltre_accordo:0, profilo_pagamento:'Patologico: scaduto fermo', coefficiente:0.2,
 fido_proposto_senza_coefficiente:60000, richiede_verifica:false, nota_proposta:'Spiegazione del calcolo', sede_cinisello:false,
 ddt_incluso:0, fido_teorico_puro:4000, fabbisogno:55450.06, acquisto_storico:2000, acquisto_tendenza:1000,
 ciclo_gg:60.5, mesi_stagionali:3, ordini_aperti:0, consumo_perc:0.9241676667,
};
test('workbook exports new calculation values without substituting the old base or profile', () => {
 const wb = costruisciWorkbook([r], { estrattoIl: new Date('2026-10-31T07:47:00Z'), mesiRolling:12 });
 const ws = wb.Sheets['Fido teorico'];
 expect(ws.J2.v).toBe(4000);
 expect(ws.K2.v).toBe(60000);
 expect(ws.AC2.v).toBe('Patologico: scaduto fermo');
 expect(ws.AG2.v).toBe('Spiegazione del calcolo');
 expect(ws.AI2.v).toBe(55450.06);
 expect(ws.AM2.v).toBe(3);
 expect(ws.AO2.v).toBe(0.9241676667);
 expect(wb.Sheets.Riepilogo.B8.v).toBe(4000);
 expect(wb.Sheets.Riepilogo.B9.v).toBe(60000);
});
