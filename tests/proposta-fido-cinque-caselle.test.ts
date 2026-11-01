import { describe, expect, it } from "bun:test";
import { CATEGORIE_PROPOSTA_DEFAULT, categoriaProposta, inclusoInizialeProposta, motivoNascostoProposta, riepilogoVisibilita, righeVisibiliProposta } from "@/lib/proposta-fido-visibilita";
import { anomaliaRossa } from "@/lib/fido-segnalazioni";
import { normalizza } from "@/lib/fido-teorico";
import { semaforoDaCliente } from "@/lib/semaforo-ui";

const riga = (id: string, tipo = "rinnovo", alertAperto = false) => ({
  cliente_id: id, tipo, alertAperto, regola: "calcolo", proponibile: true, fido_proposto: 60000,
});
const filtri = { tipi: CATEGORIE_PROPOSTA_DEFAULT };

describe("Proposta massiva: cinque categorie (01/11)", () => {
  it("default: aumenti, riduzioni, nuovi e invariati da guardare accesi; altri invariati spenti", () => {
    expect(CATEGORIE_PROPOSTA_DEFAULT).toEqual(["aumento", "diminuzione", "nuovo_fido", "rinnovo_da_guardare"]);
    const righe = [riga("a", "aumento"), riga("d", "diminuzione"), riga("n", "nuovo_fido"), riga("g", "rinnovo", true), riga("altro")];
    expect(righeVisibiliProposta(righe, filtri, new Set()).map(r => r.cliente_id)).toEqual(["a", "d", "n", "g"]);
  });
  it("i due gruppi di invariati si accendono e spengono indipendentemente", () => {
    const g = riga("g", "rinnovo", true), altro = riga("altro");
    expect(righeVisibiliProposta([g, altro], { tipi: ["rinnovo"] }, new Set())).toEqual([altro]);
    expect(motivoNascostoProposta(g, { tipi: ["rinnovo"] })).toBe("tipo_spento");
    expect(righeVisibiliProposta([g, altro], { tipi: ["rinnovo_da_guardare"] }, new Set())).toEqual([g]);
    expect(motivoNascostoProposta(altro, filtri)).toBe("rinnovo");
  });
  it("la categoria derivata non cambia il tipo rinnovo né l'importo inviato", () => {
    const g = riga("g", "rinnovo", true);
    expect(categoriaProposta(g)).toBe("rinnovo_da_guardare");
    const [visibile] = righeVisibiliProposta([g], filtri, new Set());
    expect(visibile?.tipo).toBe("rinnovo");
    expect(visibile?.fido_proposto).toBe(60000);
  });
  it("conteggi della casella indipendenti dalla visibilità; richieste in corso escluse", () => {
    const righe = [{ ...riga("g", "rinnovo", true), segnalazioni: ["bloccato", "oltre_tetto"], alertAperto: true }, riga("altro"), { ...riga("corso", "rinnovo", true), richiestaInCorso: {} }];
    for (const f of [filtri, { tipi: [] }]) {
      const conto = riepilogoVisibilita(righe, f, new Set());
      expect(conto.daDecidere).toBe(1);
      expect(conto.altriRinnovi).toBe(1);
      expect(conto.daDeciderePerMotivo).toEqual({ "Cliente bloccato": 1, alert_aperto: 1 });
      expect(conto.nascosti.rinnovo).toBe(1);
      expect(conto.nascosti.in_corso).toBe(1);
    }
  });
  it("segnalazioni rosse senza azzeramento bloccato/legale partono senza spunta", () => {
    for (const codice of ["bloccato", "scaduto_non_incassato", "oltre_normale"]) expect(inclusoInizialeProposta({
      proponibile: true, rossa: anomaliaRossa([codice]), regola: "calcolo", fidoAttuale: 60000, fidoProposto: 60000,
    })).toBe(false);
  });
  it("arancioni e righe senza segnalazioni partono spuntate se proponibili", () => {
    for (const segn of [["oltre_tetto"], ["ordini_oltre_fido"], ["scaduto_da_incassare"], []]) expect(inclusoInizialeProposta({
      proponibile: true, rossa: anomaliaRossa(segn), regola: "calcolo", fidoAttuale: 60000, fidoProposto: 60000,
    })).toBe(true);
    expect(inclusoInizialeProposta({ proponibile: false, rossa: false, regola: "calcolo", fidoAttuale: 60000, fidoProposto: 60000 })).toBe(false);
  });
  it("mostraSempre e righe toccate restano visibili ma non scavalcano richieste in corso", () => {
    const righe = [riga("a"), { ...riga("b"), richiestaInCorso: {} }];
    const scelti = new Set(["a", "b"]);
    expect(righeVisibiliProposta(righe, filtri, scelti, scelti).map(r => r.cliente_id)).toEqual(["a"]);
  });
  it("il semaforo conserva il valore canonico anche con debito e segnalazioni discordanti", () => {
    const t = normalizza({ cliente_id: "a", semaforo_stadio: "verde", semaforo_motivo: "Dato canonico", segnalazioni: ["bloccato"], esposizione_corrente: 999999 });
    expect(semaforoDaCliente({ fido_teorico_cliente: t })).toEqual({ stadio: "verde", motivo: "Dato canonico" });
    expect(semaforoDaCliente({ fido_teorico_cliente: normalizza({ cliente_id: "b" }) }).stadio).toBeNull();
  });
});