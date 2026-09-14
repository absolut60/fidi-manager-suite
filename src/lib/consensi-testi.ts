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
export const INFORMATIVA_VERSIONE = "2026-09-v2";

/** SHA-256 (hex) del testo passato. Funziona sia lato browser sia lato server. */
export async function calcolaInformativaHash(testo: string): Promise<string> {
  const bytes = new TextEncoder().encode(testo);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


export const INFORMATIVA_FULL = `Made Distribuzione S.p.A. - C.F. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email gdpr-md@madepoint.it - pec madedistribuzionesrl@pecplus.it) in persona del suo presidente Dott. Gian Luca Bellini (di seguito per brevita' anche il "Titolare"), ai sensi dell'articolo 13 del GDPR 2016/679, Le fornisce le seguenti informazioni:

TIPI DI DATI
1. Dati personali - I dati personali (nome, cognome, estremi documento di riconoscimento e copia dello stesso, telefono, indirizzo e-mail, etc.), sono quelli che saranno forniti al momento della sottoscrizione o comunque prima dell'avvio del rapporto contrattuale ovvero nel corso dello stesso.
2. Particolari categorie di dati (dati sensibili) - Tra i dati conferiti possono figurare anche i dati di cui all'art. 9 GDPR (categorie particolari di dati), ossia i dati personali che rivelino l'origine razziale o etnica, l'appartenenza sindacale, dati relativi alla salute della persona. I dati indicati all'art. 10 ossia i dati personali relativi alle condanne penali e ai reati o a connesse misure di sicurezza non sono di regola trattati. Nel caso cio' si rendesse necessario verra' chiesto il consenso dell'interessato.

TIPI E FINALITA' DI TRATTAMENTO
3. Trattamenti derivanti da obblighi contrattuali (trattamenti che prescindono da consenso) - I dati personali comuni e/o sensibili e/o giudiziari, richiesti e/o forniti anche verbalmente, preventivamente all'instaurazione del rapporto contrattuale, ovvero nel corso o dopo la cessazione dello stesso, saranno oggetto, anche senza il Vostro consenso ai sensi dell'art. 6, lettere b) e f) GDPR:
i. di trattamento relativo alle funzioni connesse all'esercizio delle proprie attivita' aziendali, istituzionali e statutarie (fornitura di prodotti, materiali, opere e servizi nei campi edile, elettrotecnico e idraulico);
ii. di trattamento relativo all'esame e all'archiviazione dell'anagrafica cliente e del curriculum vitae;
iii. di trattamento in qualsiasi modo connesso alla fase precontrattuale e agli adempimenti del rapporto contrattuale anche in relazione alle eventuali controversie, tra cui, a titolo esemplificativo e non esaustivo: produzione in ambito giudiziale, comunicazione in ambito stragiudiziale, registrazione fatture, elaborazione certificazioni, stipula di coperture assicurative, comunicazione a qualsiasi soggetto terzo che debba espletare qualsivoglia attivita' di consulenza/assistenza/prestazioni in ordine a detto rapporto (ivi compresi commercialisti, avvocati, consulenti del lavoro, tecnici, medici del lavoro, banche e compagnie assicurative);
4. Trattamenti derivanti da obblighi di legge (trattamenti che prescindono da consenso) - I dati personali comuni e/o sensibili e/o giudiziari, richiesti e/o forniti anche verbalmente, preventivamente all'instaurazione del rapporto contrattuale, ovvero nel corso o dopo la cessazione dello stesso, saranno oggetto, anche senza il Vostro consenso ai sensi dell'art. 6, lettera c) GDPR:
i. di trattamento connesso a finalita' fiscale/tributaria/contributiva;
ii. di trattamento connesso alla comunicazione a Enti pubblici o privati a cui sia necessario per disposizioni di legge o per rapporti contrattuali comunicare i dati;
iii. di trattamento connesso agli obblighi di legge in tema di tutela della vita e della salute;
iv. di trattamento costituito da trasferimento a terzi per finalita' di backup su server esterni anche al di fuori del territorio della UE. I dati trasferiti su tali server saranno dotati di cifratura affinche' solo il titolare e i soggetti autorizzati possano accedervi. I dati potranno inoltre essere temporaneamente trasferiti a soggetti incaricati di attivita' di manutenzione delle apparecchiature hardware e software, mediante salvataggi di backup necessari al salvataggio e al recupero dei dati.
5. Trattamenti a prescindere da obblighi contrattuali o di legge - I dati personali comuni e/o sensibili e/o giudiziari, richiesti e/o forniti anche verbalmente, preventivamente all'instaurazione del rapporto contrattuale, ovvero nel corso o dopo la cessazione dello stesso, saranno oggetto:
i. di trattamento costituito dalla conservazione dei dati sui propri server e dalla loro analisi anche con strumenti tecnologici automatizzati (profilazione) al fine di consentire al titolare di poter gestire un consolidato nazionale in tempo reale e al fine di poter analizzare i dati caricati sul software per poter indirizzare al meglio le strategie commerciali del network;
ii. di trattamento costituito dall'inserimento di dati, fotografie, articoli e riprese audiovisive nel proprio sito internet e nelle proprie pubblicazioni, social network, per la pubblicazione di fotografie e/o riprese audiovisive, corsi on line, pubblicazioni, brochure, presentazioni, cataloghi per fini didattici, pubblicitari e di marketing;
iii. trattamento costituito dall'invio di informative per finalita' pubblicitarie e di marketing anche via e-mail, sms, whatsapp.
6. Definizione di trattamento - Il "trattamento" di dati personali e' definito dall'art. 4 GDPR come qualsiasi operazione o insieme di operazioni, compiute con o senza l'ausilio di processi automatizzati e applicate a dati personali, come la raccolta, la registrazione, l'organizzazione, la strutturazione, la conservazione, l'adattamento o la modifica, l'estrazione, la consultazione, l'uso, la comunicazione mediante trasmissione, diffusione o qualsiasi altra forma di messa a disposizione, il raffronto o l'interconnessione, la limitazione, la cancellazione o la distruzione.
7. Trattamento di particolari categorie di dati (dati sensibili) - I dati particolari ex art. 9 GDPR ossia i dati personali che rivelino l'origine razziale o etnica, le opinioni politiche, le convinzioni religiose o filosofiche, o l'appartenenza sindacale, dati genetici, dati biometrici, dati relativi alla salute o alla vita sessuale o all'orientamento sessuale della persona non rientrano normalmente nel trattamento sopra descritto e verranno trattati solo in presenza di Vostro consenso.
8. Trattamento di dati giudiziari - I dati giudiziari, in materia di casellario giudiziale, di anagrafe delle sanzioni amministrative dipendenti da reato e dei relativi carichi pendenti, o la qualita' di imputato o di indagato ai sensi degli articoli 60 e 61 del codice di procedura penale, verranno trattati solo se necessario e su consenso dell'interessato.

CATEGORIE DI SOGGETTI AI QUALI I DATI POSSONO ESSERE COMUNICATI
9. I dati personali forniti (comuni, sensibili e giudiziari) potranno essere oggetto di comunicazione a tutti i dipendenti e collaboratori coinvolti, nonche' agli Enti esterni destinatari delle pratiche che riguardano il cliente/fornitore, e ai soggetti esterni che interagiscono con il titolare, sempre ed esclusivamente per attivita' funzionali alle finalita' sopra descritte; tali categorie sono:
A. Societa' operanti nel campo E.D.P., anche residenti all'estero, per la cura dell'information management del titolare, della sicurezza e della riservatezza dei dati;
B. Commercialisti, societa' di servizi nel campo della consulenza del lavoro e in quello dell'elaborazione di sistemi di paghe e stipendi, nonche' Studi Legali per eventuali controversie da trattare;
C. Clienti e Fornitori per lo svolgimento delle attivita' commerciali, di servizio e amministrative del titolare, oltreche' in assolvimento delle leggi vigenti;
D. Distributori, agenti, vettori, corrieri, trasportatori e comunque ogni altra Societa' utilizzata nell'ambito dei servizi offerti dal titolare;
E. Societa' del Gruppo Made;
F. Societa' o soggetti che svolgono attivita' commerciale di vendita e/o fornitura di beni e/o servizi, di pubblicita', nell'ambito dell'attivita' commerciale promozionale e di marketing;
G. soggetti terzi con cui sia necessario o anche solo opportuno collaborare nell'ambito dell'organizzazione dell'attivita' aziendale.

MODALITA' DI TRATTAMENTO
10. Principi - Secondo la normativa indicata, il trattamento dei dati personali sara' improntato ai principi di correttezza, liceita', trasparenza e di tutela della Sua riservatezza e dei Suoi diritti.
11. Strumenti - Il trattamento dei dati sara' effettuato sia con strumenti manuali e/o informatici e/o telematici con logiche di organizzazione ed elaborazione strettamente correlate alle finalita' stesse e comunque in modo da garantire la sicurezza, l'integrita' e la riservatezza dei dati stessi nel rispetto delle misure organizzative, fisiche e logiche previste dalle disposizioni vigenti.
12. Cessione dei dati all'estero - E' possibile la cessione dei dati all'estero e al di fuori dell'Unione Europea per finalita' di backup dati, per l'utilizzo di software che utilizzano server all'estero (Microsoft 365) e nel caso di servizi resi all'estero.

TERMINE DI CONSERVAZIONE DEI DATI
13. I dati personali vengono conservati per tutta la durata del rapporto contrattuale e, nel caso di cessazione del rapporto, nei termini prescrizionali normativamente previsti per l'esercizio di qualsivoglia diritto connesso al rapporto intercorso tra le parti, anche al fine della possibile necessita' di prova della regolarita' delle prestazioni in sede giudiziale o stragiudiziale. In ogni caso per non meno di 10 anni in ragione degli obblighi di conservazione a fini fiscali.

CONSENSO DELL'INTERESSATO
14. Il conferimento dei dati personali (comuni, sensibili e giudiziari) al trattamento finora spiegato cosi' come la loro comunicazione alle categorie di soggetti elencate hanno natura obbligatoria ai sensi delle leggi e dei contratti che regolamentano il rapporto contrattuale.
15. Si informa in particolare che:
a) e' obbligatorio fornire i dati per il trattamento per le finalita' di cui al punto 3, al punto 4 e acconsentire alla loro cessione ai soggetti di cui al punto 9. Il mancato consenso, parziale o totale, comporta l'impossibilita' - da un lato - di assolvere gli obblighi di legge e quindi di costituire o proseguire il rapporto contrattuale e - dall'altro - di svolgere la propria attivita' tipica;
b) e' facoltativo fornire i dati per il trattamento di cui al punto 5 e acconsentire alla loro cessione ai soggetti di cui al punto 9, anche se in tal caso il titolare potra' valutare caso per caso se sia possibile proseguire il rapporto contrattuale alle meno agevoli condizioni derivanti dalla mancata prestazione del consenso;
c) e' facoltativo fornire i dati giudiziari.

DIRITTI DELL'INTERESSATO
16. Ella potra', in qualsiasi momento, esercitare i diritti: a) di accesso ai dati personali (art. 15 GDPR); b) di ottenere la rettifica (art. 16), la cancellazione (art. 17) o la limitazione del trattamento (art. 18); c) di opporsi al trattamento (art. 21); d) alla portabilita' dei dati (art. 20); e) di revocare il consenso, ove previsto: la revoca non pregiudica la liceita' del trattamento basata sul consenso prestato prima della revoca (art. 7 co. 3); f) di proporre reclamo all'autorita' di controllo (Garante Privacy). L'esercizio dei suoi diritti potra' avvenire mediante e-mail all'indirizzo gdpr-md@madepoint.it. La revoca del consenso, la richiesta di cancellazione, l'opposizione e la richiesta di portabilita' dei dati comportera' l'impossibilita' di adempiere alle obbligazioni inerenti al rapporto e ne rendera' impossibile la prosecuzione.

DATI DEL TITOLARE E CONTATTI
Il Titolare del trattamento dati e' Made Distribuzione S.p.A. - c.f. 10126430965, con sede in Milano Corso di Porta Nuova 11 (tel. 02404702800 - email: gdpr-md@madepoint.it - pec: madedistribuzionesrl@pecplus.it). La persona a cui e' possibile rivolgersi per esercitare i diritti di cui all'art. 12 e/o per eventuali chiarimenti in materia di tutela dati personali e' raggiungibile all'indirizzo e-mail: gdpr-md@madepoint.it.`

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
