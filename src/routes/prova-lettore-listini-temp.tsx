import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { leggiFileListiniGamma } from "@/lib/listini-gamma-lettura";

export const Route = createFileRoute("/prova-lettore-listini-temp")({ component: Prova });

function Prova() {
  const [esito, setEsito] = useState("in attesa");
  const [tick, setTick] = useState(0);
  return (
    <div className="p-4">
      <input type="file" aria-label="file" onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const t0 = performance.now(); setEsito("lettura");
        const iv = setInterval(() => setTick((x) => x + 1), 100);
        try {
          const r = await leggiFileListiniGamma(f);
          setEsito(JSON.stringify({ ms: Math.round(performance.now() - t0), manifest: r.manifest, pacchetti: r.pacchetti.length, byte: r.pacchetti.reduce((s, p) => s + p.json.length, 0), primo: r.pacchetti[0]?.nome }));
        } catch (err) { setEsito("ERRORE " + String(err)); }
        clearInterval(iv);
      }} />
      <p data-testid="tick">{tick}</p>
      <pre data-testid="esito" className="whitespace-pre-wrap text-xs">{esito}</pre>
    </div>
  );
}
