import { expect, mock, test } from "bun:test";

const chiamate: string[] = [];
mock.module("../src/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (nome: string) => {
      chiamate.push(nome);
      return { data: nome === "import_marche_gamma" ? 1 : { invariati: 1000, listini_riscritti: 0 }, error: null };
    },
    from: () => ({ delete: () => ({ eq: () => ({ like: async () => ({ error: null }) }) }) }),
  },
}));

const { eseguiLotti, LOTTI_PARALLELI, GESTORI_LISTINI_GAMMA } = await import("../src/lib/inngest/listini-gamma/gestori.server");

test("tutti i fogli lavorano un solo lotto alla volta mantenendo i conteggi", async () => {
  expect(LOTTI_PARALLELI).toBe(1);
  for (const gestore of GESTORI_LISTINI_GAMMA) {
    let attivi = 0;
    let massimo = 0;
    const ordine: number[] = [];
    const tot = await eseguiLotti({
      step: { run: async (_id, fn) => fn() }, importazioneId: "prova", lotti: 3,
      leggiLotto: async () => [], leggiAnomalie: async () => [],
      leggiCodici: async () => [], leggiMeta: async () => ({}), avanzamento: async () => {},
    }, gestore.chiave, { invariati: 0 }, async (i) => {
      attivi++;
      massimo = Math.max(massimo, attivi);
      await new Promise((r) => setTimeout(r, 2));
      ordine.push(i);
      attivi--;
      return { invariati: 1000 };
    });
    expect(massimo).toBe(1);
    expect(ordine).toEqual([0, 1, 2]);
    expect(tot.invariati).toBe(3000);
  }
});

test("marche importate una sola volta prima dei lotti articoli", async () => {
  chiamate.length = 0;
  const gestore = GESTORI_LISTINI_GAMMA.find((g) => g.chiave === "articoli");
  if (!gestore) throw new Error("Gestore articoli assente");
  await gestore.esegui({
    step: { run: async (_id, fn) => fn() }, importazioneId: "prova", lotti: 3,
    leggiLotto: async () => [], leggiAnomalie: async () => [], leggiCodici: async () => [],
    leggiMeta: async () => ({ marche: [{ codice: "KNA", descrizione: "Knauf" }] }),
    avanzamento: async () => {},
  });
  expect(chiamate).toEqual(["import_marche_gamma", "import_articoli_gamma_lotto", "import_articoli_gamma_lotto", "import_articoli_gamma_lotto"]);
});