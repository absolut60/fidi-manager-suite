# FM90 — fetta B2: letture a schermo per soggetto

Fonte unica: `src/lib/cerved/cerved-letture.ts` (`idSoggettoDiEntita`, `idSoggettiDiEntita`, blocchi da 150).

## Punti trovati e corretti (tutte le letture client di `cerved_report`/`cerved_fotografie`)
1. `src/components/cliente-cerved-tab.tsx` — `ClienteCervedTab`: fotografie (ricerca, profilo, score, bilancio, eventi_negativi, fido) per `id_soggetto` del soggetto collegato; non collegato → nessuna fotografia, come prima.
2. `src/components/cliente-cerved-tab.tsx` — `BarraReportCerved`: report più recente per `id_soggetto` (scade_il desc).
3. `src/hooks/use-light-report-cliente.ts` — ultima fotografia `light_report` per `id_soggetto`; firma e chiave invariate.
4. `src/hooks/use-clienti-con-report-cerved.ts` — gauge di Clienti/Alert fidi/Richieste fido: cliente → id_soggetto → report/fotografie; chiave `v3`, errori silenziosi.
5. `src/hooks/use-cerved-compatto-clienti.ts` — sezione Cerved compatta (lista/proposta): fotografie per `id_soggetto`, risultato ancora per cliente.
6. `src/components/impostazioni/report-cerved-attesa-card.tsx` — legge per stato (nessun filtro per cliente); se `cliente_id` è nullo (report di un lead) la riga è mostrata senza link.

Nessuna modifica visiva, server, migrazione.

## Test
- `tests/cerved-letture.test.ts`: mappatura entità→colonna, blocchi, Map; guardia permanente contro filtri per cliente_id/lead_id su queste tabelle fuori da `src/lib/cerved/*.server.ts|*.functions.ts`.
