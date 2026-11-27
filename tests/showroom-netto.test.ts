import { describe, expect, it } from 'bun:test';
import { levaDaNetto, nettoShowroomModificabile } from '../src/lib/leve-prezzo-showroom';
import { prezzoNettoRiga, rigaInUnita, patchConImporto } from '../src/lib/riga-preventivo';

const base = { prezzoUnit: 100, sconti: [45, 5], costoUnit: 33.09 };
function patch(i: Parameters<typeof levaDaNetto>[0]) {
  const p = levaDaNetto(i);
  if (!p) throw new Error('Netto valido rifiutato');
  return p;
}
describe('FM101 netto Showroom', () => {
  it('100, [45,5], netto 50: unico sconto 50, lordo e leva conservati', () => {
    const p = patch({ ...base, nettoUm1: 50, levaAttuale: 'sconto_listino' });
    expect(p).toMatchObject({ prezzo_unit: 100, sconti_gamma: [50], leva_prezzo: 'sconto_listino', fonte_prezzo: 'manuale' });
    expect(prezzoNettoRiga(p)).toBe(50);
    expect(patch({ ...base, nettoUm1: 50 }).leva_prezzo).toBeNull();
  });
  it('netto 110: maggiorazione equivalente -10', () => {
    const p = patch({ ...base, nettoUm1: 110 });
    expect(p.sconti_gamma).toEqual([-10]);
    expect(prezzoNettoRiga(p)).toBeCloseTo(110, 10);
  });
  it('senza sconti: prezzo manuale 50, costo 33,09 e ricarico canonico 51,1031', () => {
    const p = patch({ prezzoUnit: 52.944, sconti: [], costoUnit: 33.09, nettoUm1: 50 });
    expect(p).toEqual({ prezzo_unit: 50, sconti_gamma: [], leva_prezzo: 'prezzo_manuale', ricarico: 51.1031, fonte_prezzo: 'manuale' });
    expect(prezzoNettoRiga(p)).toBe(50);
  });
  it('netto uguale al lordo: cascata vuota', () => {
    const p = patch({ ...base, nettoUm1: 100 });
    expect(p.sconti_gamma).toEqual([]);
    expect(prezzoNettoRiga(p)).toBe(100);
  });
  it('SCATOLA fattore 1,44: 72 diventano 50 UM1 senza doppia conversione', () => {
    const r = { tipo_riga: 'manuale', prezzo_unit: 52.944, sconti_gamma: [], quantita: 10.08,
      costo: 333.5472, um: 'MQ', um2: 'SCATOLA', fattore_conversione: 1.44, um_scelta: 'um2' };
    const nettoUm1 = rigaInUnita(r, null, { prezzo_unit: 72 }).patchUm1.prezzo_unit;
    if (nettoUm1 == null) throw new Error('Conversione assente');
    const p = patch({ ...base, prezzoUnit: r.prezzo_unit, sconti: [], nettoUm1 });
    const out = { ...r, ...patchConImporto(r, p) };
    expect(p.prezzo_unit).toBe(50);
    expect(prezzoNettoRiga(out)).toBe(50);
    expect(rigaInUnita(out).netto).toBe(72);
    expect(out.importo).toBe(504);
    expect(out.costo).toBe(333.5472);
  });
  it('netto negativo, non finito, fattore nullo o negativo: null', () => {
    for (const nettoUm1 of [-1, NaN, Infinity]) expect(levaDaNetto({ ...base, nettoUm1 })).toBeNull();
    for (const maggiorazionePerc of [-100, -110]) expect(levaDaNetto({ ...base, nettoUm1: 50, maggiorazionePerc })).toBeNull();
    for (const scontoPerc of [100, 110]) expect(levaDaNetto({ ...base, nettoUm1: 50, scontoPerc })).toBeNull();
  });
  it('solo Showroom valorizzato e scrivibile: altre linee, note, intestazioni e blocchi esclusi', () => {
    expect(nettoShowroomModificabile('showroom', true, false)).toBe(true);
    for (const linea of ['edilizia', 'sistema_made', 'fotovoltaico', null]) expect(nettoShowroomModificabile(linea, true, false)).toBe(false);
    expect(nettoShowroomModificabile('showroom', false, false)).toBe(false);
    expect(nettoShowroomModificabile('showroom', true, true)).toBe(false);
  });
  it('extra e maggiorazione invariati: netto e ricarico verificati sul risultato canonico', () => {
    const condizioni = { maggiorazione_perc: 25, sconto_perc: 20 };
    for (const sconti of [[45,5], [], [0,0]]) {
      const p = patch({ ...base, sconti, nettoUm1: 50, maggiorazionePerc: 25, scontoPerc: 20 });
      expect(prezzoNettoRiga({ ...p, ...condizioni })).toBe(50);
      expect(p.ricarico).toBe(51.1031);
    }
    const p = patch({ ...base, sconti: [], nettoUm1: 45, scontoPerc: 10 });
    expect(p.prezzo_unit).toBe(50);
    expect(prezzoNettoRiga({ ...p, sconto_perc: 10 })).toBe(45);
    expect(p.ricarico).toBe(35.9927);
  });
  it('lordo nullo/zero con sconti, e netto zero sono validi', () => {
    for (const prezzoUnit of [null, 0]) expect(patch({ ...base, prezzoUnit, nettoUm1: 50 })).toMatchObject({ prezzo_unit: 50, sconti_gamma: [], leva_prezzo: 'prezzo_manuale' });
    expect(prezzoNettoRiga(patch({ ...base, nettoUm1: 0 }))).toBe(0);
  });
});