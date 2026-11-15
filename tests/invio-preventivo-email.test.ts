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
