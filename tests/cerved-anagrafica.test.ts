import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { anagraficaCampiLead, attivitaCervedNonAttiva, compilaVuotiAnagrafica, differenzeAnagrafica, inizioAnnoRicercheCerved,
  type AnagraficaCerved, type CampiAnagraficiLead } from "../src/lib/cerved/cerved-anagrafica";
import { pivaCifre, QUOTA_RICERCHE_CERVED_ANNUA } from "../src/lib/cerved/cerved-entita";
import { puoAccedereLead } from "../src/lib/lead-costanti";

const a: AnagraficaCerved = { denominazione: "IMPRESA TEST SRL", partita_iva: "01234567890", codice_fiscale: "01234567890",
  indirizzo: "Via Roma 12", cap: "20100", comune: "Milano", provincia: "MI", forma_giuridica: "Società a responsabilità limitata",
  ateco_2025_codice: "43.11.00", ateco_2025_descrizione: "Demolizione", stato_attivita_descrizione: "Attiva", operativa: true };
const vuoto: CampiAnagraficiLead = { ragione_sociale: "", partita_iva: "", codice_fiscale: "", indirizzo: "", citta: "", cap: "", provincia: "", tipo_soggetto: "" };
const source = readFileSync(new URL("../src/lib/cerved/cerved-anagrafica.functions.ts", import.meta.url), "utf8");

describe("FM90 compilazione anagrafica gratuita", () => {
  it("mappa tutti gli otto campi del lead e imposta azienda", () => {
    expect(anagraficaCampiLead(a)).toEqual({ ragione_sociale: "IMPRESA TEST SRL", partita_iva: "01234567890", codice_fiscale: "01234567890",
      indirizzo: "Via Roma 12", citta: "Milano", cap: "20100", provincia: "MI", tipo_soggetto: "azienda" });
  });
  it("in creazione compila solo i vuoti senza sovrascrivere nomi e indirizzi esistenti", () => {
    const attuale = { ...vuoto, ragione_sociale: "Nome scritto", indirizzo: "Indirizzo scritto", citta: "   ", tipo_soggetto: "persona_fisica" };
    expect(compilaVuotiAnagrafica(attuale, anagraficaCampiLead(a))).toEqual({ partita_iva: "01234567890", codice_fiscale: "01234567890", citta: "Milano", cap: "20100", provincia: "MI" });
    expect(attuale.ragione_sociale).toBe("Nome scritto");
  });
  it("il confronto elenca solo differenze, comprese quelle su campi pieni", () => {
    const nuovi = anagraficaCampiLead(a);
    expect(differenzeAnagrafica({ ...nuovi, ragione_sociale: "Nome precedente" }, nuovi)).toEqual([
      { campo: "ragione_sociale", attuale: "Nome precedente", cerved: "IMPRESA TEST SRL" },
    ]);
  });
  it("un dato assente in Cerved non cancella il valore del form", () => {
    expect(differenzeAnagrafica(anagraficaCampiLead(a), anagraficaCampiLead({ ...a, indirizzo: null }))).toEqual([]);
  });
  it("P.IVA con IT e spazi mantiene esattamente 11 cifre", () => {
    expect(pivaCifre("IT 012 345 67890")).toBe("01234567890");
  });
  it("la ricerca chiama solo entity_search con clienteId null, senza acquisti o scritture Cerved", () => {
    expect(source).toContain('m.cercaSoggettoPerPiva(piva, { utenteId: context.userId, clienteId: null })');
    expect(source).toContain("m.scegliAziendaPerPiva");
    expect(source).toContain("m.normalizzaAziendaCerved");
    expect(source).not.toMatch(/acquista|recupera|cerved_soggetti|cerved_report|cerved_fotografie|\.insert\(|\.update\(|\.upsert\(/);
  });
  it("permesso identico alla pagina Nuovo lead, verificato su ruoli autentici e MFA", () => {
    for (const ruolo of ["marketing", "agente", "showroom", "preventivi_write", "preventivi_manage", "direzione"]) expect(puoAccedereLead([ruolo])).toBe(true);
    expect(puoAccedereLead(["recupero_crediti"])).toBe(false);
    expect(source).toContain('context.supabase.from("user_roles").select("role").eq("user_id", context.userId)');
    expect(source).toContain("!puoAccedereLead");
    expect(source).toContain('rpc("auth_mfa_ok")');
  });
  it("duplicati con RLS dell'utente e esclusione del lead corrente", () => {
    expect(source).toContain('context.supabase.from("clienti")');
    expect(source).toContain('context.supabase.from("lead")');
    expect(source).toContain("row.id !== data.escludiLeadId");
    expect(source).toContain("pivaCifre(row.partita_iva) === piva");
  });
  it("non attiva se non operativa o stato diverso da attiva", () => {
    expect(attivitaCervedNonAttiva(a)).toBe(false);
    expect(attivitaCervedNonAttiva({ ...a, operativa: false })).toBe(true);
    expect(attivitaCervedNonAttiva({ ...a, stato_attivita_descrizione: "Cessata" })).toBe(true);
  });
  it("quota indicativa unica di 10.000 e conteggio di tutte le entity_search", () => {
    expect(QUOTA_RICERCHE_CERVED_ANNUA).toBe(10000);
    expect(source).toContain('.eq("operazione", "entity_search").gte("created_at", inizioAnnoRicercheCerved())');
    expect(source).toContain('rpc("auth_puo_aggiornare_cerved")');
    expect(source).toContain('select("id", { count: "exact", head: true })');
  });
  it("il contatore segue l'anno civile Europe/Rome anche al cambio anno", () => {
    expect(inizioAnnoRicercheCerved(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01T00:00:00+01:00");
    expect(inizioAnnoRicercheCerved(new Date("2026-12-31T22:30:00Z"))).toBe("2026-01-01T00:00:00+01:00");
  });
});