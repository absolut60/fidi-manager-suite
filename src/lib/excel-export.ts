import * as XLSX from "xlsx";

import type { PreventivoConDettagli } from "./preventivi-api";

import {
  aggregaMateriali,
  arricchisciMateriali,
  arrotondaPerFornitore,
  fetchArticoliPerOrdine,
} from "./output-api";

function fileName(prev: PreventivoConDettagli, tipo: string) {
  const num = (prev.numero ?? "senza-numero").replace(/[^A-Za-z0-9_-]+/g, "_");
  const cli = (prev.cliente?.ragione_sociale ?? "cliente")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .slice(0, 30);
  return `${tipo}_${num}_${cli}.xlsx`;
}

export async function exportListaMaterialiXlsx(prev: PreventivoConDettagli) {
  const base = aggregaMateriali(prev.blocchi);
  const info = await fetchArticoliPerOrdine(base.map((m) => m.articolo_id));
  const mats = arricchisciMateriali(base, info);

  const rows = mats.map((m) => ({
    "Cod. Gamma": m.cod_gamma ?? "",
    Descrizione: m.descrizione,
    UM: m.um ?? "",
    Quantità: Number(m.qta_teorica.toFixed(2)),
    "Peso (kg)": Number(m.peso_totale.toFixed(1)),
    Fornitore: m.fornitore_nome ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 60 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Materiali");

  XLSX.writeFile(wb, fileName(prev, "lista-materiali"));
}

export async function exportListaFornitoreXlsx(prev: PreventivoConDettagli) {
  const base = aggregaMateriali(prev.blocchi);
  const info = await fetchArticoliPerOrdine(base.map((m) => m.articolo_id));
  const mats = arricchisciMateriali(base, info);
  const gruppi = arrotondaPerFornitore(mats);

  const wb = XLSX.utils.book_new();

  // Foglio riassuntivo
  const flat: Record<string, string | number>[] = [];

  for (const g of gruppi) {
    for (const r of g.righe) {
      flat.push({
        Fornitore: g.fornitore_nome,
        "Cod. Gamma": r.cod_gamma ?? "",
        Descrizione: r.descrizione,
        UM: r.um ?? "",
        "Q.tà teorica": Number(r.qta_teorica.toFixed(2)),
        "Conf. (UM)": r.qta_confezione > 0 ? Number(r.qta_confezione.toFixed(2)) : "",
        "N° conf.": r.n_confezioni,
        "Q.tà ordine": Number(r.qta_ordine.toFixed(2)),
      });
    }
  }

  const wsAll = XLSX.utils.json_to_sheet(flat);
  wsAll["!cols"] = [
    { wch: 28 }, { wch: 14 }, { wch: 60 }, { wch: 6 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, "Tutti");

  // Un foglio per fornitore
  for (const g of gruppi) {
    const rows = g.righe.map((r) => ({
      "Cod. Gamma": r.cod_gamma ?? "",
      Descrizione: r.descrizione,
      UM: r.um ?? "",
      "Q.tà teorica": Number(r.qta_teorica.toFixed(2)),
      "Conf. (UM)": r.qta_confezione > 0 ? Number(r.qta_confezione.toFixed(2)) : "",
      "N° conf.": r.n_confezioni,
      "Q.tà ordine": Number(r.qta_ordine.toFixed(2)),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 60 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];

    const sheetName = g.fornitore_nome.replace(/[\\/?*[\]:]/g, "").slice(0, 30) || "Senza fornitore";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(wb, fileName(prev, "ordine-fornitore"));
}
