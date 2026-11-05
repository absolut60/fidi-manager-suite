import { createFileRoute } from "@tanstack/react-router";
import { VistaCerved } from "@/components/cliente-cerved-tab";
const anno = (o: any) => ({ debiti_banche: null, debiti_fornitori: null, crediti_clienti: null, liquidita: null, ...o });
export const Route = createFileRoute("/prova-cerved-temp")({
  component: () => (
    <div className="p-3">
      <VistaCerved clienteId="00000000-0000-0000-0000-000000000000" fidoMade={30000} puoAggiornare inCorso={false} onAggiorna={() => {}}
        dati={{
          soggetto: { denominazione_cerved: "ABBRUSCATO SRL", ultimo_aggiornamento: "2026-11-05T15:04:00Z" },
          foto: {
            ricerca: { forma_giuridica: "SRL", ateco_2025_codice: "41.00", ateco_2025_descrizione: "Costruzione di edifici", ente_pa: false, sede: { indirizzo: "Via Roma 1", cap: "90100", comune: "Palermo", provincia: "PA" } },
            profilo: { stato_attivita_codice: "A", stato_attivita_descrizione: "Attiva", dipendenti: 12, dipendenti_anno: "2025", unita_locali: 2, gruppo: false, data_costituzione: "12/03/2004" },
            score: { scores: [
              { codice_score: "SEM_CGS", categoria_codice: "G", pd: 0.0123 },
              { codice_score: "CGS", valore: 56, categoria_descrizione: "Media", pd: 0.0123, trend_descrizione: "Stabile" },
              { codice_score: "PAY", categoria_codice: "PAY_2", categoria_descrizione: "Prevalentemente regolari" },
              { codice_score: "NEG", categoria_codice: "NEG_1", categoria_descrizione: "Assenti" },
              { codice_score: "GOV", categoria_codice: "GOV_1", categoria_descrizione: "Assenza di segnali di rischio" },
              { codice_score: "ECOFIN", categoria_codice: "ECOFIN_4", categoria_descrizione: "Solvibilità" },
              { codice_score: "CNSL", categoria_codice: "CNSL_2", categoria_descrizione: "Richieste nella media" },
              { codice_score: "IMMO", categoria_codice: "IMMO_6", categoria_descrizione: "Non significativa" },
            ] },
            bilancio: { anni: [
              anno({ data_chiusura: "30/09/2025", ricavi: 2419063, acquisti: 519363, mol: 103869, utile: 54886, patrimonio_netto: 400458, debiti_banche: 120000, liquidita: 85000 }),
              anno({ data_chiusura: "30/09/2024", ricavi: 3516421, acquisti: 922761, mol: 165487, utile: 43730, patrimonio_netto: 560111, debiti_banche: 150000, liquidita: 60000 }),
            ] },
            eventi_negativi: { azienda: { protesti: false, pregiudizievoli: false, procedure: false, eventi_crisi: false, cigs: false, fallimenti_propri: false }, persone: [] },
            fido: null,
          },
        }} />
    </div>
  ),
});
