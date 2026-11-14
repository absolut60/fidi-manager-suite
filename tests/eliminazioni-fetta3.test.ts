import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
const leggi = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
test("campagna WhatsApp: tutti i figli prima del padre, zero/parziale interrompono", () => {
  const code = leggi("src/components/marketing/whatsapp-campagne-tab.tsx").split("const elimina = useMutation({")[1]?.split("return (\n")[0] ?? "";
  expect(code).toContain('leggiTutteLeRighe<{ id: string }>');
  const figli = code.indexOf('eliminaConEsito("messaggi_whatsapp"');
  const stop = code.indexOf('if (esito.tipo !== "eliminato") return');
  const padre = code.indexOf('eliminaConEsito("campagne_whatsapp"');
  expect(figli).toBeGreaterThan(0); expect(stop).toBeGreaterThan(figli); expect(padre).toBeGreaterThan(stop);
});
test("marketing: ogni cancellazione usa esito unico, senza DELETE non verificati", () => {
  for (const path of ["src/components/marketing/whatsapp-template-tab.tsx", "src/components/marketing/whatsapp-campagne-tab.tsx", "src/routes/_app/marketing.segmenti.tsx", "src/routes/_app/marketing.invii.tsx", "src/routes/_app/marketing.campagne.tsx"]) {
    const code = leggi(path); expect(code).not.toContain(".delete()"); expect(code).toContain("eliminaConEsito("); expect(code).toContain("messaggioEsitoEliminazione(esito");
  }
});
test("rimozioni multiple: conteggio confermato, parziale ricarica e conserva solo id residui", () => {
  for (const path of ["src/components/marketing/whatsapp-campagne-tab.tsx", "src/routes/_app/marketing.campagne.tsx"]) {
    const code = leggi(path).split("const rimuoviSelezionati = useMutation({")[1]?.split("const toggleSelezionato")[0] ?? "";
    expect(code).toContain('if (esito.tipo !== "eliminato")'); expect(code).toContain('esito.tipo === "parziale"'); expect(code).toContain('await qc.invalidateQueries'); expect(code).toContain('setSelezionati(new Set(data.map(r => r.id)))'); expect(code).toContain('richiesti.toLocaleString("it-IT")');
    expect(code.indexOf('messaggioEsitoEliminazione')).toBeLessThan(code.indexOf('toast.success'));
  }
});
