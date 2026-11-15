import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { LINEE_PREVENTIVO, lineaPredefinitaEffettiva, lineeUtente, riallineaPredefinitaProfilo, selettoreLineaCreazione, etichettaLineaGestione } from '../src/lib/linee-preventivo';

describe('linee utente (FM72 tappa 3b)', () => {
  test('lineeUtente: intersezione abilitate ∩ attive, ordine del catalogo', () => {
    expect(lineeUtente(['edilizia', 'showroom', 'sistema_made']).map(l => l.codice)).toEqual(['sistema_made', 'showroom']);
    expect(lineeUtente(['edilizia'])).toEqual([]);
    expect(lineeUtente(null)).toEqual([]);
  });
  test('lineaPredefinitaEffettiva: predefinita se usabile, altrimenti la prima, altrimenti null', () => {
    expect(lineaPredefinitaEffettiva(['sistema_made'], 'sistema_made')).toBe('sistema_made');
    expect(lineaPredefinitaEffettiva(['sistema_made', 'edilizia'], 'edilizia')).toBe('sistema_made');
    expect(lineaPredefinitaEffettiva(['edilizia'], 'edilizia')).toBeNull();
  });
  test('selettore: nascosto con una linea, bloccato senza linee', () => {
    expect(selettoreLineaCreazione(['sistema_made'], 'sistema_made')).toMatchObject({ mostra: false, iniziale: 'sistema_made', bloccaCreazione: false });
    expect(selettoreLineaCreazione(['edilizia'], 'edilizia')).toMatchObject({ mostra: false, iniziale: null, bloccaCreazione: true });
  });
  test('selettore: visibile con più linee attive e predefinita preselezionata', () => {
    const orig = LINEE_PREVENTIVO.showroom.attiva;
    LINEE_PREVENTIVO.showroom.attiva = true;
    try {
      expect(selettoreLineaCreazione(['sistema_made', 'showroom'], 'showroom')).toMatchObject({ mostra: true, iniziale: 'showroom' });
      expect(selettoreLineaCreazione(['sistema_made', 'showroom'], 'edilizia').iniziale).toBe('sistema_made');
    } finally { LINEE_PREVENTIVO.showroom.attiva = orig; }
  });
  test('gestione utenti: predefinita riallineata alla prima abilitata', () => {
    expect(riallineaPredefinitaProfilo(['showroom', 'edilizia'], 'sistema_made')).toBe('showroom');
    expect(riallineaPredefinitaProfilo(['sistema_made', 'edilizia'], 'edilizia')).toBe('edilizia');
    expect(riallineaPredefinitaProfilo([], 'sistema_made')).toBeNull();
    expect(etichettaLineaGestione(LINEE_PREVENTIVO.edilizia)).toBe('Edilizia — non ancora attiva');
    expect(etichettaLineaGestione(LINEE_PREVENTIVO.sistema_made)).toBe('Sistema MADE');
  });
  test('la creazione da dialog passa sempre la linea scelta', () => {
    const src = readFileSync('src/components/preventivatore/NuovoPreventivoDialog.tsx', 'utf8');
    expect(src).toContain('}, { linea }), addBloccoVuoto)');
    expect(src).toContain('|| !linea}');
  });
});
