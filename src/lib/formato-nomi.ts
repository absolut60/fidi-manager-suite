/**
 * Helper condivisi per la normalizzazione automatica dei nomi digitati a mano.
 * Vanno applicati onBlur (non a ogni tasto), così l'utente può sempre correggere.
 */

/** Particelle che restano minuscole quando NON sono la prima parola (convenzione italiana). */
const PARTICELLE = new Set([
  "de", "di", "da", "del", "dello", "della", "dei", "degli", "delle",
  "dal", "dalla", "van", "von", "der", "ten", "ter", "le", "la", "lo",
]);

/** Capitalizza una parola gestendo apostrofi e trattini: d'amico → D'Amico, anna-maria → Anna-Maria. */
function capitalizzaParola(parola: string): string {
  return parola
    .split("-")
    .map((pezzo) =>
      pezzo
        .split("'")
        .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p))
        .join("'"),
    )
    .join("-");
}

/**
 * Formatta un nome proprio: iniziali maiuscole, resto minuscolo.
 * Le particelle nobiliari/preposizioni restano minuscole se non in prima posizione.
 */
export function formattaNomeProprio(v: string): string {
  const pulito = v.trim().replace(/\s+/g, " ");
  if (!pulito) return "";
  return pulito
    .split(" ")
    .map((parola, i) => {
      const basso = parola.toLowerCase();
      if (i > 0 && PARTICELLE.has(basso)) return basso;
      return capitalizzaParola(parola);
    })
    .join(" ");
}

/** Formatta una ragione sociale: tutto maiuscolo, spazi normalizzati. */
export function formattaRagioneSociale(v: string): string {
  return v.trim().replace(/\s+/g, " ").toUpperCase();
}
