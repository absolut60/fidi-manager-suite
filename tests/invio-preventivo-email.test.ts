import { expect, test } from 'bun:test';
import { renderTemplate, TEMPLATE_INVIO_PREVENTIVO_DEFAULT, SEDE_FALLBACK } from '@/lib/template-email-render';
import { costruisciEmailPreventivo, inputInvioPreventivo } from '@/lib/invio-preventivo-email-core';

const preventivo = { numero: 'PRV-167/26', titolo: 'Bagno', validita: '2026-12-31', totale_ivato: 12200, sede: 'SEDE DI LISSONE' };

test('template default: oggetto "Preventivo {{numero}} — {{titolo}}" risolto', () => {
  const r = renderTemplate(TEMPLATE_INVIO_PREVENTIVO_DEFAULT, { ragione_sociale: 'PIPPO SRL', nome_operatore: 'Andrea', scadenze: [], preventivo }, { tipo: 'invio_preventivo' });
  expect(r.oggetto).toBe('Preventivo PRV-167/26 — Bagno');
  expect(r.corpo).toContain('31/12/2026');
  expect(r.corpo).toContain('12.200,00');
  expect(r.corpo).toContain('PIPPO SRL');
  expect(r.corpo).not.toContain('{{');
});
test('senza dati preventivo le variabili restano vuote come prima', () => {
  expect(renderTemplate({ oggetto: 'A {{numero}}B', corpo: '' }, { ragione_sociale: '', nome_operatore: '', scadenze: [] }).oggetto).toBe('A B');
});
test('email: piè GDPR, sede del preventivo, CID solo nella versione di invio', () => {
  const e = costruisciEmailPreventivo({ oggetto: TEMPLATE_INVIO_PREVENTIVO_DEFAULT.oggetto, corpo: 'Riga1\nRiga2', ragioneSociale: 'PIPPO SRL', preventivo, sede: { ...SEDE_FALLBACK, nome: 'SEDE DI LISSONE' }, mittente: { nome: 'Andrea', email: 'a@made.it' } });
  expect(e.oggetto).toBe('Preventivo PRV-167/26 — Bagno');
  expect(e.htmlInvio).toContain('cid:logoMade');
  expect(e.htmlArchivio).not.toContain('cid:logoMade');
  expect(e.htmlInvio).toContain('Riga1<br/>Riga2');
  expect(e.htmlInvio).toContain('SEDE DI LISSONE');
  expect(e.htmlInvio).toContain('regolamento UE 2016/679');
});
test('destinatari: validi, ripetuti, oltre 10', () => {
  const base = { preventivoId: '00000000-0000-4000-8000-000000000000', oggetto: 'o', corpo: 'c', pdf: { filename: 'p.pdf', base64: 'JVBERg==' } };
  expect(inputInvioPreventivo.safeParse({ ...base, to: ['a@b.it'], cc: ['c@d.it'] }).success).toBe(true);
  expect(inputInvioPreventivo.safeParse({ ...base, to: ['non-email'] }).success).toBe(false);
  expect(inputInvioPreventivo.safeParse({ ...base, to: ['a@b.it'], bcc: ['A@b.it'] }).success).toBe(false);
  expect(inputInvioPreventivo.safeParse({ ...base, to: Array.from({ length: 11 }, (_, i) => `x${i}@b.it`) }).success).toBe(false);
  expect(inputInvioPreventivo.safeParse({ ...base, to: [] }).success).toBe(false);
});

