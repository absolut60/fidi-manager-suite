import * as XLSX from "xlsx";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/** Colonne del foglio "Partecipanti" (ordine vincolante, letto dal parser di import). */
export const INTESTAZIONI_PARTECIPANTI = [
  "Nome",
  "Cognome",
  "Ragione sociale",
  "Partita IVA",
  "Codice fiscale",
  "Email",
  "Telefono",
  "Cellulare",
  "Note",
] as const;

/** Larghezze colonna (in caratteri) allineate al contenuto atteso. */
const LARGHEZZE = [18, 20, 30, 16, 20, 32, 16, 16, 40];

/** Indici (0-based) delle colonne che devono restare TESTO (zeri iniziali, numeri lunghi). */
const COLONNE_TESTO = [3, 4, 6, 7];

/** Righe vuote pre-formattate come testo, così Excel non mangia lo zero iniziale. */
const RIGHE_PREFORMATTATE = 300;

const REGOLE = [
  "Una riga = un partecipante.",
  "Per ogni riga serve almeno uno fra: Email, oppure Nome + Cognome, oppure Ragione sociale.",
  "Non cancellare né rinominare la riga di intestazione del foglio Partecipanti.",
  "Partita IVA e Codice fiscale: scrivili così come sono, anche con lo zero iniziale.",
  "Dopo l'importazione le righe non vengono create subito: le trovi in \u201cRighe importate da riconciliare\u201d, dove decidi tu se collegarle a un cliente/lead esistente o creare un nuovo lead.",
];

function foglioPartecipanti(): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([[...INTESTAZIONI_PARTECIPANTI]]);
  ws["!cols"] = LARGHEZZE.map((wch) => ({ wch }));
  ws["!freeze"] = "A2";

  for (const c of COLONNE_TESTO) {
    for (let r = 1; r <= RIGHE_PREFORMATTATE; r++) {
      ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: "", z: "@" };
    }
  }
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: RIGHE_PREFORMATTATE, c: INTESTAZIONI_PARTECIPANTI.length - 1 },
  });
  return ws;
}

function foglioIstruzioni(): XLSX.WorkSheet {
  const righe: (string | number)[][] = [
    ["Istruzioni per la compilazione"],
    [],
    ["Regole"],
    ...REGOLE.map((r) => [r]),
    [],
    ["Esempi (sono DUE partecipanti diversi, non un unico record su due righe)"],
    ["", ...INTESTAZIONI_PARTECIPANTI],
    [
      "Esempio 1 — persona fisica",
      "Mario",
      "Rossi",
      "",
      "",
      "",
      "mario.rossi@example.com",
      "",
      "3331234567",
      "",
    ],
    [
      "Esempio 2 — azienda",
      "",
      "",
      "Rossi Srl",
      "01234567890",
      "",
      "info@rossisrl.it",
      "0301234567",
      "",
      "",
    ],
    [],
    ["Questo foglio è solo informativo: compila esclusivamente il foglio “Partecipanti”."],
  ];
  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws["!cols"] = [{ wch: 30 }, ...LARGHEZGE_ISTRUZIONI()];
  return ws;
}

function LARGHEZGE_ISTRUZIONI() {
  return LARGHEZZE.map((wch) => ({ wch }));
}

/** Righe (1-based) le cui celle vanno in grassetto, per foglio. */
const GRASSETTO: Record<string, number[]> = {
  Partecipanti: [1],
  Istruzioni: [1, 3, 8, 9, 10],
};

/**
 * `xlsx` (build community) non scrive né grassetto né blocco riquadri:
 * l'XML generato viene ritoccato a valle sullo zip OOXML.
 */
function applicaStiliEBlocco(buf: ArrayBuffer): Uint8Array {
  const zip = unzipSync(new Uint8Array(buf));

  // 1) styles.xml: aggiunge un font grassetto e il relativo cellXf
  const stylesPath = "xl/styles.xml";
  let styles = strFromU8(zip[stylesPath]);
  const nFonts = Number(/<fonts count="(\d+)"/.exec(styles)?.[1] ?? "1");
  const nXfs = Number(/<cellXfs count="(\d+)"/.exec(styles)?.[1] ?? "1");
  styles = styles
    .replace(`<fonts count="${nFonts}"`, `<fonts count="${nFonts + 1}"`)
    .replace(
      "</fonts>",
      `<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>`,
    )
    .replace(`<cellXfs count="${nXfs}"`, `<cellXfs count="${nXfs + 1}"`)
    .replace(
      "</cellXfs>",
      `<xf numFmtId="0" fontId="${nFonts}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`,
    );
  zip[stylesPath] = strToU8(styles);
  const xfGrassetto = nXfs;

  // 2) fogli: blocco riquadri + grassetto sulle righe indicate
  const wbXml = strFromU8(zip["xl/workbook.xml"]);
  const nomi = [...wbXml.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);

  nomi.forEach((nome, i) => {
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    if (!zip[path]) return;
    let xml = strFromU8(zip[path]);

    if (nome === "Partecipanti") {
      xml = xml.replace(
        /<sheetView([^>]*)\/>/,
        `<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`,
      );
    }

    for (const riga of GRASSETTO[nome] ?? []) {
      xml = xml.replace(new RegExp(`<row r="${riga}"[^>]*>.*?</row>`), (rowXml) =>
        rowXml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/?)>/g, (_m, ref, attrs: string, self) =>
          attrs.includes(" s=")
            ? `<c r="${ref}"${attrs}${self}>`
            : `<c r="${ref}" s="${xfGrassetto}"${attrs}${self}>`,
        ),
      );
    }
    zip[path] = strToU8(xml);
  });

  return zipSync(zip);
}

/** Costruisce il modello XLSX (due fogli) e ne restituisce i byte. */
export function creaModelloPartecipanti(): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglioPartecipanti(), "Partecipanti");
  XLSX.utils.book_append_sheet(wb, foglioIstruzioni(), "Istruzioni");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return applicaStiliEBlocco(buf);
}

function slug(nome: string) {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "evento"
  );
}

/** Genera e scarica il modello. */
export function scaricaModelloPartecipanti(nomeEvento?: string) {
  const bytes = creaModelloPartecipanti();
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `modello-partecipanti-${slug(nomeEvento ?? "evento")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
