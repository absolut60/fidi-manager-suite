import { createFileRoute } from "@tanstack/react-router";
import { VistaCerved } from "@/components/cliente-cerved-tab";
const d = (nome: string, piva: string, cf: string | null, sito: string | null, forma: string, ateco: [string,string]) => ({
  soggetto: { cliente_id: "x", id_soggetto: 7883047, partita_iva: piva, denominazione_cerved: nome, collegato_il: "2026-11-05T17:30:00Z", ultimo_aggiornamento: "2026-11-05T17:30:00Z", aggiornato_da: null },
  foto: {
    ricerca: { denominazione: nome, partita_iva: piva, codice_fiscale: cf, rea: "PA - 123456", forma_giuridica: forma, ateco_2025_codice: ateco[0], ateco_2025_descrizione: ateco[1], stato_attivita_codice: "A", stato_attivita_descrizione: "Attiva", sede: { indirizzo: "Via Roma 12", cap: "90100", comune: "Palermo", provincia: "PA" } },
    profilo: { sito_web: sito, pec: ["amministrazione@pec.example.it"], telefono: "091 1234567" },
    score: null,
  },
}) as any;
export const Route = createFileRoute("/tmp-testata")({ component: () => (
  <div className="space-y-6 p-2 sm:p-4">
    <VistaCerved dati={d("ABBRUSCATO COSTRUZIONI S.R.L.", "05123450829", null, "www.abbruscato.it", "Società a responsabilità limitata", ["41.00.00", "Costruzione di edifici residenziali e non residenziali"])} clienteId="00000000-0000-0000-0000-000000000000" fidoMade={50000} puoAggiornare inCorso={false} onAggiorna={() => {}} />
    <VistaCerved dati={d("PEANO GIUSEPPE", "03456780046", "PNEGPP70A01L219X", null, "Impresa individuale", ["43.32.02", "Posa in opera di infissi, arredi, controsoffitti, pareti mobili e simili"])} clienteId="00000000-0000-0000-0000-000000000000" fidoMade={10000} puoAggiornare inCorso={false} onAggiorna={() => {}} />
  </div>) });
