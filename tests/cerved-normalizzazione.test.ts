import { test, expect } from 'bun:test';
import { normalizzaAziendaCerved, formattaAtecoCerved } from '../src/lib/cerved/cerved.server';

const azienda = {
  dati_anagrafici: {
    id_soggetto: 'SOGJ123456',
    denominazione: 'EDILZETA SRL',
    partita_iva: '01234567890',
    codice_fiscale: '01234567890',
    indirizzo: {
      descrizione: 'VIA ROMA 15',
      cap: '20020',
      descrizione_comune: 'MAGENTA',
      provincia: 'MI',
      codice_comune_istat: '015128',
    },
  },
  dati_attivita: {
    codice_stato_attivita: 'A',
    flag_operativa: 'S',
    codice_ateco_2025: '410000',
    ateco_2025: 'Costruzione di edifici',
    company_form: { code: 'SR', description: 'Societa a responsabilita limitata', company_form_class: 'SC' },
    codice_rea: 'MI-1234567',
    data_iscrizione_rea: '2005-03-12',
    ateco_infocamere_2025_secondario: [{ codice_ateco: '439900', ateco: 'Altri lavori di costruzione' }],
  },
  dati_pa: { ente: 'N', fornitore: 'S', partecipata: null },
};

test('estrazione dai blocchi dati_anagrafici / dati_attivita / dati_pa', () => {
  const r = normalizzaAziendaCerved(azienda);
  expect(r.id_soggetto).toBe('SOGJ123456');
  expect(r.denominazione).toBe('EDILZETA SRL');
  expect(r.partita_iva).toBe('01234567890');
  expect(r.codice_fiscale).toBe('01234567890');
  expect(r.stato_attivita_codice).toBe('A');
  expect(r.stato_attivita_descrizione).toBe('attiva');
  expect(r.operativa).toBe(true);
  expect(r.forma_giuridica).toBe('Societa a responsabilita limitata');
  expect(r.classe_forma).toBe('SC');
  expect(r.classe_forma_descrizione).toBe('società di capitali');
  expect(r.ateco_2025_codice).toBe('41.00.00');
  expect(r.ateco_2025_descrizione).toBe('Costruzione di edifici');
  expect(r.rea).toBe('MI-1234567');
  expect(r.data_iscrizione_rea).toBe('2005-03-12');
  expect(r.sede).toEqual({ indirizzo: 'VIA ROMA 15', cap: '20020', comune: 'MAGENTA', provincia: 'MI' });
  expect(r.ente_pa).toBe(false);
});

test('ATECO: 6 cifre col punto, già formattato e valore mancante', () => {
  expect(formattaAtecoCerved('410000')).toBe('41.00.00');
  expect(formattaAtecoCerved('011000')).toBe('01.10.00');
  expect(formattaAtecoCerved('41.00.00')).toBe('41.00.00');
  expect(formattaAtecoCerved('41000')).toBe('41000');
  expect(formattaAtecoCerved(null)).toBeNull();
});

test('tutti gli stati attività documentati hanno la descrizione', () => {
  const attese: Record<string, string> = {
    A: 'attiva', C: 'cessata', D: 'in procedures', F: 'fallita', G: 'amministrazione giudiziaria',
    I: 'inattiva', L: 'in scioglimento/liquidazione', N: 'in procedura concorsuale',
    P: 'iscrizione', R: 'registrata', S: 'sospesa', T: 'cancellata',
  };
  for (const [codice, descrizione] of Object.entries(attese)) {
    expect(normalizzaAziendaCerved({ dati_attivita: { codice_stato_attivita: codice } }).stato_attivita_descrizione)
      .toBe(descrizione);
  }
  expect(normalizzaAziendaCerved({ dati_attivita: { codice_stato_attivita: 'Z' } }).stato_attivita_descrizione).toBeNull();
});

test('classi forma: conosciute tradotte, sconosciute scartate', () => {
  const con = (classe: string) =>
    normalizzaAziendaCerved({ dati_attivita: { company_form: { company_form_class: classe, description: 'X' } } });
  expect(con('SP').classe_forma_descrizione).toBe('società di persone');
  expect(con('di').classe_forma_descrizione).toBe('ditta individuale');
  expect(con('AL').classe_forma_descrizione).toBe('altre forme');
  expect(con('XX').classe_forma).toBeNull();
  expect(con('XX').classe_forma_descrizione).toBeNull();
});

test('pubblica amministrazione vera solo con ente presente', () => {
  expect(normalizzaAziendaCerved({ dati_pa: { ente: 'S' } }).ente_pa).toBe(true);
  expect(normalizzaAziendaCerved({ dati_pa: { ente: 'N' } }).ente_pa).toBe(false);
  expect(normalizzaAziendaCerved({}).ente_pa).toBe(false);
});

test('elemento vuoto o mancante non esplode', () => {
  for (const vuota of [null, undefined, {}, { dati_anagrafici: null }]) {
    const r = normalizzaAziendaCerved(vuota);
    expect(r.id_soggetto).toBeNull();
    expect(r.denominazione).toBeNull();
    expect(r.operativa).toBeNull();
    expect(r.sede).toBeNull();
    expect(r.ente_pa).toBe(false);
  }
});

import { normalizzaProfiloCerved, normalizzaScoreCerved } from '../src/lib/cerved/cerved.server';
test('profilo: importi di bilancio da migliaia a euro, date grezze', () => {
  const p = normalizzaProfiloCerved({
    dati_anagrafici: { pec: { email: ['a@pec.it'] } },
    dati_attivita: { data_costituzione: '05-01-2007' },
    dati_economici_dimensionali: { fatturato: 2500, utile_perdita_esercizio: -12, capitale_sociale: 10000 },
  });
  expect(p.fatturato).toBe(2500000);
  expect(p.utile_perdita_esercizio).toBe(-12000);
  expect(p.capitale_sociale).toBe(10000);
  expect(p.data_costituzione).toBe('05-01-2007');
  expect(p.pec).toEqual(['a@pec.it']);
});
test('score: legge scores[]', () => {
  const s = normalizzaScoreCerved({ scores: [{ codice_score: 'SEM_CGS', valore: 70, categoria_descrizione: 'VERDE' }] });
  expect(s[0].codice_score).toBe('SEM_CGS');
  expect(s[0].valore).toBe(70);
});
