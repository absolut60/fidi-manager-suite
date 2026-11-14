import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const src = join(import.meta.dir, "../src");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

test("lettura client getChiaveMappe e cache chiave-mappe solo nell'hook canonico", () => {
  const violations = files(src).flatMap((file) => {
    const name = relative(src, file);
    if (name === "hooks/use-chiave-mappe.ts" || name.endsWith(".server.ts") || name.endsWith(".functions.ts")) return [];
    const code = readFileSync(file, "utf8");
    return /\bgetChiaveMappe\b|["']google-maps-key["']|["']chiave-mappe["']/.test(code) ? [name] : [];
  });
  expect(violations).toEqual([]);
});

test("il codice client non identifica stores tramite nome", () => {
  const violations = files(src).flatMap((file) => {
    const name = relative(src, file);
    if (name.endsWith(".server.ts") || name.endsWith(".functions.ts")) return [];
    const code = readFileSync(file, "utf8");
    return /\.from\(\s*["']stores["']\s*\)(?:(?!;|\.from\().)*?\.eq\(\s*["']nome["']\s*,/s.test(code) ? [name] : [];
  });
  expect(violations).toEqual([]);
});