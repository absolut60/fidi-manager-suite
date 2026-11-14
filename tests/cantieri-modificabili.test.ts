import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const leggi = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("modifica cantieri nelle liste e Testata deriva solo dal risultato DB", () => {
  const paths = ["src/routes/_app/cantieri.tsx", "src/components/cliente-cantieri-tab.tsx", "src/components/lead/lead-relazioni-tabs.tsx", "src/components/preventivatore/CantiereTestata.tsx"];
  for (const path of paths) {
    const code = leggi(path);
    expect(code).toContain("useCantieriModificabili");
    expect(code).toMatch(/modificabili\?\.has\(c(?:\.id|antiere\.id)|modificabili\?\.has\(geo\.id\)/);
    expect(code).not.toMatch(/const (?:puoModificare|modifica|apriCantiere)\s*=.*(?:roles|puoModificareRecordPreventivista|isTrasversale)/);
    expect(code).not.toMatch(/if\s*\([^\n]*(?:puoModificareRecordPreventivista|isTrasversale)[^\n]*\)\s*setScheda/);
  }
  const dialog = leggi("src/components/cantiere-dialog.tsx");
  expect(dialog).toContain("await puoModificareCantiereDb(cantiere)");
  expect(dialog).not.toContain("puoModificareRecordPreventivista");
});

test("una RPC per elenco, nessuna richiesta per riga o limite implicito di mille id", () => {
  const code = leggi("src/lib/cantiere-listini-api.ts");
  const batch = code.split("export async function cantieriModificabili")[1]?.split("export function useCantieriModificabili")[0] ?? "";
  expect(batch.match(/supabase\.rpc/g)?.length).toBe(1);
  expect(batch).toContain('"cantieri_modificabili", { _ids: unici }');
  expect(batch).not.toMatch(/\.map\(|\.slice\(|for\s*\(/);
  expect(code).toContain("await puoModificareCantiereDb(singolo)");
});

test("barra richieste consuma lo stesso stato AppShell senza duplicare lo scroll", () => {
  expect(leggi("src/components/app-shell.tsx")).toContain("BarraBluContext.Provider value={barraNascosta}");
  const richieste = leggi("src/routes/_app/richieste.tsx");
  expect(richieste).toContain("useBarraBluNascosta()");
  expect(richieste).toContain("pv-orizzontale:data-[nascosta=true]:top-2 lg:top-2");
  expect(richieste).not.toContain("useBarraAScomparsa");
});