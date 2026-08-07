import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { parseRischioSheet } from "/dev-server/src/lib/inngest/parsers.server.ts";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const t0 = Date.now();
const wb = XLSX.read(await Bun.file("/tmp/ar.xlsx").arrayBuffer(), { type: "array" });
const { rows, missing } = parseRischioSheet(wb.Sheets[wb.SheetNames[0]!]!);
console.log("rows", rows.length, "missing", missing.length);

const { data: imp } = await sb
  .from("importazioni")
  .insert({
    nome_file: "Analisi rischio.xlsx",
    fonte: "analisi_rischio",
    stato: "in_elaborazione",
    righe_totali: rows.length + missing.length,
  })
  .select("id")
  .single();
const importazioneId = (imp as any).id as string;

// lookup
const codici = [...new Set(rows.map((r) => r.codice_gestionale))];
const lookup: Record<string, { id: string; ragione_sociale: string }> = {};
for (let i = 0; i < codici.length; i += 500) {
  const { data } = await sb
    .from("clienti")
    .select("id, codice_gestionale, ragione_sociale")
    .in("codice_gestionale", codici.slice(i, i + 500))
    .limit(510);
  (data ?? []).forEach((c: any) => {
    if (c.codice_gestionale) lookup[c.codice_gestionale] = { id: c.id, ragione_sociale: c.ragione_sociale };
  });
}
console.log("lookup", Object.keys(lookup).length);

const now = new Date().toISOString();
let aggiornati = 0, saltati = 0, errori = 0;
const dettaglio: Array<{ riga: number; errore: string }> = [];
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const mancanti = chunk.filter((r) => !lookup[r.codice_gestionale]);
  const validi = chunk.filter((r) => !!lookup[r.codice_gestionale]);
  saltati += mancanti.length;
  for (const r of mancanti)
    dettaglio.push({ riga: r.idx, errore: `Codice ${r.codice_gestionale} non trovato in anagrafica` });
  if (mancanti.length)
    await sb.from("anomalie_import").insert(
      mancanti.map((r) => ({
        importazione_id: importazioneId,
        tipo_anomalia: "cliente_non_trovato",
        campo: "codice_gestionale",
        codice_gestionale: r.codice_gestionale,
        ragione_sociale: r.ragione_sociale || null,
        valore_attuale: r.codice_gestionale,
      })) as any,
    );
  if (validi.length) {
    const payloads = validi.map((r) => ({
      id: lookup[r.codice_gestionale]!.id,
      ragione_sociale: lookup[r.codice_gestionale]!.ragione_sociale,
      ...r.payload,
      ultima_sincronizzazione: now,
    }));
    const { error } = await sb.from("clienti").upsert(payloads as any, { onConflict: "id" });
    if (error) {
      errori += validi.length;
      dettaglio.push({ riga: validi[0]!.idx, errore: `Upsert batch: ${error.message}` });
      console.log("ERR", error.message);
    } else aggiornati += validi.length;
  }
}
const cErrori = missing.length + errori;
await sb
  .from("importazioni")
  .update({
    righe_elaborate: rows.length + missing.length,
    righe_create: 0,
    righe_aggiornate: aggiornati,
    righe_saltate: saltati,
    righe_errore: cErrori,
    stato: cErrori > 0 || saltati > 0 ? "completata_con_errori" : "completata",
    completata_at: new Date().toISOString(),
    log_errori: [...dettaglio.slice(0, 200), { riga: 0, errore: `Riepilogo: ${aggiornati} aggiornati, ${saltati} saltati, ${cErrori} errori` }],
  } as any)
  .eq("id", importazioneId);

console.log({ aggiornati, saltati, errori: cErrori, secondi: ((Date.now() - t0) / 1000).toFixed(1) });
