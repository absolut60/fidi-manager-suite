import { expect,test } from 'bun:test';
import { margineTotaliRighe } from '@/lib/riga-preventivo';
test('PRV-161 fascia e piede ricevono 170,01 / 35,61 / 20,9%',()=>{
  const m=margineTotaliRighe({totale:170.01,costo:134.4});
  expect(m.euro).toBe(35.61);
  expect(Math.round(m.perc*10)/10).toBe(20.9);
});