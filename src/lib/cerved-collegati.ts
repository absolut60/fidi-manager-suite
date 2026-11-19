import type { EsponenteCerved, RuoloCerved, SocietaCollegataCerved } from "./cerved/cerved.server";
import { dataIsoIt } from "./cerved-presentazione";

export const nomeEsponenteCerved = (e: EsponenteCerved) => [e.cognome, e.nome].filter(Boolean).join(" ");
export function testoRuoloCerved(r: RuoloCerved, societa?: SocietaCollegataCerved) {
  const date = [r.dal ? `dal ${dataIsoIt(r.dal) ?? r.dal}` : null, r.al ? `al ${dataIsoIt(r.al) ?? r.al}` : null].filter(Boolean).join(" ");
  const stato = r.al ? `ruolo cessato il ${dataIsoIt(r.al) ?? r.al}` : societa?.stato_codice === "T" ? "fino alla cancellazione" : r.legame_attivo === false ? "ruolo cessato" : societa?.stato_codice === "A" || (!societa && r.legame_attivo === true) ? "in corso" : "stato del legame non indicato";
  return { testo: [r.tipo ?? r.codice ?? "Ruolo non indicato", date].filter(Boolean).join(" "), stato, inCorso: stato === "in corso" };
}
export function statoSocietaCerved(s: SocietaCollegataCerved) {
  if (s.stato_codice === "A") return { testo: "Attiva", tono: "verde" as const };
  if (s.stato_codice === "T") return { testo: s.stato_dal ? `Cancellata il ${dataIsoIt(s.stato_dal) ?? s.stato_dal}` : "Cancellata", tono: "neutro" as const };
  return { testo: s.stato_descrizione ?? s.stato_codice ?? "Stato non indicato", tono: /liquidaz|fallim|procedur/i.test(s.stato_descrizione ?? "") ? "rosso" as const : "neutro" as const };
}
export function stessoSettoreCerved(cliente: string | null | undefined, societa: string | null | undefined) {
  const a = (cliente ?? "").replace(/\D/g,""), b = (societa ?? "").replace(/\D/g,"");
  return a.length >= 4 && b.length >= 4 && a.slice(0,4) === b.slice(0,4);
}
export function ordinaSocietaCerved(societa: SocietaCollegataCerved[]) {
  const priorita = (s: SocietaCollegataCerved) => s.stato_codice === "A" ? s.ruoli.some(r => testoRuoloCerved(r,s).inCorso) ? 0 : 1 : s.stato_codice === "T" ? 3 : 2;
  return societa.slice().sort((a,b) => priorita(a)-priorita(b) || (a.stato_codice === "T" && b.stato_codice === "T" ? (b.stato_dal ?? "").localeCompare(a.stato_dal ?? "") : 0) || (a.nome ?? "").localeCompare(b.nome ?? "","it"));
}
export function nomiEventiRelazionatiCerved(persone: Record<string, unknown>[], societa: SocietaCollegataCerved[]) {
  const chiavi = ["protesti","pregiudizievoli","procedure","eventi_crisi","cigs","fallimenti_propri"];
  return [...new Set([...persone.filter(p => chiavi.some(k => p[k] === true)).map(p => typeof p.nome === "string" ? p.nome : "Soggetto senza nome"), ...societa.filter(s => s.eventi_negativi === true).map(s => s.nome ?? "Società senza nome")])];
}
export function sintesiCollegatiCerved(esponenti: EsponenteCerved[], societa: SocietaCollegataCerved[], persone: Record<string, unknown>[]) {
  const attive = societa.filter(s => s.stato_codice === "A"), cancellate = societa.filter(s => s.stato_codice === "T");
  const nome = esponenti.length === 1 ? nomeEsponenteCerved(esponenti[0]) : "Gli esponenti";
  const dettaglio = attive.length === 1 && !attive[0].ruoli.some(r => testoRuoloCerved(r,attive[0]).inCorso) ? (() => { const data = attive[0].ruoli.map(r=>r.al).filter((d): d is string => !!d).sort().at(-1); return data ? ` (ruolo cessato nel ${data.slice(0,4)})` : " (ruolo cessato)"; })() : "";
  const altri = societa.length-attive.length-cancellate.length;
  const conteggi = [attive.length ? `${attive.length} ${attive.length === 1 ? "attiva" : "attive"}${dettaglio}` : null, cancellate.length ? `${cancellate.length} ${cancellate.length === 1 ? "cancellata" : "cancellate"}` : null, altri ? `${altri} con altro stato` : null].filter(Boolean).join(", ");
  const eventi = nomiEventiRelazionatiCerved(persone,societa);
  return `${nome} ${esponenti.length === 1 ? "ha" : "hanno"} avuto ruoli in ${societa.length} ${societa.length === 1 ? "altra società" : "altre società"}${conteggi ? `: ${conteggi}` : ""}. ${eventi.length ? `Eventi negativi segnalati: ${eventi.join("; ")}.` : "Nessun evento negativo segnalato."}`;
}