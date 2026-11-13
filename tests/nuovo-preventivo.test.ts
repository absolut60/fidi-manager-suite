import { describe, expect, it } from 'bun:test';
import { creaConPrimoBlocco } from '../src/lib/nuovo-preventivo';

describe('creazione dalla finestra Nuovo', () => {
  for (const tipo of ['preventivo', 'ordine']) {
    it(`${tipo}: crea il primo blocco vuoto dopo il documento`, async () => {
      const chiamate: unknown[] = [];
      const risultato = await creaConPrimoBlocco(async () => {
        chiamate.push(tipo);
        return { preventivo: { id: tipo } };
      }, async (id, ordine) => { chiamate.push([id, ordine]); });
      expect(chiamate).toEqual([tipo, [tipo, 1]]);
      expect(risultato.erroreBlocco).toBe(false);
    });
  }
  it('il fallimento del blocco conserva il documento e segnala un avviso', async () => {
    const risultato = await creaConPrimoBlocco(async () => ({ preventivo: { id: 'creato' } }), async () => { throw new Error('errore blocco'); });
    expect(risultato.preventivo.id).toBe('creato');
    expect(risultato.erroreBlocco).toBe(true);
  });
  it('non crea blocchi se la creazione del documento fallisce', async () => {
    let blocchi = 0;
    await expect(creaConPrimoBlocco(async () => { throw new Error('errore documento'); }, async () => { blocchi++; })).rejects.toThrow('errore documento');
    expect(blocchi).toBe(0);
  });
});