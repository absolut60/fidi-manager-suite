import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { RUOLI_ESPORTAZIONE_GAMMA, puoEsportareGamma, ordineBloccatoGamma } from '../src/lib/esportazione-gamma';

const sql = readFileSync(new URL('../drizzle/migrations/0266_fm96_esportazioni_gamma.sql', import.meta.url), 'utf8');
const trigger = readFileSync(new URL('../drizzle/migrations/0267_fm96_gamma_campi_servizio_ruoli.sql', import.meta.url), 'utf8');
test('Gamma: i soli due ruoli di Andrea sono autorizzati, anche in combinazione', () => {
  expect(RUOLI_ESPORTAZIONE_GAMMA).toEqual(['amministratore', 'responsabile_showroom']);
  for (const role of ['amministratore', 'responsabile_showroom']) expect(puoEsportareGamma(r => r === role)).toBe(true);
  for (const role of ['store_manager', 'showroom', 'preventivi_manage', 'direzione', 'amministrazione']) expect(puoEsportareGamma(r => r === role)).toBe(false);
  expect(puoEsportareGamma(() => false)).toBe(false);
  expect(puoEsportareGamma(r => ['showroom', 'responsabile_showroom'].includes(r))).toBe(true);
});
test('Gamma: guardia ruoli TS/SQL e MFA del gemello', () => {
  const body = sql.split('CREATE OR REPLACE FUNCTION public.acquisti_gamma_ordini')[0] ?? '';
  const ruoli = [...body.matchAll(/has_role\(auth\.uid\(\), '([^']+)'\)/g)].map(m => m[1]);
  expect(ruoli).toEqual([...RUOLI_ESPORTAZIONE_GAMMA]);
  expect(body).toContain('SELECT public.auth_mfa_ok() AND');
});
test('Gamma: solo un ordine con data esportazione è bloccato', () => {
  expect(ordineBloccatoGamma({ tipo: 'ordine', esportato_gamma_at: '2026-11-22T18:35:00Z' })).toBe(true);
  expect(ordineBloccatoGamma({ tipo: 'ordine', esportato_gamma_at: null })).toBe(false);
  expect(ordineBloccatoGamma({ tipo: 'ordine' })).toBe(false);
  expect(ordineBloccatoGamma({ tipo: 'preventivo', esportato_gamma_at: '2026-11-22T18:35:00Z' })).toBe(false);
  expect(ordineBloccatoGamma(null)).toBe(false);
});
test('Gamma: riapertura singola UUID, storico senza scritture dirette e acquisti solo authenticated', () => {
  expect(sql).toContain('public.riapri_ordine_gamma(_ordine_id uuid, _motivo text DEFAULT NULL)');
  expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.acquisti_gamma_ordini(uuid[]) FROM PUBLIC, anon, service_role');
  expect(sql).toContain('GRANT SELECT ON public.esportazioni_gamma TO authenticated');
  expect(sql).not.toMatch(/GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]*esportazioni_gamma[^;]*TO authenticated/);
});
test('Gamma: bypass di servizio non consente riaperture dirette ai ruoli non autorizzati', () => {
  expect(trigger).toContain('AND NOT COALESCE(public.auth_puo_esportare_gamma(), false)');
  expect(trigger).toContain('IS DISTINCT FROM (OLD.esportato_gamma_at, OLD.esportato_gamma_da, OLD.esportazione_gamma_id)');
  expect(trigger).toContain("AND OLD.tipo = 'ordine'");
});