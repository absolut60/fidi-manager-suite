// Job Inngest: avviso di fine import a chi l'ha lanciato (notifica in app + email).
// Si attiva con l'evento `import/esito.notifica` { importazioneId }, emesso da
// chiudiImportazione (functions.server.ts), l'unico punto che chiude un import.
// Lavora solo su quell'importazione; idempotente su esito_notificato_at.
// Il testo è composto solo in src/lib/esito-import-messaggio.ts.
// La push parte dal trigger esistente su `notifiche`.
import { inngest } from "./client";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmailViaEdge } from "./send-email.server";
import {
  emailEsitoImport,
  dettaglioScartateImport,
  haCollegamentiOsservazione,
  livelloEsitoImport,
  messaggioEsitoImport,
  titoloEsitoImport,
  type DatiEsitoImport,
  type RigaAnomaliaImport,
} from "@/lib/esito-import-messaggio";

type RigaImportazione = {
  id: string;
  nome_file: string | null;
  fonte: string | null;
  stato: string | null;
  righe_totali: number | null;
  righe_create: number | null;
  righe_aggiornate: number | null;
  righe_errore: number | null;
  righe_saltate: number | null;
  problemi: string[] | null;
  codici_mancanti: string[] | null;
  report_saltati: unknown;
  eseguita_da: string | null;
  created_at: string | null;
  completata_at: string | null;
};

const COLONNE =
  "id, nome_file, fonte, stato, righe_totali, righe_create, righe_aggiornate, righe_errore, righe_saltate, problemi, codici_mancanti, report_saltati, eseguita_da, created_at, completata_at";

