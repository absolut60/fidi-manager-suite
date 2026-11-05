import { createFileRoute } from "@tanstack/react-router";
import { VistaCerved } from "@/components/cliente-cerved-tab";
export const Route = createFileRoute("/prova-cerved-c6")({ component: P });
const sc = (codice_score: string, categoria_codice: string, categoria_descrizione: string, valore: number | null = null, pd: number | null = null) =>
  ({ codice_score, descrizione_score: null, valore, categoria_codice, categoria_descrizione, pd, trend_codice: null, trend_descrizione: "Stabile" });
function P() {
  const dati = {
    soggetto: { id_soggetto: 7883047, denominazione_cerved: "ABBRUSCATO S.R.L.", partita_iva: "01234567890", ultimo_aggiornamento: "2026-11-05T15:04:00Z", aggiornato_da: null },
    foto: {
      ricerca: { denominazione: "ABBRUSCATO S.R.L.", partita_iva: "01234567890", codice_fiscale: "01234567890", rea: "PA-123456", forma_giuridica: "Società a responsabilità limitata", ateco_2025_codice: "46.73.2", ateco_2025_descrizione: "Commercio all'ingrosso di materiali da costruzione", sede: { indirizzo: "Via Roma 1", cap: "90100", comune: "Palermo", provincia: "PA" }, ente_pa: false, stato_attivita_codice: "A" },
      profilo: { stato_attivita_codice: "A", stato_attivita_descrizione: "Attiva", sito_web: "www.abbruscato.it", pec: ["abbruscato@pec.it"], telefono: "091 1234567", dipendenti: 8, dipendenti_anno: "2026", unita_locali: 2, gruppo: false, data_costituzione: "12/03/1998" },
      score: { scores: [sc("SEM_CGS", "V", "Verde"), sc("CGS", "CGS_3", "Media", 56, 0.02671), sc("PAY", "PAY_1", "Regolari"), sc("NEG", "NEG_1", "Assenti"), sc("GOV", "GOV_1", "Assenza di segnali di rischio"), sc("ECOFIN", "ECOFIN_3", "Ampia solvibilità"), sc("CNSL", "CNSL_1", "Poche richieste")] },
      bilancio: { anni: [
        { data_chiusura: "31/12/2025", ricavi: 2419063, acquisti: 519363, mol: 103869, utile: 54886, patrimonio_netto: 400458, debiti_banche: 120000, debiti_fornitori: 310000, crediti_clienti: 650000, liquidita: 90000 },
        { data_chiusura: "31/12/2024", ricavi: 3516421, acquisti: 922761, mol: 165487, utile: 43730, patrimonio_netto: 560111, debiti_banche: 150000, debiti_fornitori: 400000, crediti_clienti: 700000, liquidita: 70000 }] },
      eventi_negativi: { azienda: { protesti: false, pregiudizievoli: false, procedure: false, eventi_crisi: false, cigs: false, fallimenti_propri: false }, persone: [] },
      fido: null,
    },
  };
  return <div className="p-3"><VistaCerved dati={dati as any} clienteId="00000000-0000-0000-0000-000000000000" fidoMade={50000} puoAggiornare inCorso={false} onAggiorna={() => {}} /></div>;
}
