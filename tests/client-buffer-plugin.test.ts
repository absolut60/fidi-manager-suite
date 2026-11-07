import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { clientBufferPlugin } from "../vite.config";

function resolve(source: string, environment: string, ssr = false) {
  const hook = clientBufferPlugin().resolveId;
  const handler = typeof hook === "function" ? hook : hook?.handler;
  if (!handler) throw new Error("resolveId mancante");
  const context = { environment: { name: environment } };
  return handler.call(context as ThisParameterType<typeof handler>, source, undefined, {
    ssr, isEntry: false, attributes: {},
  });
}

describe("Buffer solo nel client Vite", () => {
  const npmBuffer = fileURLToPath(new URL("../node_modules/buffer/index.js", import.meta.url));
  test("safer-buffer risolve il pacchetto npm con entrambe le forme dell'alias", () => {
    expect(resolve("buffer", "client")).toBe(npmBuffer);
    expect(resolve("buffer/", "client")).toBe(npmBuffer);
  });
  test("SSR, worker e altri ambienti mantengono la risoluzione precedente", () => {
    for (const environment of ["ssr", "server", "worker", "nitro"]) {
      expect(resolve("buffer", environment)).toBeNull();
      expect(resolve("buffer/", environment)).toBeNull();
    }
    expect(resolve("buffer", "client", true)).toBeNull();
    expect(resolve("node:buffer", "client")).toBeNull();
  });
  test("non intercetta dipendenze diverse da Buffer", () => {
    expect(resolve("iconv-lite", "client")).toBeNull();
    expect(resolve("buffer/other", "client")).toBeNull();
  });
});