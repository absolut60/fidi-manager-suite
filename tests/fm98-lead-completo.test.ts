import { describe, expect, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { condizioniLeadMancanti } from '@/lib/lead-condizioni-commerciali';
import { creaLead } from '@/lib/lead-crea';
import { condizioniDaLeadPreventivo, type LeadPreventivo } from '@/lib/soggetto-preventivo';
import { risolviSedePreventivo } from '@/lib/preventivo-creazione';

const lead: LeadPreventivo = { id: 'lead-prova', ragione_sociale: 'Impresa prova', nome: null, cognome: null, telefono: null, email: null,
  store_id: 'sede-scelta', agente_codice: '7', listino_rif: 20, macrocategoria_rif: '01', categoria_rif: '02', condizione_pagamento_cod: 'RB60' };

describe('FM98 lead completo: condizioni per origine', () => {
  for (const campo of ['listino_rif', 'macrocategoria_rif', 'categoria_rif', 'condizione_pagamento_cod'] as const) {
    test(`${campo} obbligatorio solo dal preventivo`, () => {
      expect(condizioniLeadMancanti('preventivo', { ...lead, [campo]: null })).toHaveLength(1);
      expect(condizioniLeadMancanti('altro', { ...lead, [campo]: null })).toEqual([]);
    });
  }
  test('tutti vuoti facoltativi dalla lista, quattro mancanti dal preventivo', () => {
    const vuoto = { listino_rif: null, macrocategoria_rif: null, categoria_rif: null, condizione_pagamento_cod: null };
    expect(condizioniLeadMancanti('altro', vuoto)).toEqual([]);
    expect(condizioniLeadMancanti('preventivo', vuoto)).toHaveLength(4);
    expect(condizioniLeadMancanti('preventivo', lead)).toEqual([]);
    expect(condizioniLeadMancanti('preventivo', { ...lead, condizione_pagamento_cod: '  ' })).toEqual(['condizione di pagamento']);
  });
});

test('creazione salva le quattro colonne e restituisce il lead selezionabile, con sede e agente', async () => {
  const scritture: { tabella: string; payload: Record<string, unknown> }[] = [];
  const client = { from: (tabella: string) => ({ insert: (payload: Record<string, unknown>) => {
    scritture.push({ tabella, payload });
    return { select: () => ({ single: async () => ({ data: lead, error: null }) }) };
  } }) } as unknown as SupabaseClient<Database>;
  const risultato = await creaLead({ ...lead, codice_sdi: ' ab c1234 ', createdBy: 'autore' }, client);
  expect(scritture[0]?.payload).toMatchObject({ listino_rif: 20, macrocategoria_rif: '01', categoria_rif: '02', condizione_pagamento_cod: 'RB60', store_id: 'sede-scelta', agente_codice: '7', codice_sdi: 'ABC1234', created_by: 'autore' });
  expect(scritture[1]).toMatchObject({ tabella: 'lead_storico', payload: { lead_id: 'lead-prova', stato_a: 'nuovo' } });
  expect(risultato).toEqual(lead);
});

test('creazione ordinaria senza condizioni non forza le colonne', async () => {
  let scritto: Record<string, unknown> = {};
  const client = { from: () => ({ insert: (payload: Record<string, unknown>) => {
    if ('ragione_sociale' in payload) scritto = payload;
    return { select: () => ({ single: async () => ({ data: lead, error: null }) }) };
  } }) } as unknown as SupabaseClient<Database>;
  await creaLead({ ragione_sociale: 'Impresa' }, client);
  for (const campo of ['listino_rif', 'macrocategoria_rif', 'categoria_rif', 'condizione_pagamento_cod']) expect(scritto).not.toHaveProperty(campo);
});

test('selezione copia condizioni, pagamento e sede dal lead', () => {
  expect(condizioniDaLeadPreventivo(lead, ['preventivi_manage'], '9')).toEqual({ riferimento: { listino_rif: 20, macrocategoria_rif: '01', categoria_rif: '02' }, pagamento: 'RB60', agente: '7' });
  expect(risolviSedePreventivo({ lead, utente: { store_id: 'altra-sede' } })).toBe('sede-scelta');
});
test('agente write-only resta quello del profilo, non quello del lead', () => {
  expect(condizioniDaLeadPreventivo(lead, ['preventivi_write'], '9').agente).toBe('9');
  expect(condizioniDaLeadPreventivo(lead, ['preventivi_write'], null).agente).toBeNull();
  expect(condizioniDaLeadPreventivo(lead, ['preventivi_write', 'responsabile_showroom'], '9').agente).toBe('7');
  expect(condizioniDaLeadPreventivo({ ...lead, agente_codice: null }, ['agente', 'preventivi_manage'], '9').agente).toBe('9');
});