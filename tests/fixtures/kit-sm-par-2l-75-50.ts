import type { KitPerExcel } from '../../src/lib/kit-excel';
// Copia in sola lettura del kit reale SM-PAR-2L-75-50 (21/11/2026), descrizioni/UM Gamma comprese.
const r = (ordine: number, ruolo: string, articolo_codice: string, gdesc: string, gum: string, v: Partial<Record<'n_pezzi'|'passo'|'passo_2'|'consumo'|'lati'|'confezione'|'sfrido'|'riga_rif'|'peso_unitario', number>>, note: string) => ({
  ordine, ruolo, articolo_codice, codice_articolo_fornitore: null, descrizione: null, um: null, note,
  n_pezzi: v.n_pezzi ?? null, passo: v.passo ?? null, passo_2: v.passo_2 ?? null, consumo: v.consumo ?? null, lati: v.lati ?? null,
  confezione: v.confezione ?? null, sfrido: v.sfrido ?? null, riga_rif: v.riga_rif ?? null, peso_unitario: v.peso_unitario ?? null,
  articolo: { descrizione: gdesc, um: gum },
});
export const FAMIGLIE_TEST = [
  { id: 'f-parete', linea: 'sistema_made' as const, codice: 'PARETE', nome: 'Parete', attiva: true },
  { id: 'f-altro', linea: 'sistema_made' as const, codice: 'ALTRO', nome: 'Altro', attiva: true },
  { id: 'f-sr', linea: 'showroom' as const, codice: 'BAGNO', nome: 'Bagno', attiva: true },
];
export const KIT_REALE: KitPerExcel = {
  codice: 'SM-PAR-2L-75-50', nome: 'PARETE 75/50 LASTRE 1+1 PASSO 60', linea: 'sistema_made', famiglia_id: 'f-parete', um_base: 'mq',
  descrizione_tecnica: 'STRUTTURA METALLICA AZ 6/10 - MONTANTE C50 - PASSO MONTANTI 600 MM, MONTANTE DOPPIO.',
  componenti: [
    r(1, 'LASTRE', 'FASL00A003300A0', 'LASTRA CARTONGESSO GYPSOTECH STD BA 1200X3000 SP.13 MM', 'MQ', { n_pezzi: 1, lati: 4, peso_unitario: 8.7 }, '1 mq di lastra per mq (lato 1)'),
    r(2, 'GUIDE', 'COG10U050/40', 'GUIDA U50 40/50/40 6/10 - ML.3 (8 pz/conf)', 'ML', { n_pezzi: 1, consumo: 0.716666666666667 }, '(2/3 + 5%) ml per mq × numero guide'),
    r(3, 'MONTANTI', 'COG10C050/50', 'MONTANTE C50 50/48/47 6/10 - ML.3 (8 pz/conf)', 'ML', { n_pezzi: 2, passo: 0.6, sfrido: 0.05 }, 'n. montanti ÷ passo + 0,05'),
    r(4, 'ISOLANTI', 'KNI730060', 'ROTOLO DECIWOOL D.13 45X600X(2x7800) MM (18,72 MQ/CF)', 'MQ', { n_pezzi: 1, peso_unitario: 0.59 }, '1 mq di isolante per mq'),
    r(5, 'LASTRE', 'FASL00A003300A0', 'LASTRA CARTONGESSO GYPSOTECH STD BA 1200X3000 SP.13 MM', 'MQ', { n_pezzi: 1, peso_unitario: 8.7 }, '1 mq di lastra per mq (lato 2)'),
    r(6, 'GUARNIZIONE', 'AKINAF07003', 'NASTRO BIADESIVO MM.50X20MT', 'RT', { n_pezzi: 1, confezione: 20 }, 'n. guide ÷ rotolo 20 ml (da verificare con Andrea)'),
    r(7, 'TASSELLI', 'AKINF02002B', 'TASSELLO ESPANSIONE NYLON D.6X30 CON COLLARE+VITE D.5X40(200 pz/conf)', 'PZ', { passo: 0.5, riga_rif: 2, peso_unitario: 0.0043 }, 'ml guide ÷ 0,5 m = pezzi/mq (peso 0,86 kg a confezione da 200)'),
    r(8, 'VITI', 'AKINF57002JY', 'VITE PER CARTONGESSO AUTOFILETTANTE FOSFATATA NERO D.3,5X25(1000pz/conf)', 'CO', { lati: 2, passo: 0.2, confezione: 1000, riga_rif: 3, peso_unitario: 1.4 }, 'ml montanti per montante ÷ 0,2 m ÷ 1000 pz × lati'),
    r(9, 'STUCCO', 'FAS351E1', 'FASSAJOINT 1H STUCCO CARTONGESSO KG.10', 'NR', { consumo: 0.4, lati: 2, confezione: 10, peso_unitario: 10 }, '0,4 kg/mq ÷ sacco 10 kg × lati'),
    r(10, 'NASTRO RETE', 'AKINAF01005', 'NASTRO A RETE COPRIGIUNTO AUTOADESIVO FIBRA DI VETRO FIBATAPE MM.48x90MT', 'RT', { consumo: 1.44, lati: 2, confezione: 90, peso_unitario: 0.3 }, '1,44 ml/mq ÷ rotolo 90 ml × lati'),
  ],
};
