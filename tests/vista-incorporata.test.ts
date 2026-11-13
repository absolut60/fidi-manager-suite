import { describe, expect, test } from "bun:test";
import { destinazioneFuoriFinestra, urlClienteIncorporato, vistaIncorporata, vistaSearchSchema } from "../src/lib/vista-incorporata";

describe("FM67 vista incorporata", () => {
  test("solo vista=incorporata abilita la presentazione senza menu", () => {
    expect(vistaIncorporata(vistaSearchSchema.parse({vista:"incorporata"}))).toBe(true);
    for (const vista of [undefined,"normale","INCORPORATA",true,{}]) expect(vistaIncorporata(vistaSearchSchema.parse({vista}))).toBe(false);
  });
  test("iframe cliente richiede la vista incorporata", () => {
    expect(urlClienteIncorporato("cliente-1")).toBe("/clienti/cliente-1?vista=incorporata");
  });
  test("cambio tab resta nella scheda", () => {
    expect(destinazioneFuoriFinestra("?vista=incorporata&tab=anagrafica","https://app.test/clienti/1?vista=incorporata")).toBeNull();
  });
  test("altre pagine aprono senza propagare la vista incorporata", () => {
    expect(destinazioneFuoriFinestra("/legali?cliente=1&vista=incorporata","https://app.test/clienti/1?vista=incorporata")).toBe("https://app.test/legali?cliente=1");
  });
  test("mail, telefono ed allegati esterni restano invariati", () => {
    for(const href of ["tel:021234", "mailto:info@example.test", "https://storage.test/file.pdf"]) expect(destinazioneFuoriFinestra(href,"https://app.test/clienti/1")).toBeNull();
  });
});