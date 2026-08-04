/**
 * Testi ufficiali MADE dell'informativa privacy e dei tre consensi granulari.
 * Fonte unica riutilizzata dal wizard nuovo contatto e dalla pagina pubblica
 * di raccolta consensi marketing (§5 - non duplicare i testi).
 *
 * Quando si modifica INFORMATIVA_FULL o CONSENSO_TESTI, incrementare
 * INFORMATIVA_VERSIONE. L'hash viene calcolato a runtime sul testo effettivo
 * mostrato all'utente.
 */

/** Versione corrente dell'informativa privacy mostrata agli interessati. */
export const INFORMATIVA_VERSIONE = "2026-08-v1";

/** SHA-256 (hex) del testo passato. Funziona sia lato browser sia lato server. */
export async function calcolaInformativaHash(testo: string): Promise<string> {
  const bytes = new TextEncoder().encode(testo);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


export const INFORMATIVA_FULL = `Made Distribuzione S.p.A. - C.F. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email gdpr-md@madepoint.it - pec madedistribuzionesrl@pecplus.it) in persona del suo presidente Dott. Gian Luca Bellini, ai sensi dell'articolo 13 del GDPR 2016/679, Le fornisce le seguenti informazioni.

TIPI DI DATI: I dati personali (nome, cognome, estremi documento di riconoscimento, telefono, indirizzo e-mail, etc.) sono quelli forniti al momento della sottoscrizione o nel corso del rapporto contrattuale. Tra i dati conferiti possono figurare anche dati di cui all'art. 9 GDPR (categorie particolari di dati).

FINALITA' DI TRATTAMENTO: I dati saranno trattati per finalita' connesse all'esercizio delle attivita' aziendali (fornitura di prodotti nei campi edile, elettrotecnico e idraulico), per adempimenti fiscali/tributari/contributivi, per comunicazione a Enti pubblici o privati prevista per legge, per backup su server esterni con cifratura. Inoltre, previo consenso, per profilazione e analisi dati, per inserimento in pubblicazioni e social network, per invio di comunicazioni pubblicitarie via e-mail, sms, whatsapp.

CATEGORIE DI SOGGETTI: I dati potranno essere comunicati a dipendenti e collaboratori, societa' EDP, commercialisti, studi legali, clienti e fornitori, distributori e vettori, societa' del Gruppo Made, societa' che svolgono attivita' commerciale e di marketing.

MODALITA': Il trattamento sara' effettuato con strumenti manuali e/o informatici nel rispetto dei principi di correttezza, licceita' e trasparenza. E' possibile la cessione dei dati all'estero per finalita' di backup e utilizzo di software con server esteri (Microsoft 365).

TERMINE DI CONSERVAZIONE: I dati vengono conservati per tutta la durata del rapporto contrattuale e nei termini prescrizionali previsti, in ogni caso per non meno di 10 anni per obblighi fiscali.

DIRITTI DELL'INTERESSATO: Lei potra' esercitare i diritti di accesso (art. 15), rettifica (art. 16), cancellazione (art. 17), limitazione (art. 18), opposizione (art. 21), portabilita' (art. 20) e revoca del consenso (art. 7 co. 3) inviando richiesta a gdpr-md@madepoint.it. E' possibile proporre reclamo al Garante Privacy.

TITOLARE: Made Distribuzione S.p.A. - C.F. 10126430965 - gdpr-md@madepoint.it`;

export const CONSENSO_TESTI = {
  profilazione:
    "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di analisi anche con strumenti tecnologici automatizzati (profilazione) al fine di consentire al titolare di poter gestire un consolidato nazionale in tempo reale e al fine di poter analizzare i dati caricati sul software per poter indirizzare al meglio le strategie commerciali del network.",
  media:
    "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di inserimento di dati, fotografie, articoli e riprese audiovisive nel proprio sito internet e nelle proprie pubblicazioni, social network, per la pubblicazione di fotografie e/o riprese audiovisive, corsi on line, pubblicazioni, brochure, presentazioni, cataloghi per fini didattici, pubblicitari e di marketing.",
  diretto:
    "al trattamento, ivi compresa la comunicazione ai soggetti di cui al punto 9 e la cessione al di fuori dell'Unione Europea, dei dati personali, ivi compresi quelli sensibili di cui all'art. 9 GDPR e le immagini dell'interessato per le finalita' di invio di informative per finalita' pubblicitarie e di marketing, anche via e-mail, sms, whatsapp.",
} as const;

export type TipoConsenso = "marketing_diretto" | "marketing_media" | "profilazione";

export const CONSENSO_LABEL: Record<TipoConsenso, string> = {
  profilazione: "Profilazione e analisi dati",
  marketing_media: "Pubblicazione su media e social",
  marketing_diretto: "Marketing diretto (email, sms, whatsapp)",
};
