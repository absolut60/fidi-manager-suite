import { test, expect } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import {
  FONTI_IMPORT_FIDO_TEORICO, valutaImportCompleti, leggiStatoImportCompleti,
  type RigaImportFido,
} from "../src/lib/fido-teorico-import-completi";

const ora = new Date("2026-10-31T11:03:00Z");
const quattro = (created_at = "2026-10-31T08:00:00Z", stato = "completata"): RigaImportFido[] =>
  FONTI_IMPORT_FIDO_TEORICO.map((fonte) => ({ fonte, stato, created_at }));
const scadenziario = (created_at: string, stato = "completata"): RigaImportFido =>
  ({ fonte: "scadenziario", stato, created_at });

test("quattro fonti ieri e solo scadenziario oggi: aspetta le altre tre", () => {
  const risultato = valutaImportCompleti(null, [...quattro("2026-10-30T10:00:00Z"), scadenziario("2026-10-31T10:00:00Z")], ora);
  expect(risultato.pronto).toBe(false);
  expect(risultato.mancanti).toEqual(["anagrafica", "analisi_rischio", "blocco_fido_assicurazione"]);
});

test("quattro oggi e scadenziario reimportato dopo il ricalcolo: parte", () => {
  expect(valutaImportCompleti("2026-10-31T09:00:00Z", [...quattro(), scadenziario("2026-10-31T10:00:00Z")], ora).pronto).toBe(true);
});

test("ordine libero: tutte le 24 permutazioni delle quattro fonti", () => {
  function permuta(righe: RigaImportFido[]): RigaImportFido[][] {
    if (righe.length === 0) return [[]];
    return righe.flatMap((r, i) => permuta(righe.filter((_, j) => j !== i)).map((resto) => [r, ...resto]));
  }
  const ordini = permuta(quattro());
  expect(ordini.length).toBe(24);
  for (const righe of ordini) expect(valutaImportCompleti(null, righe, ora).pronto).toBe(true);
});

test("completata_con_errori vale per ciascuna fonte", () => {
  expect(valutaImportCompleti(null, quattro(undefined, "completata_con_errori"), ora).pronto).toBe(true);
});

test("senza novità successive al ricalcolo non parte, ma non manca nessuna fonte", () => {
  expect(valutaImportCompleti("2026-10-31T08:00:00Z", quattro(), ora)).toEqual({ pronto: false, mancanti: [], inElaborazione: [] });
});

test("in elaborazione blocca anche se creata ieri e anche con una versione conclusa oggi", () => {
  for (const fonte of FONTI_IMPORT_FIDO_TEORICO) {
    const risultato = valutaImportCompleti(null, [...quattro(), { fonte, stato: "in_elaborazione", created_at: "2026-10-30T08:00:00Z" }], ora);
    expect(risultato.pronto).toBe(false);
    expect(risultato.inElaborazione).toEqual([fonte]);
    expect(risultato.mancanti).toEqual([]);
  }
});

test("il giorno dopo aspetta nuovamente tutte e quattro", () => {
  expect(valutaImportCompleti(null, quattro(), new Date("2026-11-01T08:00:00Z")).mancanti).toEqual([...FONTI_IMPORT_FIDO_TEORICO]);
});

test("mezzanotte Europe/Rome inclusa, istante precedente escluso", () => {
  expect(valutaImportCompleti(null, quattro("2026-10-30T23:00:00Z"), ora).pronto).toBe(true);
  expect(valutaImportCompleti(null, quattro("2026-10-30T22:59:59Z"), ora).pronto).toBe(false);
});

test("giorno di Roma diverso dal giorno UTC", () => {
  expect(valutaImportCompleti(null, quattro("2026-10-31T23:00:00Z"), new Date("2026-10-31T23:03:00Z")).pronto).toBe(true);
  expect(valutaImportCompleti(null, quattro("2026-10-31T22:59:59Z"), new Date("2026-10-31T23:03:00Z")).pronto).toBe(false);
});

test("fallita, timestamp non valido e fonte estranea non soddisfano né bloccano il giro", () => {
  expect(valutaImportCompleti(null, quattro(undefined, "fallita"), ora).pronto).toBe(false);
  expect(valutaImportCompleti(null, quattro("non-data"), ora).pronto).toBe(false);
  expect(valutaImportCompleti(null, [...quattro(), { fonte: "altra", stato: "in_elaborazione", created_at: ora.toISOString() }], ora).pronto).toBe(true);
});

test("formato Postgres dell'ultimo ricalcolo interpretato correttamente", () => {
  expect(valutaImportCompleti("2026-10-31 09:00:00+00", [...quattro(), scadenziario("2026-10-31 10:00:00+00")], ora).pronto).toBe(true);
});

test("query conserva l'intero giorno e le elaborazioni precedenti, anche nei cambi d'ora", async () => {
  const casi = [
    ["2026-10-31T11:00:00Z", "2026-10-30T23:00:00.000Z"],
    ["2026-07-15T11:00:00Z", "2026-07-14T22:00:00.000Z"],
    ["2026-03-29T11:00:00Z", "2026-03-28T23:00:00.000Z"],
    ["2026-10-25T11:00:00Z", "2026-10-24T22:00:00.000Z"],
  ];
  for (const [adesso, inizio] of casi) {
    const urls: URL[] = [];
    const client = createClient("https://example.invalid", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        return new Response(JSON.stringify(url.pathname.endsWith("configurazioni") ? { valore: "2026-10-31T09:00:00Z" } : []), {
          headers: { "Content-Type": "application/json" },
        });
      } },
    });
    await leggiStatoImportCompleti(client, new Date(adesso));
    const url = urls.find((u) => u.pathname.endsWith("importazioni"));
    expect(url?.searchParams.get("or")).toBe(`(stato.eq.in_elaborazione,created_at.gte.${inizio})`);
  }
});