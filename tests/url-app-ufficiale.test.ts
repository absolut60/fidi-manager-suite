import { expect, test } from "bun:test";
import { urlAppUfficiale } from "../src/lib/url-app.server";

test("URL email: fallback ufficiale e singolo dominio configurabile lato server", () => {
  const precedente = process.env["PUBLIC_APP_URL"];
  try {
    delete process.env["PUBLIC_APP_URL"];
    expect(urlAppUfficiale()).toBe("https://fidi-manager-suite.lovable.app");
    process.env["PUBLIC_APP_URL"] = "https://www.madepoint.it/";
    expect(urlAppUfficiale()).toBe("https://www.madepoint.it");
    for (const valore of ["http://esempio.it", "https://esempio.it/percorso", "https://esempio.it,https://altro.it"]) {
      process.env["PUBLIC_APP_URL"] = valore;
      expect(() => urlAppUfficiale()).toThrow();
    }
  } finally {
    if (precedente === undefined) delete process.env["PUBLIC_APP_URL"];
    else process.env["PUBLIC_APP_URL"] = precedente;
  }
});