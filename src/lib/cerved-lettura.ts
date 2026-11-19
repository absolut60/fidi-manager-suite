import { eventiAziendaAssenti, formattaEuroCompatto, formattaPercentualeCerved, variazionePercentuale, gradingCervedPresentazione } from "./cerved-presentazione";
import { formatEuro } from "./fidi";

/** Soglie della lettura informativa: non modificano fidi, semafori o decisioni. */
export const SOGLIE_LETTURA_CERVED = {
  crescitaFatturato: 10, caloFatturato: -10, caloPatrimonio: -20,
  crescitaDebitiBanche: 50, liquiditaPassivo: 0.25, currentRatio: 100,
  caloCurrentRatio: -30, richiesteImprese: 5, mesiRichieste: 2,
  addettiMin: 1, addettiMax: 2, fatturatoStrutturaLeggera: 1_000_000,
  moltiplicatoreFido: 2, score: 40, ambraSintesi: 2,
} as const;
type Dato = Record<string, any>;
export type SegnaleLettura = { id: string; testo: string; tono: "verde" | "ambra" | "rosso" };
const numero = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const euro = (v: number) => formattaEuroCompatto(v);
const percento = (v: number) => `${v > 0 ? "+" : ""}${formattaPercentualeCerved(v)}`;

export function letturaReportCerved(lr: Dato, fidoMade?: number | null, esposizione?: number | null) {
  const soglie = SOGLIE_LETTURA_CERVED;
  const forza: SegnaleLettura[] = [], attenzione: SegnaleLettura[] = [];
  const aggiungi = (lista: SegnaleLettura[], id: string, testo: string, tono: SegnaleLettura["tono"]) => lista.push({ id, testo, tono });
  const anni: Dato[] = (Array.isArray(lr.bilanci) ? lr.bilanci : []).filter((a: Dato) => a.data_chiusura).slice().sort((a: Dato,b: Dato) => b.data_chiusura.localeCompare(a.data_chiusura));
  const a = anni[0] ?? {}, p = anni[1] ?? {};
  const att = (k: string) => numero(a[k]), prec = (k: string) => numero(p[k]);
  const delta = (k: string) => variazionePercentuale(att(k), prec(k));
  const anno = String(a.data_chiusura ?? "").slice(0,4);
  const ricavi = att("ricavi"), crescita = delta("ricavi");
  if (ricavi != null && crescita != null) {
    const serie = anni.slice().reverse().filter(b => numero(b.ricavi) != null).map(b => `${String(b.data_chiusura).slice(0,4)}: ${euro(b.ricavi)}`).join(" → ");
    if (crescita > soglie.crescitaFatturato) aggiungi(forza,"fatturato",`Fatturato in crescita: ${serie} (${percento(crescita)} nell'ultimo anno).`,"verde");
    if (crescita < soglie.caloFatturato) aggiungi(attenzione,"fatturato",`Fatturato ${anno}: ${euro(ricavi)}, ${percento(crescita)} rispetto all'anno prima.`,"ambra");
  }
  const utile = att("utile");
  if (utile != null && utile > 0) aggiungi(forza,"utile",`Utile ${anno} di ${euro(utile)}${delta("utile") != null ? ` (${percento(delta("utile") ?? 0)} sull'anno prima)` : ""}${att("roe") != null ? `; ROE ${formattaPercentualeCerved(att("roe"))}` : ""}.`,"verde");
  if (utile != null && utile < 0) aggiungi(attenzione,"perdita",`Perdita ${anno} di ${euro(Math.abs(utile))}.`,"rosso");
  const patrimonio = att("patrimonio_netto"), crescitaPatrimonio = delta("patrimonio_netto");
  if (patrimonio != null && patrimonio > 0 && crescitaPatrimonio != null && crescitaPatrimonio > 0) aggiungi(forza,"patrimonio",`Patrimonio netto ${euro(patrimonio)}, in crescita del ${formattaPercentualeCerved(crescitaPatrimonio)}.`,"verde");
  if (patrimonio != null && patrimonio < 0) aggiungi(attenzione,"patrimonio",`Patrimonio netto negativo: ${euro(patrimonio)}.`,"rosso");
  else if (patrimonio != null && crescitaPatrimonio != null && crescitaPatrimonio < soglie.caloPatrimonio) aggiungi(attenzione,"patrimonio",`Patrimonio netto ${euro(patrimonio)}, in calo del ${formattaPercentualeCerved(Math.abs(crescitaPatrimonio))}.`,"ambra");
  if (eventiAziendaAssenti(lr)) aggiungi(forza,"eventi", "Eventi negativi assenti secondo la valutazione Cerved.","verde");
  const cebi = lr.gradings?.cebi?.codice;
  if (["S1","S2","S3","S4"].includes(cebi)) aggiungi(forza,"cebi",`Classe di bilancio CEBI ${cebi}.`,"verde");
  if (["V2","R1","R2","R3","R4"].includes(cebi)) aggiungi(attenzione,"cebi",`Classe di bilancio CEBI ${cebi}: da tenere d'occhio.`,"rosso");
  const banca = att("debiti_banche_breve") != null && prec("debiti_banche_breve") != null ? "debiti_banche_breve" : "debiti_banche";
  const crescitaBanche = delta(banca);
  if (crescitaBanche != null && crescitaBanche > soglie.crescitaDebitiBanche) aggiungi(attenzione,"banche",`Debiti verso banche${banca === "debiti_banche_breve" ? " a breve" : " totali"}: da ${euro(prec(banca) ?? 0)} a ${euro(att(banca) ?? 0)} (${percento(crescitaBanche)}).`,"ambra");
  const liquidita = att("liquidita"), passivo = att("passivo_breve");
  if (liquidita != null && passivo != null && passivo > 0 && liquidita / passivo < soglie.liquiditaPassivo) aggiungi(attenzione,"liquidita",`Liquidità ${euro(liquidita)} rispetto a ${euro(passivo)} di debiti a breve: copre il ${formattaPercentualeCerved(liquidita/passivo*100)}.`,"ambra");
  const ratio = att("current_ratio"), caloRatio = delta("current_ratio");
  if (ratio != null && (ratio < soglie.currentRatio || (caloRatio != null && caloRatio < soglie.caloCurrentRatio))) aggiungi(attenzione,"current_ratio",`Indice di liquidità (current ratio): ${ratio.toLocaleString("it-IT",{maximumFractionDigits:1})}${caloRatio != null ? ` (${percento(caloRatio)} sull'anno prima)` : ""}.`,"ambra");
  const consultazioni = gradingCervedPresentazione(lr,[],"CNSL"), totale = numero(lr.richieste_12_mesi?.totale);
  if (consultazioni.esito === "rosso" || consultazioni.esito === "ambra") aggiungi(attenzione,"consultazioni",`Consultazioni: ${consultazioni.descrizione?.toLowerCase()}${totale != null ? `, ${totale.toLocaleString("it-IT")} richieste nel periodo` : ""}.`,consultazioni.esito);
  const mesi: Dato[] = (lr.richieste_12_mesi?.per_mese ?? []).slice().sort((a: Dato,b: Dato) => `${a.anno}-${String(a.mese).padStart(2,"0")}`.localeCompare(`${b.anno}-${String(b.mese).padStart(2,"0")}`)).slice(-soglie.mesiRichieste);
  if (mesi.length === soglie.mesiRichieste && mesi.every(m => numero(m.aziende) != null)) {
    const imprese = mesi.reduce((s,m) => s+m.aziende,0);
    if (imprese >= soglie.richiesteImprese) aggiungi(attenzione,"fornitori",`${imprese.toLocaleString("it-IT")} richieste da imprese negli ultimi ${soglie.mesiRichieste} mesi: probabilmente altri fornitori stanno valutando di dargli credito.`,"ambra");
  }
  const addetti = numero(lr.anagrafica?.dipendenti);
  if (addetti != null && addetti >= soglie.addettiMin && addetti <= soglie.addettiMax && ricavi != null && ricavi > soglie.fatturatoStrutturaLeggera) aggiungi(attenzione,"struttura",`Struttura leggera: ${addetti} ${addetti === 1 ? "addetto" : "addetti"} con ${euro(ricavi)} di fatturato.`,"ambra");
  const certificato = numero(lr.fido_certificato?.valore), made = numero(fidoMade), debito = numero(esposizione);
  if (certificato != null && made != null && made > soglie.moltiplicatoreFido*certificato) aggiungi(attenzione,"fido",`Fido MADE ${formatEuro(made)}: oltre ${soglie.moltiplicatoreFido} volte il fido certificato Cerved di ${formatEuro(certificato)}.`,"rosso");
  if (certificato != null && debito != null && debito > certificato) aggiungi(attenzione,"esposizione",`Esposizione attuale ${formatEuro(debito)}, superiore al fido certificato Cerved di ${formatEuro(certificato)}.`,"rosso");
  const score = numero(lr.score_cgs?.valore);
  if (score != null && score < soglie.score) aggiungi(attenzione,"score",`Affidabilità Cerved: ${score}/100, sotto ${soglie.score}/100.`,"ambra");
  const tono = attenzione.some(s => s.tono === "rosso") || attenzione.filter(s => s.tono === "ambra").length >= soglie.ambraSintesi ? "ambra" : attenzione.length ? "neutro" : "verde";
  const principali = attenzione.filter(s => s.tono === "rosso").concat(attenzione.filter(s => s.tono !== "rosso"));
  const sintesi = principali.length ? principali.slice(0,2).map(s => s.testo).join(" ") : forza.length ? forza.slice(0,2).map(s => s.testo).join(" ") : "Dati insufficienti per una lettura del report.";
  const confronto = certificato != null && made != null ? `Il fido MADE è ${made > certificato ? "superiore" : made < certificato ? "inferiore" : "uguale"} al fido certificato Cerved${debito != null ? `; l'esposizione attuale è ${debito > certificato ? "oltre" : "entro"} il fido certificato` : ""}.` : null;
  return { forza, attenzione, tono, sintesi, confronto, certificato, made, esposizione: debito };
}