export const notificaEsitoImport = inngest.createFunction(
  {
    id: "importazioni-esito-notifica",
    name: "Importazioni: avviso di esito a chi ha lanciato l'import",
    retries: 3,
    concurrency: { limit: 1, key: "event.data.importazioneId" },
    triggers: [{ event: "import/esito.notifica" }],
  },
  async ({ event, step, logger }) => {
    const importazioneId = (event.data as { importazioneId?: string } | undefined)?.importazioneId;
    if (!importazioneId) return { notificato: false, motivo: "senza_id" };
    const ids = [importazioneId];

    let notificate = 0;
    for (const id of ids) {
      const esito = await step.run(`esito-${id}`, async () => {
        // a. Idempotenza: solo chi marca la riga prosegue.
        const { data: marcate, error: mErr } = await supabaseAdmin
          .from("importazioni")
          .update({ esito_notificato_at: new Date().toISOString() } as never)
          .eq("id", id)
          .is("esito_notificato_at", null)
          .select(COLONNE);
        if (mErr) throw new Error(`marca importazione ${id}: ${mErr.message}`);
        const riga = (marcate?.[0] ?? null) as RigaImportazione | null;
        if (!riga) return "gia_notificato";

        // e. Nessun destinatario.
        if (!riga.eseguita_da) return "senza_utente";

        // b. Tipi distinti con paginazione: nessun limite implicito di 1000 anomalie.
        const tipi = new Set<string>();
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabaseAdmin.from("anomalie_import")
            .select("tipo_anomalia").eq("importazione_id", id)
            .not("tipo_anomalia", "in", "(scadenza_non_nel_file,scadenza_ricollegabile,scadenza_collegamenti_persi)")
            .order("id").range(offset, offset + 999);
          if (error) { logger.error(`tipi anomalie ${id}: ${error.message}`); break; }
          for (const r of data ?? []) tipi.add(r.tipo_anomalia);
          if ((data?.length ?? 0) < 1000) break;
        }
        const colonneAnomalia = "codice_gestionale, ragione_sociale, valore_attuale, valore_nuovo";
        // Osservazione FM54: count exact sul tipo; le righe con almeno un
        // collegamento (letto dalla coda dei conteggi) vengono mostrate per prime.
        const leggiOsservazione = async (tipo: string) => {
          const righe: RigaAnomaliaImport[] = [];
          let totale = 0;
          for (let offset = 0; ; offset += 1000) {
            const { data, count, error } = await supabaseAdmin.from("anomalie_import")
              .select(colonneAnomalia, { count: "exact" }).eq("importazione_id", id).eq("tipo_anomalia", tipo)
              .order("id").range(offset, offset + 999);
            if (error) { logger.error(`${tipo} ${id}: ${error.message}`); break; }
            totale = count ?? totale;
            righe.push(...(data ?? []));
            if ((data?.length ?? 0) < 1000) break;
          }
          const conColl = righe.filter((r) => haCollegamentiOsservazione(r.valore_nuovo));
          const senza = righe.filter((r) => !haCollegamentiOsservazione(r.valore_nuovo));
          return { totale, conCollegamenti: conColl.length, righe: [...conColl, ...senza].slice(0, 30) };
        };
        const [ricollegabili, persi] = await Promise.all([
          leggiOsservazione("scadenza_ricollegabile"),
          leggiOsservazione("scadenza_collegamenti_persi"),
        ]);
        const [tolte, ...gruppi] = await Promise.all([
          supabaseAdmin
          .from("anomalie_import")
          .select(colonneAnomalia, { count: "exact" })
          .eq("importazione_id", id)
          .eq("tipo_anomalia", "scadenza_non_nel_file").order("id").limit(30),
          ...[...tipi].sort().map(async (tipo) => {
            const risultato = await supabaseAdmin.from("anomalie_import")
              .select(colonneAnomalia, { count: "exact" }).eq("importazione_id", id)
              .eq("tipo_anomalia", tipo).order("id").limit(30);
            if (risultato.error) logger.error(`anomalie ${tipo} ${id}: ${risultato.error.message}`);
            return { tipo, totale: risultato.count ?? 0, righe: risultato.data ?? [] };
          }),
        ]);
        if (tolte.error) logger.error(`scadenze tolte ${id}: ${tolte.error.message}`);

        const dati: DatiEsitoImport = {
          nomeFile: riga.nome_file,
          fonte: riga.fonte,
          stato: riga.stato,
          righeTotali: riga.righe_totali,
          righeCreate: riga.righe_create,
          righeAggiornate: riga.righe_aggiornate,
          righeErrore: riga.righe_errore,
          righeSaltate: riga.righe_saltate,
          problemi: riga.problemi ?? [],
          scadenzeTolte: tolte.count ?? 0,
          scadenzeTolteElenco: tolte.data ?? [],
          ricollegabili: ricollegabili.totale,
          ricollegabiliConCollegamenti: ricollegabili.conCollegamenti,
          ricollegabiliElenco: ricollegabili.righe,
          collegamentiPersi: persi.totale,
          collegamentiPersiElenco: persi.righe,
          scartate: dettaglioScartateImport(riga.report_saltati, riga.codici_mancanti),
          anomalie: gruppi.filter((g) => g.totale > 0),
          createdAt: riga.created_at,
          completataAt: riga.completata_at,
        };
        const livello = livelloEsitoImport(dati);

        // f. Notifica in app (la push parte dal trigger su notifiche).
        const { error: nErr } = await supabaseAdmin.from("notifiche").insert({
          user_id: riga.eseguita_da,
          tipo: "esito_import",
          titolo: titoloEsitoImport(dati),
          messaggio: messaggioEsitoImport(dati),
          link: "/import-export",
          metadata: { importazione_id: id, fonte: riga.fonte, livello },
        } as never);
        if (nErr) {
          // h. Rimette la riga in coda: il giro successivo ritenta.
          await supabaseAdmin
            .from("importazioni")
            .update({ esito_notificato_at: null } as never)
            .eq("id", id);
          throw new Error(`insert notifica esito import ${id}: ${nErr.message}`);
        }

        // g. Email best-effort: se fallisce la notifica resta.
        const { data: profilo } = await supabaseAdmin
          .from("profili")
          .select("email")
          .eq("id", riga.eseguita_da)
          .maybeSingle();
        const email = (profilo?.email as string | null | undefined)?.trim();
        if (!email) {
          logger.warn(`Esito import ${id}: profilo senza email, inviata solo la notifica`);
          return "notificato";
        }
        const appUrl = process.env.VITE_APP_URL ?? "https://fidi-manager-suite.lovable.app";
        const { subject, html } = emailEsitoImport(dati, appUrl);
        const res = await sendEmailViaEdge({
          to: email,
          subject,
          html,
          fromName: "MADE Distribuzione",
        });
        if (!res.ok) logger.error(`Email esito import ${id} fallita: ${res.err ?? "errore sconosciuto"}`);
        return "notificato";
      });
      if (esito === "notificato") notificate++;
    }

    return { notificato: notificate > 0 };
  },
);
