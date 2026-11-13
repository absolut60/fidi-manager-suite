import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { sanificaHtml, sanificaDocumentoHtml, SANDBOX_ANTEPRIMA } from "../src/lib/html-sicuro";

const win = new JSDOM("").window as unknown as Parameters<typeof sanificaHtml>[1];

describe("sanificaHtml (FM64)", () => {
  test("toglie <script>", () => {
    const r = sanificaHtml('<p>ciao</p><script>alert(1)</script>', win);
    expect(r).toBe("<p>ciao</p>");
  });
  test("toglie onerror da <img>", () => {
    const r = sanificaHtml('<img src="https://x.it/a.png" onerror="alert(1)">', win);
    expect(r).not.toContain("onerror");
    expect(r).toContain('src="https://x.it/a.png"');
  });
  test("toglie href javascript:", () => {
    const r = sanificaHtml('<a href="javascript:alert(1)">x</a>', win);
    expect(r).not.toContain("javascript:");
  });
  test("toglie <iframe>", () => {
    expect(sanificaHtml('<div>a<iframe src="https://x.it"></iframe></div>', win)).toBe("<div>a</div>");
  });
  test("tabella email con stili inline resta uguale", () => {
    const t = '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4f4f4"><tbody><tr><td align="center" style="padding:16px;color:#1a2b4c;font-family:Arial"><a href="https://made.it" target="_blank" class="btn" style="color:#fff">Vai</a></td></tr></tbody></table>';
    expect(sanificaHtml(t, win)).toBe(t);
  });
  test("documento completo: tiene <style> nel head e toglie script", () => {
    const r = sanificaDocumentoHtml('<!DOCTYPE html><html><head><style>body{color:red}</style></head><body><p>x</p><script>alert(1)</script></body></html>', win);
    expect(r).toContain("<style>body{color:red}</style>");
    expect(r).not.toContain("<script");
  });
  test("sandbox mai con allow-scripts", () => {
    expect(SANDBOX_ANTEPRIMA).not.toContain("allow-scripts");
  });
});
