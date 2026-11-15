import { expect, test } from 'bun:test';
import { isRaccoglitorePosa } from '../src/lib/riga-preventivo';

test('FM75 F2a raccoglitore posa: codici PEF', () => {
  for (const c of ['PEF', 'pef2', 'PEFCAR', 'PEFSER']) expect(isRaccoglitorePosa(c)).toBe(true);
  for (const c of ['PE', 'MANUALE', 'XPEF', '', null, undefined]) expect(isRaccoglitorePosa(c)).toBe(false);
});
