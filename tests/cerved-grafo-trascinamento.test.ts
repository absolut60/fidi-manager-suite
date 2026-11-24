import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { normalizzaLightReportXml } from "../src/lib/cerved/cerved.server";
import { costruisciGrafoCerved } from "../src/lib/cerved-grafo";
import { creaSimulazione, fasciaTela, foglieEsclusive } from "../src/components/cerved/grafo-collegati-cerved";

test("foglieEsclusive: foglia singola", () => {
  expect(foglieEsclusive("n", [{ da: "f", a: "n" }, { da: "n", a: "c" }], "c")).toEqual(["f"]);
});
test("foglieEsclusive: vicino con due legami escluso", () => {
  expect(foglieEsclusive("n", [{ da: "v", a: "n" }, { da: "v", a: "x" }], "c")).toEqual([]);
});
test("foglieEsclusive: il centro non è mai foglia", () => {
  expect(foglieEsclusive("n", [{ da: "n", a: "c" }], "c")).toEqual([]);
});
test("foglieEsclusive: nessun vicino", () => {
  expect(foglieEsclusive("n", [{ da: "a", a: "b" }], "c")).toEqual([]);
});
test("fasciaTela: larga / alta / normale", () => {
  expect(fasciaTela(1200, 1000)).toBe("larga");
  expect(fasciaTela(800, 1000)).toBe("alta");
  expect(fasciaTela(1000, 1000)).toBe("normale");
});
test("simulazione ferma: creazione e riordina non chiamano restart, centro in 0,0", () => {
  const r = normalizzaLightReportXml(readFileSync(`${import.meta.dir}/fixtures/cerved-light-report-ecocostruzioni.xml`, "utf8"));
  const g = costruisciGrafoCerved(r, { nome: r.anagrafica?.denominazione ?? null, partita_iva: r.anagrafica?.partita_iva ?? null, codice_fiscale: r.anagrafica?.codice_fiscale ?? null });
  const m = creaSimulazione(g, "larga");
  let riavvii = 0; const orig = m.sim.restart.bind(m.sim); m.sim.restart = () => { riavvii++; return orig(); };
  const altro = m.nodi.find((n) => n.nodo.tipo !== "centro")!; altro.fx = 999; altro.fy = 999;
  m.riordina();
  expect(riavvii).toBe(0);
  expect(altro.fx ?? null).toBeNull();
  const c = m.nodi.find((n) => n.nodo.tipo === "centro")!;
  expect([c.x, c.y]).toEqual([0, 0]);
});
