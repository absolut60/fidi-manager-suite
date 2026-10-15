/**
 * Fonte unica: correzione automatica degli errori di battitura nelle email
 * dell'import anagrafica (decisione di Andrea, 15/10/2026).
 * Funzioni pure, nessun accesso al database. Usate da `calcolaEmailPecImport`
 * (src/lib/import-email-pec.ts).
 *
 * Principio: si corregge SOLO quando la correzione è univoca e il risultato è
 * un'email valida (isEmailValida). Mai indovinare su domini aziendali: le regole
 * sui domini valgono solo per il DIZIONARIO e la MAPPA ERRORI qui sotto.
 * Ogni correzione viene restituita al chiamante, che la traccia (prima → dopo).
 */
import { isEmailValida } from "@/lib/email-validazione";

/** Domini noti (sempre in minuscolo). */
export const DOMINI_NOTI: readonly string[] = [
  "gmail.com", "libero.it", "hotmail.it", "hotmail.com", "yahoo.it", "yahoo.com",
  "tiscali.it", "alice.it", "virgilio.it", "live.it", "live.com", "outlook.it",
  "outlook.com", "icloud.com", "fastwebnet.it", "tin.it", "email.it", "pec.it",
  "legalmail.it", "arubapec.it", "pecimprese.it", "pec.buffetti.it",
  "cert.legalmail.it", "postacert.it",
];

/** Errori di battitura noti → dominio corretto (corrispondenza esatta). */
export const MAPPA_ERRORI_DOMINIO: Readonly<Record<string, string>> = {
  "gamil.com": "gmail.com", "gmial.com": "gmail.com", "gmai.com": "gmail.com",
  "gmil.com": "gmail.com", "gmal.com": "gmail.com", "gmaill.com": "gmail.com",
  "gmaiil.com": "gmail.com", "gnail.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gmail.ccom": "gmail.com", "gmail.cpom": "gmail.com",
  "gmail.coim": "gmail.com", "gmailc.om": "gmail.com", "gmailcom": "gmail.com",
  "yahooo.it": "yahoo.it", "yaho.it": "yahoo.it", "yahoo.i": "yahoo.it", "yahoo.iy": "yahoo.it",
  "hotmai.it": "hotmail.it", "hotmaill.it": "hotmail.it", "hotmial.it": "hotmail.it",
  "hotmailcom": "hotmail.com",
  "liber.it": "libero.it", "libero.oit": "libero.it", "liberoit": "libero.it",
  "live-com": "live.com",
  "pecit": "pec.it",
  "legalmailit": "legalmail.it",
  "alice.i": "alice.it",
};

/** Dal più lungo al più corto: "cert.legalmail.it" prima di "legalmail.it". */
const DOMINI_PER_LUNGHEZZA = [...DOMINI_NOTI].sort((a, b) => b.length - a.length);

/**
 * Da applicare all'INTERO campo PRIMA dello split (splitEmailsMultiple spezza
 * su spazi e virgole).
 */
export function normalizzaCampoEmail(raw: string): string {
  let v = String(raw ?? "");
  // Spazi attorno alla @.
  v = v.replace(/\s*@\s*/g, "@");
  // Spazi attorno al punto tra due caratteri di parola ("gmail .com", "x. it").
  v = v.replace(/(\w)(?:\s+\.\s*|\s*\.\s+)(?=\w)/g, "$1.");
  // Virgola al posto del punto nel dominio ("@gmail,com"): solo se il dominio
  // non ha ancora punti e dopo la virgola c'è un suffisso senza @ (altrimenti
  // è il separatore tra due indirizzi). Serve qui perché lo split spezza sulle virgole.
  v = v.replace(/(@[^\s@,;.]+),(?=[a-z]{2,6}(?![^\s,;]*@))/gi, "$1.");
  // ":" o "/" usati come separatore tra due indirizzi (una @ prima e una dopo).
  v = v.replace(/(@[^\s@:/;,]+)\s*[:/]\s*(?=[^\s@:/;,]+@)/g, "$1;");
  return v;
}

export interface EsitoCorrezioneIndirizzo {
  valore: string;
  correzioni: string[];
}

/**
 * Applicata a OGNI pezzo dopo lo split, anche a quelli già validi.
 * Se dopo le correzioni il pezzo non è valido restituisce il pezzo originale
 * e nessuna correzione.
 */
export function correggiIndirizzo(piece: string): EsitoCorrezioneIndirizzo {
  const originale = piece;
  const correzioni: string[] = [];
  let v = String(piece ?? "").trim();

  const bordi = v.replace(/^[<>[\]()"',;:]+/, "").replace(/[<>[\]()"',;:.]+$/, "");
  if (bordi !== v) { correzioni.push("caratteri_bordo"); v = bordi; }

  if (/@@+/.test(v)) { correzioni.push("doppia_chiocciola"); v = v.replace(/@@+/g, "@"); }

  if (!v.includes("@") && v.includes("ò")) {
    correzioni.push("ò_chiocciola");
    v = v.replace(/ò/g, "@");
  }

  let at = v.indexOf("@");
  if (at >= 0) {
    const dominio = v.slice(at + 1);
    if (dominio.includes(",")) {
      correzioni.push("virgola_punto");
      v = v.slice(0, at + 1) + dominio.replace(/,/g, ".");
    }
  } else {
    const basso = v.toLowerCase();
    const noto = DOMINI_PER_LUNGHEZZA.find(
      (d) => basso.endsWith(d) && v.length - d.length >= 2,
    );
    if (noto) {
      correzioni.push("chiocciola_inserita");
      v = v.slice(0, v.length - noto.length) + "@" + noto;
    }
  }

  at = v.indexOf("@");
  if (at >= 0) {
    const locale = v.slice(0, at);
    const dominio = v.slice(at + 1).toLowerCase();
    const corretto = MAPPA_ERRORI_DOMINIO[dominio];
    if (corretto) {
      correzioni.push(`dominio_${dominio}→${corretto}`);
      v = `${locale}@${corretto}`;
    } else if (DOMINI_NOTI.includes(dominio)) {
      // Solo minuscolo: non è una correzione da tracciare.
      v = `${locale}@${dominio}`;
    }
  }

  if (!isEmailValida(v)) return { valore: originale, correzioni: [] };
  return { valore: v, correzioni };
}

/** Pezzo "con aspetto di email" (contiene @ o ò). */
export function sembraEmail(piece: string): boolean {
  return piece.includes("@") || piece.includes("ò");
}
