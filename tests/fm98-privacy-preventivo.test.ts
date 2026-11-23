import { expect, test } from 'bun:test';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { generaSchedaCliente } from '../src/lib/scheda-pdf';
import { accodaPrivacyPreventivo, inputPrivacyPreventivo, unisciPdfPrivacy, type ClientePrivacyPreventivo, type LeadPrivacyPreventivo } from '../src/lib/privacy-preventivo';
import type { PreventivoConDettagli } from '../src/lib/preventivi-api';
import { INPUT_PRIVACY_IDENTITA } from './fixtures/fm98-privacy-inputs';

async function testiPagine(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map(page => {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return refs.map(ref => {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return '';
      const raw = new TextDecoder().decode(decodePDFRawStream(stream).decode());
      return raw.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) => Buffer.from(hex, 'hex').toString('latin1'));
    }).join('\n');
  });
}

const cliente: ClientePrivacyPreventivo = {
  ragione_sociale: 'Azienda prova', partita_iva: '12345678901', codice_fiscale: '12345678901', tipo_soggetto: 'azienda',
  indirizzo: ' Via Prova 1 ', cap: '20100', citta: 'Milano', provincia: 'MI', email: ' prova@example.test ', cellulare: ' 3330000000 ',
};
const intestazione = { cliente: { ragione_sociale: 'Azienda prova' }, lead: null };

test('FM98 cliente azienda: nome canonico, PIVA e contatti soggetto, nessun dichiarante/CF azienda', () => {
  const input = inputPrivacyPreventivo(intestazione, cliente);
  expect(input).toMatchObject({ tipo: 'nuovo', daFirmare: true, ragioneSociale: 'Azienda prova', partitaIva: '12345678901', codiceFiscaleDich: '',
    residenza: 'Via Prova 1, 20100 Milano, (MI)', emailDich: 'prova@example.test', cellulareDich: '3330000000', dataFirma: '' });
  expect([input.dichiaranteNome, input.dichiaranteCognome, input.luogoNascita, input.dataNascita]).toEqual([undefined, undefined, undefined, undefined]);
});
test('FM98 privato: senza PIVA e con CF nella riga Codice fiscale', () => {
  const input = inputPrivacyPreventivo({ cliente: { ragione_sociale: 'Mario Rossi' } }, { ...cliente, partita_iva: null, codice_fiscale: 'RSSMRA80A01F205X', tipo_soggetto: 'persona_fisica' });
  expect(input.partitaIva).toBe('');
  expect(input.codiceFiscaleDich).toBe('RSSMRA80A01F205X');
  expect(input.ragioneSociale).toBe('Mario Rossi');
});
test('FM98 lead persona fisica: nome+cognome solo in Societa, non nel dichiarante', () => {
  const lead: LeadPrivacyPreventivo = { ...cliente, ragione_sociale: null, nome: 'Anna', cognome: 'Bianchi', partita_iva: null,
    codice_fiscale: 'BNCNNA80A41F205X', tipo_soggetto: 'persona_fisica', indirizzo: null, cap: null, citta: null, provincia: null, email: null, cellulare: null };
  const input = inputPrivacyPreventivo({ cliente: null, lead }, lead);
  expect(input.ragioneSociale).toBe('Anna Bianchi');
  expect(input.codiceFiscaleDich).toBe('BNCNNA80A41F205X');
  expect([input.partitaIva, input.residenza, input.emailDich, input.cellulareDich]).toEqual(['', '', '', '']);
  expect(input.dichiaranteNome).toBeUndefined();
});
test('FM98 lead azienda e soggetto assente: campi mancanti vuoti, nessun valore inventato', () => {
  const lead = { ...cliente, nome: null, cognome: null };
  expect(inputPrivacyPreventivo({ lead }, lead).partitaIva).toBe('12345678901');
  expect(inputPrivacyPreventivo({ cliente: null, lead: null })).toMatchObject({ ragioneSociale: '', partitaIva: '', codiceFiscaleDich: '', residenza: '', emailDich: '', cellulareDich: '' });
});

