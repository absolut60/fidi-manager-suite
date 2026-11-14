import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { classificaEsitoEliminazione } from "../src/lib/esito-eliminazione";
const leggi = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("allegati: nessuna rimozione Storage prima del successo verificato della riga", () => {
  for (const path of ["src/components/allegati-section.tsx", "src/routes/_app/task.$id.tsx"]) {
    const codice = leggi(path);
    const inizio = codice.indexOf('await eliminaConEsito("allegati", a.id)');
    expect(inizio).toBeGreaterThan(0);
    const azione = codice.slice(inizio, codice.indexOf('remove([a.storage_path])', inizio));
    expect(azione).toMatch(/esito.tipo !== "eliminato"[\s\S]*return/);
    expect(azione).toContain("supabase.storage");
  }
});

test("partecipanti: due eliminati su tre non sono un successo completo e la lista si aggiorna", () => {
  expect(classificaEsitoEliminazione(null, 2, 3)).toEqual({ tipo: "parziale", eliminati: 2, richiesti: 3 });
  const codice = leggi("src/routes/_app/eventi.$eventoId.tsx").split("const eliminaMassivo = useMutation")[1]?.split("/** Invio massivo")[0] ?? "";
  expect(codice).toContain('esito.tipo !== "eliminato" && esito.tipo !== "parziale"');
  expect(codice).toContain('if (esito.tipo === "parziale") toast.error(messaggioEsitoEliminazione');
  expect(codice).toContain('queryKey: ["evento-partecipanti", eventoId]');
  expect(codice).not.toContain("return selezionatiValidi.length");
});