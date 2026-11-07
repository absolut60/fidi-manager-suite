// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// The alias plugin can turn buffer into buffer/ before this hook runs.
// Resolve both spellings before Vite's built-in externalization, only in client.
export function clientBufferPlugin(): Plugin {
  const bufferPath = fileURLToPath(new URL("./node_modules/buffer/index.js", import.meta.url));
  return {
    name: "msgreader-client-buffer",
    enforce: "pre",
    resolveId(source, _importer, options) {
      if (this.environment.name !== "client" || options.ssr) return null;
      if (source === "buffer" || source === "buffer/") return bufferPath;
      return null;
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  vite: {
    plugins: [clientBufferPlugin()],
    // Preserve the existing alias for other environments; the client-only hook
    // above forces the absolute npm entry, without injecting a global Buffer.
    resolve: { alias: { buffer: "buffer/" } },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
