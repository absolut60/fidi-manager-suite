import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { motivoRigaProposta } from "@/lib/proposta-fido-visibilita";
import { CLASSI_MOTIVO_RIGA, LEGENDA_MOTIVI, etichettaRigaProposta } from "@/lib/proposta-fido-riga";

// FM55: le righe della pagina Alert fidi si colorano con la STESSA fonte della proposta
// massiva (motivoRigaProposta + CLASSI_MOTIVO_RIGA), senza una seconda logica e senza colori fissi.
const pagina = readFileSync("src/routes/_app/alert-fidi.tsx", "utf8");

describe("FM55 — Alert fidi: righe colorate col motivo della massiva", () => {
  test("la pagina usa la fonte unica, non una logica propria", () => {
    expect(pagina).toContain('from "@/lib/proposta-fido-visibilita"');
    expect(pagina).toContain('from "@/lib/proposta-fido-riga"');
    expect(pagina).toContain("motivoRigaProposta(");
    expect(pagina).toContain("etichettaRigaProposta(");
    expect(pagina).toContain("CLASSI_MOTIVO_RIGA[");
    expect(pagina).toContain("LEGENDA_MOTIVI");
    // Il motivo arriva da regola e segnalazioni del fido teorico del cliente (teoricoMap).
    expect(pagina).toMatch(/regola:\s*t\?\.regola_applicata/);
    expect(pagina).toMatch(/segnalazioni:\s*t\?\.segnalazioni/);
    // Le etichette non sono riscritte qui: arrivano da etichettaRigaProposta.
    expect(pagina).not.toContain("Cliente con scaduto");
    expect(pagina).not.toContain("Da autorizzare: compra molto più del solito");
  });

  test("colore su riga desktop e su scheda telefono, con la legenda in cima all'elenco", () => {
    // Stesso schema della massiva: bordo+sfondo su TableRow e sulla prima cella (bordo collassato).
    expect(pagina).toMatch(/<TableRow key=\{a\.id\} className=\{classiRigaAlert\(a\)\}>/);
    expect(pagina).toMatch(/<TableCell className=\{`align-top \$\{classiRigaAlert\(a\)\}`\}/);
    expect(pagina).toMatch(/<SchedaLista key=\{a\.id\}\s+className=\{classiRigaAlert\(a\)\}/);
    expect(pagina).toContain("data-legenda-motivi");
    // L'etichetta del motivo sta accanto al badge "Vicino al limite N%" in entrambe le viste.
    const badge = /<Badge variant="outline"[^>]*>\{etichettaAvviso\(a\)\}<\/Badge>\s*\{renderEtichettaMotivo\(a\)\}/g;
    expect(pagina.match(badge)?.length).toBe(2);
  });

  test("la pagina non contiene colori fissi: solo token del tema via CLASSI_MOTIVO_RIGA", () => {
    expect(pagina).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(pagina).not.toMatch(/(bg|text|border|ring)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]/);
    expect(pagina).not.toMatch(/rgb\(|rgba\(|oklch\(|hsl\(/);
    // I bordi colore non sono scritti a mano nella pagina: vengono dalla mappa condivisa.
    expect(pagina).not.toContain("border-l-motivo-");
    expect(pagina).not.toContain("bg-motivo-");
  });

  test("stessa fonte, stessi risultati: il motivo vincente decide bordo, sfondo ed etichetta", () => {
    const { motivo } = motivoRigaProposta({ regola: "scaduto_non_incassato", segnalazioni: [] });
    expect(motivo).toBe("scaduto");
    expect(CLASSI_MOTIVO_RIGA[motivo!].bordo).toContain("border-l-motivo-scaduto");
    expect(CLASSI_MOTIVO_RIGA[motivo!].sfondo).toContain("bg-motivo-scaduto-bg");
    expect(etichettaRigaProposta({ regola: "scaduto_non_incassato" })).toEqual({ tono: "arancione", testo: "Cliente con scaduto" });
    // Priorità identica alla massiva: bloccato/legale > scaduto > da autorizzare > ordini.
    expect(motivoRigaProposta({ regola: "cliente_bloccato", segnalazioni: ["scaduto_non_incassato"] }).motivo).toBe("bloccato");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["scaduto_non_incassato", "oltre_normale"] }).motivo).toBe("scaduto");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["oltre_normale", "ordini_oltre_fido"] }).motivo).toBe("da_autorizzare");
    expect(motivoRigaProposta({ regola: "calcolo", segnalazioni: ["uso_pieno"] }).motivo).toBeNull();
    // Legenda: gli stessi quattro motivi, nello stesso ordine della massiva.
    expect(LEGENDA_MOTIVI.map((l) => l.motivo)).toEqual(["bloccato", "scaduto", "da_autorizzare", "ordini_oltre_fido"]);
  });
});
