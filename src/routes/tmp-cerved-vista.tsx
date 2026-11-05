import { createFileRoute } from "@tanstack/react-router";
import { VistaCerved } from "@/components/cliente-cerved-tab";
export const Route = createFileRoute("/tmp-cerved-vista")({ component: P });
function P() {
  return <div className="p-3"><VistaCerved fidoMade={25000} puoAggiornare inCorso={false} onAggiorna={() => {}} dati={{
    soggetto: { denominazione_cerved: "EDIL COSTRUZIONI ROSSI S.R.L.", ultimo_aggiornamento: "2026-11-05T15:04:00Z" },
    foto: {
      ricerca: { forma_giuridica: "Società a responsabilità limitata", classe_forma_descrizione: "Società di capitale", ateco_2025_codice: "41.00.00", ateco_2025_descrizione: "Costruzione di edifici", rea: "MI-1234567", data_iscrizione_rea: "12/03/2008", sede: { indirizzo: "Via Roma 12", cap: "20100", comune: "Milano", provincia: "MI" }, ente_pa: false, stato_attivita_codice: "A", stato_attivita_descrizione: "Attiva" },
      profilo: { pec: ["edilrossi@pec.it"], telefono: "02 1234567", sito_web: "www.edilrossi.it", anno_ultimo_bilancio: "2025", data_chiusura_ultimo_bilancio: "31/12/2025", fatturato: 2450000, mol: 180000, utile_perdita_esercizio: -32000, patrimonio_netto: 410000, attivo: 1900000, capitale_sociale: 50000, dipendenti: 18, dipendenti_anno: "2025", gruppo: false, capogruppo: [], unita_locali: 2, data_costituzione: "01/02/2008", rating_legalita: null },
      score: { scores: [
        { codice_score: "SEM_CGS", categoria_codice: "G", categoria_descrizione: "Giallo", valore: null, pd: null },
        { codice_score: "CGS", valore: 56, categoria_descrizione: "Media", pd: 0.0123, trend_descrizione: "Stabile" },
        { codice_score: "PAY", valore: 62, categoria_descrizione: "Regolare" },
        { codice_score: "NEG", valore: 80, categoria_descrizione: "Nessun evento" },
        { codice_score: "ECOFIN", valore: 48, categoria_descrizione: "Media" },
        { codice_score: "CNSL", valore: 35, categoria_descrizione: "Alta attenzione" },
      ] },
    },
  }} /></div>;
}