test('FM98 modulo da firmare: tutte caselle vuote, data assente, Firma e nessuna prova telematica', async () => {
  const input = INPUT_PRIVACY_IDENTITA['cliente_firma'];
  if (!input) throw new Error('Fixture assente');
  const bytes = await generaSchedaCliente({ ...input, daFirmare: true, ipRaccolta: '192.0.2.1', dataOraRaccolta: '23/11/2026, 11:10' });
  const testi = await testiPagine(bytes);
  const consenso = testi[1] ?? '';
  expect(testi).toHaveLength(2);
  expect(consenso.match(/\[ \]  fornisce il consenso/g)).toHaveLength(3);
  expect(consenso.match(/\[ \]  nega il consenso/g)).toHaveLength(3);
  expect(consenso).not.toContain('[X]');
  expect(consenso).not.toContain('Modalit');
  expect(consenso).not.toContain('conferma telematica');
  expect(consenso).not.toContain('Indirizzo IP');
  expect(consenso).not.toContain('23/11/2026');
  expect(consenso).toContain('Li ____________');
  expect(consenso).toContain('Firma');
  await Bun.write('/tmp/browser/fm98-privacy/da-firmare.pdf', bytes);
});
test('FM98 da firmare svuota anche i consensi separati WhatsApp/email', async () => {
  const bytes = await generaSchedaCliente({ ...inputPrivacyPreventivo(intestazione, cliente), consensiCanaliMarketing: { whatsapp: true, email: true }, mostraConsensoMedia: false });
  const consenso = (await testiPagine(bytes))[1] ?? '';
  expect(consenso).not.toContain('[X]');
  expect(consenso.match(/\[ \]  fornisce il consenso/g)).toHaveLength(3);
});

test('FM98 moduli esistenti identici byte per byte al motore prima della modifica (cinque chiamanti, omissione/false)', async () => {
  const script = `
    import {createHash} from 'node:crypto';
    import {readFileSync} from 'node:fs';
    import {INPUT_PRIVACY_IDENTITA} from './tests/fixtures/fm98-privacy-inputs.ts';
    import {generaSchedaCliente} from './src/lib/scheda-pdf.ts';
    const NativeDate=Date;
    class FrozenDate extends NativeDate { constructor(value) { super(value ?? '2026-11-23T10:10:00Z'); } static now(){return 1795428600000;} }
    globalThis.Date=FrozenDate;
    const hashes=JSON.parse(readFileSync('./tests/fixtures/fm98-privacy-baseline.json','utf8'));
    for(const [name,input] of Object.entries(INPUT_PRIVACY_IDENTITA)) {
      for(const value of [input,{...input,daFirmare:false}]) {
        const bytes=await generaSchedaCliente(value);
        if(createHash('sha256').update(bytes).digest('hex')!==hashes[name]) throw Error('Differenza byte '+name);
      }
    }
  `;
  const p = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe', env: { ...process.env, TZ: 'UTC' } });
  const stderr = await new Response(p.stderr).text();
  expect(await p.exited, stderr).toBe(0);
});

test('FM98 unione: prima documento, poi informativa e consenso, numerazioni indipendenti', async () => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText('DOCUMENTO CLIENTE Pag. 1 / 1');
  const blob = new Blob([new Uint8Array(await doc.save())], { type: 'application/pdf' });
  const privacy = await generaSchedaCliente(inputPrivacyPreventivo(intestazione, cliente));
  const unito = await unisciPdfPrivacy(blob, privacy);
  const pagine = await testiPagine(new Uint8Array(await unito.arrayBuffer()));
  expect(pagine).toHaveLength(3);
  expect(pagine[0]).toContain('DOCUMENTO CLIENTE Pag. 1 / 1');
  expect(pagine[1]).toContain('INFORMATIVA RESA');
  expect(pagine[1]).toContain('Pag. 1 di 2');
  expect(pagine[2]).toContain('FORMULAZIONE DEL CONSENSO');
  expect(pagine[2]).toContain('Pag. 2 di 2');
  await Bun.write('/tmp/browser/fm98-privacy/unito.pdf', unito);
});

test('FM98 spunta assente: stesso documento/blob/byte e nessuna generazione o lettura', async () => {
  const documento = { blob: new Blob(['PDF di prova']), fileName: 'preventivo.pdf' };
  let chiamate = 0;
  const result = await accodaPrivacyPreventivo(documento, {} as PreventivoConDettagli, false, async () => { chiamate++; return new Uint8Array(); });
  expect(chiamate).toBe(0);
  expect(result.documento).toBe(documento);
  expect(result.documento.blob).toBe(documento.blob);
  expect(await result.documento.blob.text()).toBe('PDF di prova');
  expect(result.privacyNonAccodata).toBe(false);
});
test('FM98 errore modulo o unione: documento originario e segnale di avviso', async () => {
  const documento = { blob: new Blob(['originale']), fileName: 'ordine.pdf' };
  for (const genera of [async () => { throw new Error('modulo fallito'); }, async () => new Uint8Array([1, 2])]) {
    const result = await accodaPrivacyPreventivo(documento, {} as PreventivoConDettagli, true, genera);
    expect(result.documento).toBe(documento);
    expect(result.privacyNonAccodata).toBe(true);
    expect(await result.documento.blob.text()).toBe('originale');
  }
});

