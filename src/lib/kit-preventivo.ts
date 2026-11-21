import type { KitConComponenti, KitFamiglia } from './kit-api';
import { calcolaKitRegole } from './kit-regole';
import { campiRigaGammaPreventivo } from './riga-gamma-preventivo';
import { costoRiga, patchConFontePrezzo, pesoRigaGamma, quantitaDaIncidenza, type PrezzoClienteGamma, type PrezzoDedicatoCantiere } from './riga-preventivo';
import type { LineaPreventivo } from './linee-preventivo';
import type { RigaInsert } from './preventivi-api';

export interface RigaKitSaltata { ordine: number; descrizione: string; motivo: string }

export function gruppiKitPreventivo(kits: readonly KitConComponenti[], famiglie: readonly KitFamiglia[], linea: LineaPreventivo, famiglia = 'ALL') {
  const visibili = kits.filter(k => k.linea === linea && (famiglia === 'ALL' || k.famiglia_id === famiglia));
  const gruppi = famiglie.filter(f => f.linea === linea).map(f => ({ id: f.id, nome: f.nome, kits: visibili.filter(k => k.famiglia_id === f.id) })).filter(g => g.kits.length);
  const senza = visibili.filter(k => !famiglie.some(f => f.id === k.famiglia_id && f.linea === linea));
  if (senza.length) gruppi.push({ id: '__none__', nome: 'Senza famiglia', kits: senza });
  return gruppi;
}

/** Adatta il motore unico alle righe documento; nessuna formula kit o prezzo locale. */
export function preparaRigheKitPreventivo(args: {
  kit: KitConComponenti; quantitaBase: number; scontoPiede: number;
  prezzi: ReadonlyMap<string, PrezzoClienteGamma & { um?: string | null }>;
  dedicati: ReadonlyMap<string, PrezzoDedicatoCantiere>;
}) {
  const risultati = calcolaKitRegole({ componenti: args.kit.componenti });
  const righe: Omit<RigaInsert, 'blocco_id'>[] = [];
  const saltate: RigaKitSaltata[] = [];
  for (const c of args.kit.componenti) {
    const risultato = risultati.find(r => r.ordine === c.ordine);
    const descrizione = c.articolo?.descrizione ?? c.descrizione ?? c.articolo_codice ?? c.codice_articolo_fornitore ?? c.ruolo ?? 'Articolo da definire';
    const motivo = risultato?.errore ?? (risultato?.quantitaPerUnita == null ? 'Quantità non disponibile.' : c.articolo_codice && !c.articolo ? 'Articolo Gamma non disponibile nel catalogo.' : null);
    if (motivo || risultato?.quantitaPerUnita == null) { saltate.push({ ordine: c.ordine, descrizione, motivo: motivo ?? 'Quantità non disponibile.' }); continue; }
    const incidenza = risultato.quantitaPerUnita;
    const quantita = quantitaDaIncidenza(incidenza, args.quantitaBase > 0 ? args.quantitaBase : 1) ?? 0;
    const comuni = { incidenza, quantita, ordine: c.ordine, ruolo_kit: c.ruolo, segno: 1, aliquota_iva: null,
      peso: pesoRigaGamma(c.peso_unitario ?? c.articolo?.peso_netto, quantita) };
    if (c.articolo_codice && c.articolo) {
      righe.push({ ...comuni, tipo_riga: 'articolo_singolo',
        ...campiRigaGammaPreventivo({}, { codice: c.articolo_codice, descrizione: c.articolo.descrizione, um: c.articolo.um }, quantita, args.scontoPiede,
          args.prezzi.get(c.articolo_codice), args.dedicati.get(c.articolo_codice)) });
    } else {
      righe.push(patchConFontePrezzo({}, { ...comuni, tipo_riga: 'manuale', articolo_id: null, articolo_codice: null,
        codice_articolo_fornitore: c.codice_articolo_fornitore, descrizione: c.descrizione, um: c.um, um_scelta: 'um1',
        fornitore_id: c.fornitore_id, marca: c.marca, costo: c.costo == null ? null : costoRiga(c.costo, quantita),
        listino_fornitore: c.listino_fornitore, prezzo_unit: null, importo: 0 }));
    }
  }
  return { righe, saltate };
}