import { expect, test } from 'bun:test';
import { brandingSede, erroreFileLogo, MAX_LOGO_BYTES } from '../src/lib/branding-sede';
import { LOGO_EMAIL_URL, SEDE_FALLBACK } from '../src/lib/template-email-render';

const base = 'https://storage.example.test';
test('senza sede: fallback completo, senza contatti inventati', () => {
  expect(brandingSede(null, base)).toEqual({ ...SEDE_FALLBACK, email: null, pec: null,
    logoEmailPath: null, logoPdfPath: null, logoEmailUrl: LOGO_EMAIL_URL, logoPdfUrl: null });
});
test('sede senza loghi: email MADE e dati mancanti dal fallback', () => {
  const result = brandingSede({ nome: 'SEDE TEST', indirizzo: null, telefono: '' }, base);
  expect(result.nome).toBe('SEDE TEST');
  expect(result.indirizzo).toBe(SEDE_FALLBACK.indirizzo);
  expect(result.telefono).toBe(SEDE_FALLBACK.telefono);
  expect(result.logoEmailUrl).toBe(LOGO_EMAIL_URL);
  expect(result.logoPdfUrl).toBeNull();
});
test('sede con loghi: URL pubblico del bucket senza doppio prefisso', () => {
  const result = brandingSede({ logo_email_path: 'sedi/id/logo-email.png', logo_pdf_path: 'sedi/id/logo-pdf.png' }, base);
  expect(result.logoEmailUrl).toBe(`${base}/storage/v1/object/public/branding/sedi/id/logo-email.png`);
  expect(result.logoPdfUrl).toBe(`${base}/storage/v1/object/public/branding/sedi/id/logo-pdf.png`);
});
test('contatti passati fedelmente', () => {
  const result = brandingSede({ telefono: '+39 02 123456', email_sede: 'sede@example.test', pec_sede: 'sede@pec.example.test' }, base);
  expect([result.telefono, result.email, result.pec]).toEqual(['+39 02 123456', 'sede@example.test', 'sede@pec.example.test']);
});
test('logo: solo PNG, nessun altro formato', () => {
  expect(erroreFileLogo({ name: 'logo.jpg', type: 'image/jpeg', size: 100 })).toBe('Sono ammessi solo file PNG');
  expect(erroreFileLogo({ name: 'logo.png', type: 'image/jpeg', size: 100 })).toBe('Sono ammessi solo file PNG');
});
test('logo: massimo 1 MB', () => {
  expect(MAX_LOGO_BYTES).toBe(1048576);
  expect(erroreFileLogo({ name: 'logo.png', type: 'image/png', size: 1048576 })).toBeNull();
  expect(erroreFileLogo({ name: 'logo.png', type: 'image/png', size: 1048577 })).toBe('Il logo non può superare 1 MB');
});