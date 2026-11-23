import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LEAD_CONVERSIONE_LABEL, LEAD_RICONCILIAZIONE_ESITO_CLASS, LEAD_RICONCILIAZIONE_ESITO_LABEL, conversioneSuClienteEsistente,
} from "../src/lib/lead-costanti";
import {
  corrispondenzaRiconciliazione, esitoControlloOra, origineRiconciliazione, validaVistaRiconciliazione, type RigaRiconciliazione,
} from "../src/lib/lead-riconciliazione";
import { ElencoRiconciliati, PulsanteControllaOra, SchedaDaRiconciliare } from "../src/components/lead/riconciliazione-viste";

test("conversione su cliente esistente: solo contatto_cliente e import_gamma", () => {
  expect(conversioneSuClienteEsistente("contatto_cliente")).toBe(true);
  expect(conversioneSuClienteEsistente("import_gamma")).toBe(true);
  expect(conversioneSuClienteEsistente("nuovo_cliente")).toBe(false);
  expect(conversioneSuClienteEsistente(null)).toBe(false);
});

test("etichette di conversione ed esiti", () => {
  expect(LEAD_CONVERSIONE_LABEL.import_gamma).toBe("Collegato al cliente arrivato da Gamma");
  expect(LEAD_RICONCILIAZIONE_ESITO_LABEL).toEqual({
    collegato_auto: "Collegato in automatico", collegato_manuale: "Collegato a mano",
    da_riconciliare: "Da riconciliare", annullato: "Annullato",
  });
  expect(LEAD_RICONCILIAZIONE_ESITO_CLASS.collegato_auto).toContain("emerald");
  expect(LEAD_RICONCILIAZIONE_ESITO_CLASS.collegato_manuale).toContain("blue");
  expect(LEAD_RICONCILIAZIONE_ESITO_CLASS.da_riconciliare).toContain("amber");
});

test("vista: default da-riconciliare, i link delle notifiche aprono la scheda giusta", () => {
  expect(validaVistaRiconciliazione(undefined)).toBe("da-riconciliare");
  expect(validaVistaRiconciliazione("da-riconciliare")).toBe("da-riconciliare");
  expect(validaVistaRiconciliazione("riconciliati")).toBe("riconciliati");
  expect(validaVistaRiconciliazione("altro")).toBe("da-riconciliare");
});

test("origine, corrispondenza ed esito di Controlla ora in parole", () => {
  expect(origineRiconciliazione({ importazione_id: "i", creato_il: "2026-11-23T10:00:00Z" })).toBe("Import clienti del 23/11/2026");
  expect(origineRiconciliazione({ importazione_id: null, creato_il: "2026-11-23T10:00:00Z" })).toBe("Controlla ora");
  expect(corrispondenzaRiconciliazione({ chiave: "partita_iva", lead_partita_iva: "01234567890", lead_codice_fiscale: null })).toBe("P.IVA 01234567890");
  expect(corrispondenzaRiconciliazione({ chiave: "codice_fiscale", lead_partita_iva: null, lead_codice_fiscale: "RSSMRA80A01F205X" })).toBe("C.F. RSSMRA80A01F205X");
  const e = esitoControlloOra({ collegati: 2, da_riconciliare: 0, errori: [{ lead_id: "x", errore: "boom" }] });
  expect(e.testo).toBe("2 lead collegati, 0 da riconciliare");
  expect(e.errori).toEqual(["Lead x: boom"]);
  expect(esitoControlloOra({ collegati: 1, da_riconciliare: 3 }).testo).toBe("1 lead collegato, 3 da riconciliare");
});

const base: RigaRiconciliazione = {
  id: "r1", lead_id: "l1", esito: "da_riconciliare", cliente_id: null, chiave: "partita_iva",
  candidati: [
    { id: "c1", ragione_sociale: "ALFA SRL", codice_gestionale: "100", partita_iva: "01234567890", codice_fiscale: null },
    { id: "c2", ragione_sociale: "ALFA BIS SRL", codice_gestionale: "200", partita_iva: "01234567890", codice_fiscale: null },
  ],
  nome_lead: "LEAD PROVA", lead_partita_iva: "01234567890", lead_codice_fiscale: null,
  cliente_ragione_sociale: null, cliente_codice: null, importazione_id: "i1", operatore_id: null,
  creato_il: "2026-11-23T10:00:00Z", risolto_da: null, risolto_il: null, nota: null,
};
const link = (_id: string, t: unknown) => <a>{t as string}</a>;

test("Da riconciliare: candidati sempre visibili, Collega solo a chi gestisce i lead", () => {
  const conGestione = renderToStaticMarkup(<SchedaDaRiconciliare riga={base} puoCollegare linkLead={link} linkCliente={link} onCollega={() => {}} />);
  expect(conGestione).toContain("ALFA SRL");
  expect(conGestione).toContain("ALFA BIS SRL");
  expect(conGestione).toContain("Import clienti del 23/11/2026");
  expect(conGestione.match(/Collega</g)?.length).toBe(2);
  const senza = renderToStaticMarkup(<SchedaDaRiconciliare riga={base} puoCollegare={false} linkLead={link} linkCliente={link} onCollega={() => {}} />);
  expect(senza).toContain("ALFA SRL");
  expect(senza).not.toContain("Collega<");
});

test("Riconciliati: Annulla solo all'amministratore e solo sui collegamenti in essere", () => {
  const righe: RigaRiconciliazione[] = [
    { ...base, id: "a", esito: "collegato_auto", cliente_id: "c1", cliente_ragione_sociale: "ALFA SRL", cliente_codice: "100" },
    { ...base, id: "b", esito: "annullato", cliente_id: "c2", cliente_ragione_sociale: "ALFA BIS SRL", cliente_codice: "200" },
  ];
  const props = { righe, nomeOperatore: () => "Sistema", linkLead: link, linkCliente: link, onAnnulla: () => {} };
  const admin = renderToStaticMarkup(<ElencoRiconciliati {...props} isAdmin />);
  expect(admin).toContain("Collegato in automatico");
  expect(admin).toContain("P.IVA 01234567890");
  // una scheda (telefono) + una riga di tabella (PC) per l'unico collegamento annullabile
  expect(admin.match(/title="Annulla collegamento"/g)?.length).toBe(2);
  const altri = renderToStaticMarkup(<ElencoRiconciliati {...props} isAdmin={false} />);
  expect(altri).not.toContain("Annulla collegamento");
});

test("Controlla ora solo all'amministratore", () => {
  expect(renderToStaticMarkup(<PulsanteControllaOra isAdmin inCorso={false} onClick={() => {}} />)).toContain("Controlla ora");
  expect(renderToStaticMarkup(<PulsanteControllaOra isAdmin={false} inCorso={false} onClick={() => {}} />)).toBe("");
});
