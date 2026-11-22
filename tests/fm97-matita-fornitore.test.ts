import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { fornitoreRigaCambiabile } from '@/lib/fornitori-riga-ordine';
describe('FM97 matita fornitore di riga', () => {
  it('1 fornitore + preferenziale: niente matita', () => expect(fornitoreRigaCambiabile({ fornitore_id: null }, { fornitore_pref_id: 'a' }, 1)).toBe(false));
  it('riga uguale al preferenziale: niente matita', () => expect(fornitoreRigaCambiabile({ fornitore_id: 'a' }, { fornitore_pref_id: 'a' }, 1)).toBe(false));
  it('2 fornitori: matita', () => expect(fornitoreRigaCambiabile({ fornitore_id: null }, { fornitore_pref_id: 'a' }, 2)).toBe(true));
  it('senza preferenziale e senza fornitore riga: matita', () => expect(fornitoreRigaCambiabile({ fornitore_id: null }, { fornitore_pref_id: null }, 0)).toBe(true));
  it('riga con fornitore diverso: matita', () => expect(fornitoreRigaCambiabile({ fornitore_id: 'b' }, { fornitore_pref_id: 'a' }, 1)).toBe(true));
});