test('FM98 letture anagrafiche solo soggetto del documento e solo campi reali, senza ampliamento RLS', async () => {
  const script = `
    import {mock} from 'bun:test';
    const calls=[];
    const dati={ragione_sociale:'Cliente',partita_iva:'123',codice_fiscale:null,tipo_soggetto:'azienda',indirizzo:'Via A',cap:'1',citta:'Citta',provincia:'MI',email:'cliente@example.test',cellulare:'333'};
    mock.module('@/integrations/supabase/client',()=>({supabase:{
      rpc:async(name,args)=>{calls.push({name,args});return {data:[dati],error:null}},
      from:table=>({select:cols=>({eq:(key,id)=>({single:async()=>{calls.push({table,cols,key,id});return {data:{...dati,ragione_sociale:'Lead',nome:null,cognome:null},error:null}}})})})
    }}));
    const {caricaInputPrivacyPreventivo}=await import('./src/lib/privacy-preventivo.ts');
    const cliente=await caricaInputPrivacyPreventivo({cliente_id:'c1',lead_id:null,cliente:{ragione_sociale:'Cliente'},lead:null});
    if(calls[0].name!=='dati_cliente_preventivo'||calls[0].args._id!=='c1'||cliente.emailDich!=='cliente@example.test') throw Error('Lettura cliente errata');
    const lead=await caricaInputPrivacyPreventivo({cliente_id:null,lead_id:'l1',cliente:null,lead:{ragione_sociale:'Lead',nome:null,cognome:null}});
    if(calls[1].table!=='lead'||calls[1].id!=='l1'||calls[1].cols.includes('*')||lead.ragioneSociale!=='Lead') throw Error('Lettura lead errata');
  `;
  const p = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const stderr = await new Response(p.stderr).text();
  expect(await p.exited, stderr).toBe(0);
});

test('FM98 PDF cliente e ordine di tutte le linee: documento invariato senza spunta, condizioni prima delle due privacy', async () => {
  const script = `
    import {mock} from 'bun:test';
    import {PDFDocument} from 'pdf-lib';
    mock.module('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{valore:'CONDIZIONI DI VENDITA'},error:null})})})})}}));
    const {exportPreventivoPdf,exportPropostaRapidaPdf}=await import('./src/lib/pdf-export.ts');
    const {accodaPrivacyPreventivo,inputPrivacyPreventivo}=await import('./src/lib/privacy-preventivo.ts');
    const {generaSchedaCliente}=await import('./src/lib/scheda-pdf.ts');
    const base={numero:'DOC-TEST',data:'2026-11-23',validita:'2026-12-23',store_id:null,filiale:null,cliente_id:null,lead_id:null,cliente:null,lead:null,cantiere:null,agente:null,blocchi:[],iva_perc:22,regime_iva:'ordinaria',sconto_piede_perc:0};
    for(const linea of ['showroom','sistema_made','edilizia','fotovoltaico']) for(const tipo of ['preventivo','ordine']) for(const fn of [exportPreventivoPdf,exportPropostaRapidaPdf]) {
      const prev={...base,linea,tipo};const originale=await fn(prev);
      const no=await accodaPrivacyPreventivo(originale,prev,false);
      if(no.documento!==originale) throw Error('Identita senza spunta persa');
      const si=await accodaPrivacyPreventivo(originale,prev,true,async()=>generaSchedaCliente(inputPrivacyPreventivo(prev)));
      const prima=await PDFDocument.load(await originale.blob.arrayBuffer());
      const dopo=await PDFDocument.load(await si.documento.blob.arrayBuffer());
      if(dopo.getPageCount()!==prima.getPageCount()+2||si.documento.fileName!==originale.fileName) throw Error('Unione/filename errato');
    }
  `;
  const p = Bun.spawn(['bun', '-e', script], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const stderr = await new Response(p.stderr).text();
  expect(await p.exited, stderr).toBe(0);
});