test('selettori del recupero e invio massivo escludono solo il modello preventivo', async () => {
  const { isTemplateRecupero, templateInvioPreventivo } = await import('@/lib/invio-preventivo-email-core');
  const lista = [{ tipo: 'sollecito_1' }, { tipo: 'invio_preventivo' }, { tipo: 'libero' }, { tipo: 'promemoria_scadenza' }];
  expect(lista.filter(isTemplateRecupero).map(t => t.tipo)).toEqual(['sollecito_1', 'libero', 'promemoria_scadenza']);
  expect(templateInvioPreventivo([...lista, { tipo: 'invio_preventivo', attivo: false }]).length).toBe(1);
});
test('destinatario proposto: prima email valorizzata del cliente, altrimenti email del lead', async () => {
  const { destinatarioPropostoPreventivo } = await import('@/lib/invio-preventivo-email-core');
  expect(destinatarioPropostoPreventivo({ email: ' ', email_2: null, email_3: 'c@d.it', pec: 'p@pec.it' }, null)).toBe('c@d.it');
  expect(destinatarioPropostoPreventivo({ email: null, email_2: '', email_3: null, pec: 'p@pec.it' }, null)).toBe('p@pec.it');
  expect(destinatarioPropostoPreventivo(null, { email: 'lead@x.it' })).toBe('lead@x.it');
  expect(destinatarioPropostoPreventivo(null, null)).toBe('');
});
test('nome file: slug del lead o del cliente, "cliente" senza soggetto', async () => {
  const { nomeFileDocumentoPreventivo } = await import('@/lib/soggetto-preventivo');
  expect(nomeFileDocumentoPreventivo({ numero: 'PRV-167/26', cliente: null, lead: { ragione_sociale: 'PIPPO SRL', nome: null, cognome: null } }, 'preventivo')).toBe('preventivo_PRV-167_26_PIPPO_SRL.pdf');
  expect(nomeFileDocumentoPreventivo({ numero: 'PRV-1/26', cliente: { ragione_sociale: 'Rossi & C. SpA' }, lead: null }, 'lista-materiali', 'xlsx')).toBe('lista-materiali_PRV-1_26_Rossi_C_SpA.xlsx');
  expect(nomeFileDocumentoPreventivo({ numero: null, cliente: null, lead: null }, 'preventivo')).toBe('preventivo_senza-numero_cliente.pdf');
});
test('corpo del modello in testo modificabile', async () => {
  const { htmlInTestoSemplice } = await import('@/lib/invio-preventivo-email-core');
  expect(htmlInTestoSemplice('<p>Gentile A &amp; B,</p>\n<p>riga1<br/>d&#39;accordo</p>')).toBe("Gentile A & B,\n\nriga1\nd'accordo");
});

test('stato dopo invio: solo bozza diventa inviato', async () => {
  const { statoDopoInvioPreventivo } = await import('@/lib/invio-preventivo-email-core');
  expect(statoDopoInvioPreventivo('bozza')).toBe('inviato');
  expect(statoDopoInvioPreventivo('inviato')).toBeNull();
  expect(statoDopoInvioPreventivo('confermato')).toBeNull();
  expect(statoDopoInvioPreventivo('ordinato')).toBeNull();
  expect(statoDopoInvioPreventivo(null)).toBeNull();
});
test('attività registrata: email completata con destinatari, operatore e copia archiviata', async () => {
  const { attivitaInvioPreventivo } = await import('@/lib/invio-preventivo-email-core');
  const r = attivitaInvioPreventivo({
    preventivo: { id: 'p1', numero: 'PRV-167/26', cliente_id: null, lead_id: 'l1', agente_codice: '7', store_id: 's1' },
    operatoreId: 'u1', oggetto: 'Preventivo PRV-167/26 — Bagno', htmlArchivio: '<html>copia</html>',
    to: ['a@b.it'], cc: ['c@d.it', 'e@f.it'], bcc: [], quando: '2026-11-15T23:00:00.000Z',
  });
  expect(r).toMatchObject({ tipo: 'email', completata: true, preventivo_id: 'p1', lead_id: 'l1', cliente_id: null, store_id: 's1', agente_codice: '7', operatore_id: 'u1',
    email_destinatario: 'a@b.it', email_cc: 'c@d.it, e@f.it', email_bcc: null, email_oggetto: 'Preventivo PRV-167/26 — Bagno', email_corpo_html: '<html>copia</html>',
    data_svolgimento: '2026-11-15T23:00:00.000Z' });
  expect(attivitaInvioPreventivo({ preventivo: { id: 'p', numero: null, cliente_id: 'c', lead_id: 'l', agente_codice: null, store_id: null }, operatoreId: 'u', oggetto: 'o', htmlArchivio: 'h', to: ['a@b.it'], cc: [], bcc: [], quando: 'x' }).lead_id).toBeNull();
});
