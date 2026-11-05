import { describe, expect, test } from "bun:test";
import {
  isSoloShowroom,
  voceMenuVisibileShowroom,
  puoModificareAttivitaCommerciale,
  puoModificareContattoClienteShowroom,
  erroreSedeObbligatoria,
} from "../src/lib/permessi-showroom";
import { puoVedereAreaFidi, puoProporreDaAlertFidi } from "../src/lib/permessi-fidi";
import { tipiAzioneConsentiti, puoInviareComunicazioniRecupero } from "../src/lib/recupero-permessi";
import { puoAccedereLead, puoGestireLead } from "../src/lib/lead-costanti";

const SHOWROOM = ["showroom"];
const SHOWROOM_PREV = ["showroom", "preventivi_write"];
const STORE_MANAGER = ["store_manager"];
const ADMIN = ["amministratore"];
const voce = (to: string, group = "generale") => ({ to, group });

describe("isSoloShowroom (gemello di auth_solo_showroom)", () => {
  test("solo showroom e showroom+preventivi_write: vero", () => {
    expect(isSoloShowroom(SHOWROOM)).toBe(true);
    expect(isSoloShowroom(SHOWROOM_PREV)).toBe(true);
  });
  test("store manager, amministratore, o showroom insieme a loro: falso", () => {
    expect(isSoloShowroom(STORE_MANAGER)).toBe(false);
    expect(isSoloShowroom(ADMIN)).toBe(false);
    for (const r of ["store_manager", "amministratore", "amministrazione", "direzione", "recupero_crediti"]) {
      expect(isSoloShowroom(["showroom", r])).toBe(false);
    }
  });
});

describe("menu showroom", () => {
  test("voci previste visibili", () => {
    for (const to of ["/dashboard", "/clienti", "/contatti", "/lead", "/calendario-commerciale", "/task", "/chat", "/scadenziario", "/cruscotto-incassi"]) {
      expect(voceMenuVisibileShowroom(voce(to), false)).toBe(true);
    }
  });
  test("voci escluse non visibili", () => {
    for (const to of ["/recupero-crediti", "/recupero-crediti-promesse", "/piani-rientro", "/legali", "/recupero-agenzia", "/recupero-crediti-campagne", "/fidi-processare", "/import-export", "/marketing/campagne", "/impostazioni", "/utenti", "/audit", "/clienti-variazioni-blocco"]) {
      expect(voceMenuVisibileShowroom(voce(to), false)).toBe(false);
    }
  });
  test("preventivi solo con ruolo preventivi_*", () => {
    expect(voceMenuVisibileShowroom(voce("/preventivatore", "preventivi"), false)).toBe(false);
    expect(voceMenuVisibileShowroom(voce("/preventivatore", "preventivi"), true)).toBe(true);
  });
  test("area fidi: vede ma non propone; store manager e admin invariati", () => {
    expect(puoVedereAreaFidi(SHOWROOM)).toBe(true);
    expect(puoProporreDaAlertFidi(SHOWROOM)).toBe(false);
    expect(puoProporreDaAlertFidi(SHOWROOM_PREV)).toBe(false);
    expect(puoVedereAreaFidi(STORE_MANAGER)).toBe(true);
    expect(puoProporreDaAlertFidi(STORE_MANAGER)).toBe(true);
    expect(puoProporreDaAlertFidi(ADMIN)).toBe(true);
  });
});

describe("pulsanti", () => {
  test("recupero: nessun tipo di azione per lo showroom, invariato per gli altri", () => {
    expect(tipiAzioneConsentiti(SHOWROOM)).toEqual([]);
    expect(tipiAzioneConsentiti(SHOWROOM_PREV)).toEqual([]);
    expect(tipiAzioneConsentiti(STORE_MANAGER)).toBeNull();
    expect(tipiAzioneConsentiti(ADMIN)).toBeNull();
    expect(puoInviareComunicazioniRecupero(SHOWROOM)).toBe(false);
    expect(puoInviareComunicazioniRecupero(ADMIN)).toBe(true);
  });
  test("lead: accede ma non gestisce (niente elimina/sposta ambito)", () => {
    expect(puoAccedereLead(SHOWROOM)).toBe(true);
    expect(puoGestireLead(SHOWROOM)).toBe(false);
    expect(puoAccedereLead(STORE_MANAGER)).toBe(false);
    expect(puoGestireLead(ADMIN)).toBe(true);
  });
  test("attività commerciali: showroom solo le proprie senza opportunità", () => {
    expect(puoModificareAttivitaCommerciale(SHOWROOM, "u1", { operatore_id: "u1", opportunita_id: null })).toBe(true);
    expect(puoModificareAttivitaCommerciale(SHOWROOM, "u1", { operatore_id: "u2", opportunita_id: null })).toBe(false);
    expect(puoModificareAttivitaCommerciale(SHOWROOM, "u1", { operatore_id: "u1", opportunita_id: "o1" })).toBe(false);
    expect(puoModificareAttivitaCommerciale(STORE_MANAGER, "u1", { operatore_id: "u2", opportunita_id: "o1" })).toBe(true);
    expect(puoModificareAttivitaCommerciale(ADMIN, "u1", { operatore_id: "u2", opportunita_id: "o1" })).toBe(true);
  });
  test("contatti cliente: showroom modifica solo quelli creati da lui", () => {
    expect(puoModificareContattoClienteShowroom(SHOWROOM, "u1", "u1")).toBe(true);
    expect(puoModificareContattoClienteShowroom(SHOWROOM, "u1", "u2")).toBe(false);
    expect(puoModificareContattoClienteShowroom(STORE_MANAGER, "u1", "u2")).toBe(true);
  });
  test("utenti: sede obbligatoria per showroom e store manager", () => {
    expect(erroreSedeObbligatoria(["showroom"], null)).not.toBeNull();
    expect(erroreSedeObbligatoria(["showroom"], "s1")).toBeNull();
    expect(erroreSedeObbligatoria(["store_manager"], null)).toBe("Il ruolo Store Manager richiede un punto vendita");
    expect(erroreSedeObbligatoria(["amministratore"], null)).toBeNull();
  });
});
