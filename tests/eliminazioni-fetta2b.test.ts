import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const leggi = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("API kit e listini restituiscono l'esito; ogni chiamante blocca il successo negato", () => {
  for (const [path, funzione, tabella] of [
    ["src/lib/articoli-api.ts", "deleteListinoAcquisto", "listini_acquisto"],
    ["src/lib/kit-api.ts", "deleteKit", "kit"],
    ["src/lib/kit-api.ts", "deleteComponente", "kit_componenti"],
  ]) {
    const funzioneCode = leggi(path).split(`export async function ${funzione}`)[1]?.split("\n}")[0] ?? "";
    expect(funzioneCode).toContain(`return eliminaConEsito("${tabella}", id)`);
  }
  expect(leggi("src/components/articoli/ListinoAcquistoSection.tsx")).toContain('esito.tipo !== "eliminato"');
  const kit = leggi("src/routes/_app/kit.$id.tsx");
  expect(kit.match(/esito.tipo !== "eliminato"/g)?.length).toBe(2);
});

test("chat: rimozioni per id reali, esito negato/parziale e ricaricamento reale prima del successo", () => {
  const code = leggi("src/routes/_app/chat.tsx");
  expect(code).toContain('select("id, user_id")');
  expect(code).toContain('esitoRimozioni = await eliminaConEsito("canale_membri", ids)');
  expect(code).toContain('delOk = esitoRimozioni.tipo === "eliminato"');
  expect(code).toContain('await ricaricaMembri()');
  expect(code).toContain('setSel(new Set(ricaricati.data.map(r => r.user_id)))');
  expect(code.indexOf('messaggioEsitoEliminazione(esitoRimozioni')).toBeLessThan(code.indexOf('toast.success(nomeCambiato'));
});