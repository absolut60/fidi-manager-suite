import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement, act, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useStatoSalvataggioPreventivo, devoBloccareUscita } from "@/lib/use-stato-salvataggio-preventivo";

test("il primo carattere arriva alla cella prima del cambio stato, anche passando fra campi", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // Import dopo aver installato il DOM: React deve rilevare il supporto input.
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root");
  if (!container) throw new Error("Contenitore mancante");
  const root = createRoot(container);
  const qc = new QueryClient();
  function Campo() {
    const [value, setValue] = useState("");
    return createElement("input", { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value) });
  }
  function Scheda() {
    const s = useStatoSalvataggioPreventivo("prova");
    return createElement("div", s.contenitoreProps,
      createElement("output", { "data-block": devoBloccareUscita(s.stato) }, s.stato),
      createElement(Campo), createElement(Campo));
  }
  try {
    await act(async () => { root.render(createElement(QueryClientProvider, { client: qc }, createElement(Scheda))); });
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Setter input mancante");
    for (const input of container.querySelectorAll("input")) {
      await act(async () => { input.focus(); });
      // Non racchiudere l'evento nativo in act: quel batching artificiale
      // nasconde il ripristino del value fra capture e bubble nel browser.
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false);
      setter.call(input, "7");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
      await act(async () => {});
      expect(input.value).toBe("7");
      expect(container.querySelector("output")?.textContent).toBe("modifiche");
      expect(container.querySelector("output")?.getAttribute("data-block")).toBe("true");
      await act(async () => { input.blur(); });
      expect(container.querySelector("output")?.textContent).toBe("salvato");
    }
  } finally {
    await act(async () => { root.unmount(); });
    qc.clear(); dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});