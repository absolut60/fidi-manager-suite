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
    A: 'attiva', C: 'cessata', D: 'in procedure', F: 'fallita', G: 'amministrazione giudiziaria',
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
test('profilo: importi di bilancio da migliaia a euro, date GG/MM/AAAA', () => {
  const p = normalizzaProfiloCerved({
    dati_anagrafici: { pec: { email: ['a@pec.it'] } },
    dati_attivita: { data_costituzione: '05-01-2007' },
    dati_economici_dimensionali: { fatturato: 2500, utile_perdita_esercizio: -12, capitale_sociale: 10000 },
  });
  expect(p.fatturato).toBe(2500000);
  expect(p.utile_perdita_esercizio).toBe(-12000);
  expect(p.capitale_sociale).toBe(10000);
  expect(p.data_costituzione).toBe('05/01/2007');
  expect(p.pec).toEqual(['a@pec.it']);
});
test('score: legge scores[]', () => {
  const s = normalizzaScoreCerved({ scores: [{ codice_score: 'SEM_CGS', valore: 70, categoria_descrizione: 'VERDE' }] });
  expect(s[0].codice_score).toBe('SEM_CGS');
  expect(s[0].valore).toBe(70);
});

import { formattaDataCerved } from '../src/lib/cerved/cerved.server';
test('date Cerved GG-MM-AAAA → GG/MM/AAAA, altrimenti invariate', () => {
  expect(formattaDataCerved('14-12-2006')).toBe('14/12/2006');
  expect(formattaDataCerved('2006-12-14')).toBe('2006-12-14');
  expect(formattaDataCerved(null)).toBeNull();
});
test('profilo: url_sito_web in minuscolo, rating e chiusura bilancio', () => {
  const p = normalizzaProfiloCerved({
    dati_anagrafici: { url_sito_web: 'WWW.MADE.IT' },
    dati_attivita: { rating_legalita: { rating: '**+', data_rinnovo: '01-02-2025' }, stato_attivita: 'ATTIVA' },
    dati_economici_dimensionali: { anno_numero_dipendenti_inps: 2024, data_chiusura_ultimo_bilancio: '30-09-2025' },
  });
  expect(p.sito_web).toBe('www.made.it');
  expect(p.rating_legalita).toBe('**+');
  expect(p.rating_legalita_rinnovo).toBe('01/02/2025');
  expect(p.dipendenti_anno).toBe('2024');
  expect(p.data_chiusura_ultimo_bilancio).toBe('30/09/2025');
  expect(p.stato_attivita_descrizione).toBe('ATTIVA');
});
test('score: pd frazione, semaforo V, ordine SEM_CGS, CGS, altri', () => {
  const s = normalizzaScoreCerved({ scores: [
    { codice_score: 'ALTRO', valore: 50 },
    { codice_score: 'CGS', valore: 60, pd: 0.02671 },
    { codice_score: 'SEM_CGS', categoria_codice: 'V', categoria_descrizione: 'VERDE' },
  ] });
  expect(s.map((x) => x.codice_score)).toEqual(['SEM_CGS', 'CGS', 'ALTRO']);
  expect(s[0].categoria_codice).toBe('V');
  expect(s[1].pd! * 100).toBeCloseTo(2.671, 3);
  expect(s[2].pd).toBeNull();
});
