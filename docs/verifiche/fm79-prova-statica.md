# FM79 — Prova statica e chiusura verifica fette 1–4

Data: 17/11/2026. Fetta 5 esclusa. Nessuna modifica al codice dell’app o al database in questo giro.

## A. Perimetro e metodo

- Riferimento originale: `f3f1883ff19489bfc0788b372b86796571055be5` (analisi, prima delle correzioni tablet).
- Esaminato il diff completo `git diff --unified=0 f3f1883f HEAD -- src`: **14 file, 509 righe aggiunte e 91 rimosse, 600 righe firmate**. Si conta ogni `+` e ogni `-`, comprese righe vuote e commenti; escluse intestazioni e contesto invariato. Una sostituzione di una riga conta quindi due righe.
- Le categorie sono disgiunte. Le righe rimosse sono attribuite alla sostituzione corrispondente. Nel blocco misto Recupero L635–636→L638–639, il ramo appartiene a 2 e la classe della tabella a 1.
- **1:** solo token `tablet:` aggiunti, tutti i token preesistenti conservati nello stesso ordine. Include `className` prima assente con soli token `tablet:`, e le stringhe delle varianti del Button (stesso ruolo di className).
- **2:** rami `isTablet`, proprietà ternarie con ramo false originale, helper chiamati esclusivamente da quei rami e relativa punteggiatura JSX.
- **3:** nuovo hook e definizione/commento della variante CSS. Il hook è invocato anche su PC per determinare false: “solo tablet” descrive il suo effetto, non l’esecuzione.
- **4:** ogni altra modifica, anche innocua o visivamente limitata dal CSS. Non si classifica come 2 un elemento montato sempre ma nascosto con `hidden tablet:block`.

### Conteggi

| Categoria | Aggiunte | Rimosse | Totale |
|---|---:|---:|---:|
| 1 | 78 | 78 | 156 |
| 2 | 388 | 11 | 399 |
| 3 | 23 | 0 | 23 |
| 4 | 20 | 2 | 22 |
| **Totale** | **509** | **91** | **600** |

### Conteggi per file

| File | 1 | 2 | 3 | ALTRO |
|---|---:|---:|---:|---:|
| `src/components/app-shell.tsx` | 18 | 0 | 0 | 0 |
| `src/components/richieste-interne/richieste-table.tsx` | 2 | 79 | 0 | 2 |
| `src/components/ui/button.tsx` | 8 | 0 | 0 | 0 |
| `src/components/ui/checkbox.tsx` | 2 | 0 | 0 | 0 |
| `src/components/ui/input.tsx` | 2 | 0 | 0 | 0 |
| `src/components/ui/select.tsx` | 2 | 0 | 0 | 0 |
| `src/components/ui/textarea.tsx` | 2 | 0 | 0 | 0 |
| `src/hooks/use-tablet.ts` | 0 | 0 | 21 | 0 |
| `src/routes/_app/clienti.tsx` | 10 | 169 | 0 | 3 |
| `src/routes/_app/recupero-crediti-calendario.tsx` | 2 | 0 | 0 | 0 |
| `src/routes/_app/recupero-crediti-campagne.tsx` | 38 | 0 | 0 | 7 |
| `src/routes/_app/recupero-crediti.tsx` | 56 | 13 | 0 | 5 |
| `src/routes/_app/richieste.tsx` | 14 | 138 | 0 | 5 |
| `src/styles.css` | 0 | 0 | 2 | 0 |

### Tutte le righe ALTRO, senza omissioni

Numeri `+` riferiti al file attuale, numeri `-` al riferimento originale. Le istruzioni dell’hook non sono dentro un ramo tablet, quindi sono elencate conservativamente in ALTRO.

#### `+ src/components/richieste-interne/richieste-table.tsx:14`

```tsx
import { useIsTablet } from "@/hooks/use-tablet";
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/components/richieste-interne/richieste-table.tsx:138`

```tsx
  const isTablet = useIsTablet();
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/clienti.tsx:15`

```tsx
import { useIsTablet } from "@/hooks/use-tablet";
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/clienti.tsx:183`

```tsx
  /** FM79: solo sul tablet cambia l'impaginazione (schede in verticale, tabella ridotta in orizzontale). */
```

Commento: nessun effetto a runtime.

#### `+ src/routes/_app/clienti.tsx:184`

```tsx
  const isTablet = useIsTablet();
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/recupero-crediti-campagne.tsx:194`

```tsx
                      <div className="hidden tablet:block mt-2 space-y-1 text-sm text-muted-foreground break-words">
```

Nuovo contenuto sempre montato, sotto hidden tablet:block. Non cambia pixels telefono/PC (display:none, nessuna query o effetto), ma aggiunge nodi DOM e calcola testo/Progress anche fuori tablet.

#### `+ src/routes/_app/recupero-crediti-campagne.tsx:195`

```tsx
                        <div>{fmtDateTime(c.created_at)} · {`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</div>
```

Nuovo contenuto sempre montato, sotto hidden tablet:block. Non cambia pixels telefono/PC (display:none, nessuna query o effetto), ma aggiunge nodi DOM e calcola testo/Progress anche fuori tablet.

#### `+ src/routes/_app/recupero-crediti-campagne.tsx:196`

```tsx
                        <div>Totale: {c.totale_destinatari} · Inviati: {c.inviati} · Saltati: {c.saltati} · <span className="text-destructive">Falliti: {c.falliti}</span></div>
```

Nuovo contenuto sempre montato, sotto hidden tablet:block. Non cambia pixels telefono/PC (display:none, nessuna query o effetto), ma aggiunge nodi DOM e calcola testo/Progress anche fuori tablet.

#### `+ src/routes/_app/recupero-crediti-campagne.tsx:197`

```tsx
                        <div className="flex items-center gap-2"><Progress value={pct} className="h-2" /><span className="shrink-0">{pct}%</span></div>
```

Nuovo contenuto sempre montato, sotto hidden tablet:block. Non cambia pixels telefono/PC (display:none, nessuna query o effetto), ma aggiunge nodi DOM e calcola testo/Progress anche fuori tablet.

#### `+ src/routes/_app/recupero-crediti-campagne.tsx:198`

```tsx
                      </div>
```

Nuovo contenuto sempre montato, sotto hidden tablet:block. Non cambia pixels telefono/PC (display:none, nessuna query o effetto), ma aggiunge nodi DOM e calcola testo/Progress anche fuori tablet.

#### `- src/routes/_app/recupero-crediti-campagne.tsx:206`

```tsx
                    <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
```

Sostituzione dell’icona con icona originale tablet:hidden e Button hidden tablet:inline-flex. Fuori tablet icona, classi e gestore della cella originali restano; nuovo Button è display:none/non focalizzabile. DOM modificato, nessun effetto visivo telefono/PC.

#### `+ src/routes/_app/recupero-crediti-campagne.tsx:211`

```tsx
                    <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}><ChevronRight className="size-4 text-muted-foreground tablet:hidden" /><Button variant="ghost" size="icon" className="hidden tablet:inline-flex" aria-label="Apri campagna" onClick={() => setOpenDettaglio(c.id)}><ChevronRight className="size-4" /></Button></TableCell>
```

Sostituzione dell’icona con icona originale tablet:hidden e Button hidden tablet:inline-flex. Fuori tablet icona, classi e gestore della cella originali restano; nuovo Button è display:none/non focalizzabile. DOM modificato, nessun effetto visivo telefono/PC.

#### `+ src/routes/_app/recupero-crediti.tsx:36`

```tsx
import { useIsTablet } from "@/hooks/use-tablet";
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/recupero-crediti.tsx:66`

```tsx
  head: () => ({ meta: [{ title: "Recupero crediti | FidiManager" }, { name: "description", content: "Clienti, scaduti e attività di recupero crediti MADE." }, { property: "og:title", content: "Recupero crediti | FidiManager" }, { property: "og:description", content: "Clienti, scaduti e attività di recupero crediti MADE." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
```

head aggiunto per tutti i dispositivi: cambia titolo della scheda e metadati anche su telefono/PC, NON il layout/pixel della pagina. Eccezione innocua esplicitamente autorizzata a rimanere da Andrea; non corretta né rimossa.

#### `+ src/routes/_app/recupero-crediti.tsx:171`

```tsx
  const isTablet = useIsTablet();
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `- src/routes/_app/recupero-crediti.tsx:917`

```tsx
    <TableHead className={cn(align === "right" && "text-right", align === "center" && "text-center")}>
```

ClassName dell’intestazione: aggiunge cn(condizione→soli token tablet oppure stringa vuota). Le classi di allineamento originali restano intatte, nessun effetto visivo telefono/PC; valutazione eseguita ovunque. È ALTRO per il controllo stretto, non un ramo useIsTablet.

#### `+ src/routes/_app/recupero-crediti.tsx:927`

```tsx
    <TableHead className={cn(k === "azioni_aperte" || k === "prossima" ? "tablet:hidden" : k === "scaduto" ? "tablet:w-40" : k === "ultima" ? "tablet:w-[30%]" : "", align === "right" && "text-right", align === "center" && "text-center")}>
```

ClassName dell’intestazione: aggiunge cn(condizione→soli token tablet oppure stringa vuota). Le classi di allineamento originali restano intatte, nessun effetto visivo telefono/PC; valutazione eseguita ovunque. È ALTRO per il controllo stretto, non un ramo useIsTablet.

#### `+ src/routes/_app/richieste.tsx:64`

```tsx
import { useIsTablet } from "@/hooks/use-tablet";
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/richieste.tsx:609`

```tsx
  const isTablet = useIsTablet();
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/richieste.tsx:763`

```tsx
  const isTablet = useIsTablet();
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/richieste.tsx:1115`

```tsx
  const isTablet = useIsTablet();
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

#### `+ src/routes/_app/richieste.tsx:1274`

```tsx
  const isTablet = useIsTablet();
```

Import o invocazione del hook fuori dal ramo. Eseguito anche su telefono/PC, ma resta false; nuovo listener matchMedia, nessuna modifica del layout o dei gestori esistenti.

### Esito statico e primo render

- **Nessuna riga ALTRO cambia la presentazione telefono/PC.** Unica modifica non visiva intenzionale: titolo/metadati Recupero, conservati come richiesto. ALTRO non significa automaticamente regressione: i nodi CSS-nascosti e il listener del hook esistono, ma non alterano i pixels.
- `useIsTablet()` inizia con `useState(false)` sia in SSR sia al primo render browser. `matchMedia(MEDIA_TABLET)` è letto in `useEffect`; sul tablet passa a true dopo il mount e può esserci brevemente la vista preesistente, non necessariamente un lampeggio percepibile. Le classi CSS tablet sono invece già applicabili prima dell’effetto.
- Su PC con mouse e telefono a 375px la query resta false, e setTablet(false) non cambia il valore. La sottoscrizione matchMedia esiste ma non attiva i rami tablet; il ritorno false mantiene il ramo originale.
- `renderTabellaTablet` è chiamato soltanto in `isTablet ? renderTabellaTablet() : originale`. `TabellaFidoTablet` ha quattro punti di montaggio, tutti nel ramo true. Filtri Clienti: early return soltanto con `isTablet && !stack`.
- Prop `finoA`: fuori tablet rimane md, il default originale. Tutti i ternari di visibilità mantengono la stringa className originale nel ramo false. Handler, query, filtri, dati e gate preesistenti non sono cambiati dal diff.
- Nessuna correzione src necessaria/autorizzata dall’esito. Logo non toccato. Nessuna nuova route o modifica di head in questo giro.

## B. Conferma fotografica ridotta

- **60 fotografie, 30 coppie originali/attuali, 30 identiche pixel per pixel, 0 diverse.**
- Scatti completamente sequenziali, browser/contesto nuovo per ogni pagina/dimensione, locale it-IT, ora ferma, motion spenta, font pronti, attesa fino a sparizione dei caricamenti e due scatti consecutivi identici. Nessun processo fotografico parallelo.
- Originale f3f1883f letto con git show e transpilation delle sole sorgenti storiche nel browser di prova (intercettazione dei moduli); nessun ripristino dei file app. Stessi componenti SSR/router attuali; i moduli modificati client e le loro dipendenze sono sostituiti con gli originali. CSS attuale mantenuto: il diff styles.css contiene esclusivamente la dichiarazione tablet; la query è false nelle tre dimensioni/dispositivi di questa prova, quindi non influisce sul riferimento.
- Il protocollo **3+3 si applica a ogni coppia diversa**: qui non ne esiste nessuna, pertanto nessuna rifotografia 3+3 necessaria. Rumore osservato nel giro ridotto: 0; non si riusano o riclassificano i vecchi 15/222 o 12/222.
- Fixture uguali fra gruppi: amministratore + approvatore_richieste_liv1; **14 richieste pending** in Approva, sottotitolo “Richieste in attesa del tuo esame” verificato, nessun “Nessun ruolo”. Recupero RPC risponde con **5 aggregati** validi, tutti aperti: Aperti(5), nomi e righe verificati attraverso UI. Liste Clienti, Richieste fido e Preventivi: 14 righe. Scadenziario è vuoto nella fixture: prova dell’involucro e controlli, non delle scadenze.
- `/legali` esclusa come richiesto. Nessun dato reale letto/scritto, nessuna approvazione o invio effettuati. Le prove sono presentazionali con dati simulati, non certificazioni dei permessi o dei flussi reali.

| Pagina | 375×812 touch | 1280×800 mouse | 1440×900 mouse |
|---|---|---|---|
| `/dashboard` | Identica | Identica | Identica |
| `/clienti` | Identica | Identica | Identica |
| `/richieste` | Identica | Identica | Identica |
| `/richieste-interne/tutte` | Identica | Identica | Identica |
| `/richieste-interne/approva` | Identica | Identica | Identica |
| `/recupero-crediti` | Identica | Identica | Identica |
| `/recupero-crediti-campagne` | Identica | Identica | Identica |
| `/recupero-crediti-calendario` | Identica | Identica | Identica |
| `/preventivatore` | Identica | Identica | Identica |
| `/scadenziario` | Identica | Identica | Identica |

**Differenze VERE:** 375: elenco vuoto; 1280: elenco vuoto; 1440: elenco vuoto.

Screenshot ispezionati: Approva 1280 mostra 14 richieste/ruolo; Recupero 1440 mostra cinque righe; Recupero 375 conserva l’intestazione e KPI originali. Eventuali larghezze originali problematiche su PC non vengono “migliorate”: la richiesta è invarianza.

Artefatti temporanei: `/tmp/browser/fm79-chiusura/` (original1, current1, different.json, log e script). Possono sparire alla sospensione; l’esito e il diff classificato completo sono conservati qui sotto.

## C. Test e SHA

- `bun test`: **1019 pass, 0 fail**, 3433 asserzioni, 137 file (8,57 s).
- SHA del codice verificato (src invariato da inizio verifica): `86b6169e928e11d1a02db129311335ad8ccd2041`; il commit conclusivo include solo documentazione, viene comunicato nel resoconto.
- **Verifica fette 1–4 chiusa per il criterio richiesto A+B+C. Fetta 5 non eseguita.**

## Appendice: classificazione di ogni riga cambiata

Una voce per ciascuna delle 600 righe; contenuto completo (nessun troncamento).

### src/components/app-shell.tsx

```text
C1 -L511:                 className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-sidebar-accent/40 transition-colors group text-sidebar-foreground"
C1 +L511:                 className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-sidebar-accent/40 transition-colors group text-sidebar-foreground tablet:min-h-11"
C1 -L551:             className="flex items-center gap-3 flex-1 min-w-0 rounded-md hover:bg-sidebar-accent transition-colors px-1 py-1 -mx-1"
C1 +L551:             className="flex items-center gap-3 flex-1 min-w-0 rounded-md hover:bg-sidebar-accent transition-colors px-1 py-1 -mx-1 tablet:min-h-11"
C1 -L570:             className="size-8 rounded-md hover:bg-sidebar-accent flex items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
C1 +L570:             className="size-8 tablet:size-11 rounded-md hover:bg-sidebar-accent flex items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
C1 -L584:         className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-primary text-primary-foreground flex items-center justify-between px-4 z-40 border-b border-sidebar-border transition-transform duration-200 pv-orizzontale:data-[nascosta=true]:-translate-y-full"
C1 +L584:         className="lg:hidden tablet:flex fixed top-0 left-0 right-0 h-14 bg-primary text-primary-foreground flex items-center justify-between px-4 z-40 tablet:z-50 border-b border-sidebar-border transition-transform duration-200 pv-orizzontale:data-[nascosta=true]:-translate-y-full"
C1 -L613:       <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
C1 +L613:       <aside className="hidden lg:flex tablet:hidden w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
C1 -L619:           <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
C1 -L620:           <aside className="lg:hidden fixed inset-y-0 left-0 top-14 w-72 bg-sidebar text-sidebar-foreground flex flex-col z-50 border-r border-sidebar-border">
C1 +L619:           <div className="lg:hidden tablet:block fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
C1 +L620:           <aside className="lg:hidden tablet:flex fixed inset-y-0 left-0 top-14 w-72 bg-sidebar text-sidebar-foreground flex flex-col z-50 border-r border-sidebar-border">
C1 -L626:       <main className="flex-1 min-w-0 lg:ml-64 pt-14 lg:pt-0">
C1 +L626:       <main className="flex-1 min-w-0 lg:ml-64 pt-14 lg:pt-0 tablet:ml-0 tablet:pt-14">
C1 -L657:         className={`relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-md text-sm transition-colors ${
C1 +L657:         className={`relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-md text-sm transition-colors tablet:min-h-11 ${
```

### src/components/richieste-interne/richieste-table.tsx

```text
C4 +L14: import { useIsTablet } from "@/hooks/use-tablet";
C4 +L138:   const isTablet = useIsTablet();
C2 -L243:       <ElencoSchede>
C2 +L245:       <ElencoSchede finoA={isTablet ? "lg" : "md"}>
C2 +L311:       {isTablet ? (
C2 +L312:         // FM79: solo tablet in orizzontale (≥1024px). Colonne essenziali; tipo,
C2 +L313:         // richiedente+sede e date dentro la riga. Importo sempre visibile.
C2 +L314:         <div className="hidden lg:block rounded-md border">
C2 +L315:           <Table className="table-fixed w-full">
C2 +L316:             <TableHeader>
C2 +L317:               <TableRow>
C2 +L318:                 <TableHead className="w-1 p-0" aria-hidden />
C2 +L319:                 <SortHead active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")}>Richiesta</SortHead>
C2 +L320:                 <SortHead active={sortKey === "amount"} dir={sortDir} onClick={() => toggleSort("amount")} className="w-36 text-right">Importo</SortHead>
C2 +L321:                 <SortHead active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} className="w-44">Stato</SortHead>
C2 +L322:                 <TableHead className={onGestisci || onRipristina ? "w-52" : "w-24"}><span className="sr-only">Azioni</span></TableHead>
C2 +L323:               </TableRow>
C2 +L324:             </TableHeader>
C2 +L325:             <TableBody>
C2 +L326:               {isLoading && (
C2 +L327:                 <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Caricamento…</TableCell></TableRow>
C2 +L328:               )}
C2 +L329:               {!isLoading && filtered.length === 0 && (
C2 +L330:                 <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{emptyLabel}</TableCell></TableRow>
C2 +L331:               )}
C2 +L332:               {filtered.map((r) => {
C2 +L333:                 const nAll = r.richieste_interne_allegati?.length ?? 0;
C2 +L334:                 const showAdmin =
C2 +L335:                   showAdminBadge &&
C2 +L336:                   (r.status === "resp_approved" || r.status === "approved") &&
C2 +L337:                   r.admin_status &&
C2 +L338:                   r.admin_status !== "da_gestire";
C2 +L339:                 const info = [
C2 +L340:                   nascondiRichiedente ? null : r.requester_name,
C2 +L341:                   r.sede_name || "—",
C2 +L342:                   r.fornitore ? `Fornitore ${r.fornitore}` : null,
C2 +L343:                   fmtData(r.created_at),
C2 +L344:                   showArchivedColumns ? `Archiviata da ${r.archived_by_name || "—"} il ${fmtData(r.archived_at)}` : null,
C2 +L345:                 ].filter(Boolean).join(" · ");
C2 +L346:                 return (
C2 +L347:                   <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r.id)}>
C2 +L348:                     <TableCell className={cn("w-1 p-0 border-l-4", stilePrincipale(r).bordo)} aria-hidden />
C2 +L349:                     <TableCell className="align-top whitespace-normal">
C2 +L350:                       <div className={`flex items-start gap-1.5 min-w-0 ${unreadIds?.has(r.id) ? "font-bold text-primary" : "font-semibold"}`}>
C2 +L351:                         {unreadIds?.has(r.id) && <MessageSquare className="size-3.5 text-primary shrink-0 mt-0.5" aria-label="Messaggi non letti" />}
C2 +L352:                         <span className="min-w-0 break-words">{r.title}</span>
C2 +L353:                       </div>
C2 +L354:                       <div className="mt-1 flex flex-wrap items-center gap-1">
C2 +L355:                         <BadgeStile stile={stileTipo(r.type)} />
C2 +L356:                         {nAll > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3" />{nAll}</span>}
C2 +L357:                       </div>
C2 +L358:                       <div className="mt-1 text-xs text-muted-foreground break-words">{info}</div>
C2 +L359:                     </TableCell>
C2 +L360:                     <TableCell className="align-top text-right font-mono whitespace-normal">{fmtEuro(r.amount)}</TableCell>
C2 +L361:                     <TableCell className="align-top whitespace-normal">
C2 +L362:                       <div className="flex flex-col gap-1">
C2 +L363:                         <BadgeStile stile={stileStatus(r.status)} />
C2 +L364:                         {showAdmin && <BadgeStile stile={stileAdmin(r.admin_status)} />}
C2 +L365:                         <BadgeAcconto r={r} />
C2 +L366:                         {r.archived && !showArchivedColumns && <BadgeStile stile={STILE_ARCHIVIATA} />}
C2 +L367:                       </div>
C2 +L368:                     </TableCell>
C2 +L369:                     <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
C2 +L370:                       <div className="flex flex-col items-stretch gap-3">
C2 +L371:                         {onGestisci && mostraPulsanteGestisci(r) && (
C2 +L372:                           <Button size="sm" variant="outline" className="whitespace-normal h-auto" onClick={() => onGestisci(r)}>{gestisciLabel}</Button>
C2 +L373:                         )}
C2 +L374:                         {onRipristina && (
C2 +L375:                           <Button size="sm" variant="outline" onClick={() => onRipristina(r)}>↩ Ripristina</Button>
C2 +L376:                         )}
C2 +L377:                         <Button size="sm" variant="ghost" onClick={() => openDetail(r.id)}>Apri</Button>
C2 +L378:                       </div>
C2 +L379:                     </TableCell>
C2 +L380:                   </TableRow>
C2 +L381:                 );
C2 +L382:               })}
C2 +L383:             </TableBody>
C2 +L384:           </Table>
C2 +L385:         </div>
C2 +L386:       ) : (
C2 +L477:       )}
C1 -L423:       <button onClick={onClick} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
C1 +L502:       <button onClick={onClick} className="inline-flex items-center gap-1 font-medium hover:text-foreground tablet:min-h-10">
```

### src/components/ui/button.tsx

```text
C1 -L21:         default: "h-9 px-4 py-2",
C1 -L22:         sm: "h-8 rounded-md px-3 text-xs",
C1 -L23:         lg: "h-10 rounded-md px-8",
C1 -L24:         icon: "h-9 w-9",
C1 +L21:         default: "h-9 px-4 py-2 tablet:min-h-11",
C1 +L22:         sm: "h-8 rounded-md px-3 text-xs tablet:min-h-10",
C1 +L23:         lg: "h-10 rounded-md px-8 tablet:min-h-11",
C1 +L24:         icon: "h-9 w-9 tablet:min-h-10 tablet:min-w-10",
```

### src/components/ui/checkbox.tsx

```text
C1 -L14:       "grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
C1 +L14:       "grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground tablet:relative tablet:after:absolute tablet:after:-inset-3 tablet:after:content-['']",
```

### src/components/ui/input.tsx

```text
C1 -L11:           "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
C1 +L11:           "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm tablet:min-h-11 tablet:text-base",
```

### src/components/ui/select.tsx

```text
C1 -L22:       "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
C1 +L22:       "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 tablet:min-h-11 tablet:text-base",
```

### src/components/ui/textarea.tsx

```text
C1 -L10:           "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
C1 +L10:           "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm tablet:text-base",
```

### src/hooks/use-tablet.ts

```text
C3 +L1: import { useEffect, useState } from "react";
C3 +L2: 
C3 +L3: /**
C3 +L4:  * Fonte unica JS del "tablet" (FM79): stessa media query della variante `tablet:` in src/styles.css.
C3 +L5:  * Schermo touch senza mouse, da 768px, escluso il telefono in orizzontale.
C3 +L6:  */
C3 +L7: export const MEDIA_TABLET =
C3 +L8:   "(pointer: coarse) and (hover: none) and (min-width: 768px) and (min-height: 501px)";
C3 +L9: 
C3 +L10: /** false al primo render (uguale al rendering lato server); il valore reale arriva in useEffect. */
C3 +L11: export function useIsTablet(): boolean {
C3 +L12:   const [tablet, setTablet] = useState(false);
C3 +L13:   useEffect(() => {
C3 +L14:     const mq = window.matchMedia(MEDIA_TABLET);
C3 +L15:     const aggiorna = () => setTablet(mq.matches);
C3 +L16:     aggiorna();
C3 +L17:     mq.addEventListener("change", aggiorna);
C3 +L18:     return () => mq.removeEventListener("change", aggiorna);
C3 +L19:   }, []);
C3 +L20:   return tablet;
C3 +L21: }
```

### src/routes/_app/clienti.tsx

```text
C4 +L15: import { useIsTablet } from "@/hooks/use-tablet";
C4 +L183:   /** FM79: solo sul tablet cambia l'impaginazione (schede in verticale, tabella ridotta in orizzontale). */
C4 +L184:   const isTablet = useIsTablet();
C1 -L1539:     <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none h-9 px-2 rounded-md border">
C1 +L1542:     <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none h-9 px-2 rounded-md border tablet:min-h-11 tablet:text-sm">
C1 -L1634:           className="inline-flex items-center gap-1 rounded-full border bg-muted/50 hover:bg-muted px-2.5 py-1 text-xs transition-colors"
C1 +L1637:           className="inline-flex items-center gap-1 rounded-full border bg-muted/50 hover:bg-muted px-2.5 py-1 text-xs transition-colors tablet:min-h-10 tablet:px-3"
C2 +L1663:     if (isTablet && !stack) {
C2 +L1664:       // FM79 tablet: ricerca a tutta larghezza, filtri su 2 colonne (3 in orizzontale) con etichette intere.
C2 +L1665:       return (
C2 +L1666:         <div className="space-y-2 text-sm">
C2 +L1667:           <SearchInput value={searchInput} onChange={setSearchInput} />
C2 +L1668:           <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
C2 +L1669:             {StoreSelect}
C2 +L1670:             {ScadutoSelect}
C2 +L1671:             {AScadereSelect}
C2 +L1672:             {SemaforoSelect}
C2 +L1673:             {StatoFidoPopover}
C2 +L1674:             {TipoSoggettoSelect}
C2 +L1675:             {AgenteSelect}
C2 +L1676:             {MestiereSelect}
C2 +L1677:             {PrivacySelect}
C2 +L1678:             {FidoFasciaSelect}
C2 +L1679:             {TotaleRischioSelect}
C2 +L1680:             {FatturatoSelect}
C2 +L1681:             {StatoAttivitaSelect}
C2 +L1682:             {RichiestaFidoSelect}
C2 +L1683:             {ScostamentoSelect}
C2 +L1684:             {ProfiloFidoSelect}
C2 +L1685:             {FidoTeoricoToggle}
C2 +L1686:             {AdvFilterBtn}
C2 +L1687:           </div>
C2 +L1688:           {ChipsRow}
C2 +L1689:         </div>
C2 +L1690:       );
C2 +L1691:     }
C1 -L1760:         className={`flex items-center gap-1 font-medium hover:text-primary transition-colors ${align === "right" ? "ml-auto" : ""}`}
C1 +L1792:         className={`flex items-center gap-1 font-medium hover:text-primary transition-colors tablet:min-h-10 ${align === "right" ? "ml-auto" : ""}`}
C2 +L1804:   /** FM79 tablet in orizzontale (da lg): solo colonne essenziali, il resto dentro la riga; azioni sempre visibili. */
C2 +L1805:   function renderTabellaTablet() {
C2 +L1806:     return (
C2 +L1807:       <div className="hidden lg:block">
C2 +L1808:         <Table className="w-full table-fixed">
C2 +L1809:           <TableHeader>
C2 +L1810:             <TableRow>
C2 +L1811:               {!isAgente && (
C2 +L1812:                 <TableHead className="w-12">
C2 +L1813:                   <Checkbox checked={tuttiClientiSel} onCheckedChange={(v) => void toggleTuttiClienti(v === true)} />
C2 +L1814:                 </TableHead>
C2 +L1815:               )}
C2 +L1816:               <TableHead><SortHeader col="ragione_sociale" label="Ragione sociale" /></TableHead>
C2 +L1817:               <TableHead className="w-[17%]">Punto vendita</TableHead>
C2 +L1818:               <TableHead className="w-[17%] text-right"><SortHeader col="fido_gestionale" label="Fido" align="right" /></TableHead>
C2 +L1819:               <TableHead className="w-[17%]"><SortHeader col="scaduto" label="Scaduto" /></TableHead>
C2 +L1820:               <TableHead className="w-[14%]">Stato</TableHead>
C2 +L1821:               <TableHead className="w-14"><span className="sr-only">Azioni</span></TableHead>
C2 +L1822:             </TableRow>
C2 +L1823:           </TableHeader>
C2 +L1824:           <TableBody>
C2 +L1825:             {clienti.map((c: any) => {
C2 +L1826:               const sem = semaforoDisplayMap?.get(c.id) ?? null;
C2 +L1827:               const residuoNum = c.fido_residuo == null ? null : Number(c.fido_residuo);
C2 +L1828:               const sc = (scadenziarioMap ?? scadenziarioDisplayMap)?.get(c.id);
C2 +L1829:               const isBlocked = !!c.bloccato || Number(c.ind_blocco ?? 0) > 0;
C2 +L1830:               const attivo = isClienteAttivo((c as any).ultima_data_fatturazione, (c as any).doc_da_fatturare, config);
C2 +L1831:               const legale = (c as { in_gestione_legale?: boolean }).in_gestione_legale;
C2 +L1832:               const ft = mostraFidoTeorico ? fidoTeoricoDisplayMap?.get(c.id) : undefined;
C2 +L1833:               return (
C2 +L1834:                 <TableRow
C2 +L1835:                   key={c.id}
C2 +L1836:                   className={`cursor-pointer ${isBlocked ? "bg-[#FEF2F2] dark:bg-destructive/10 border-l-[3px] border-l-[#EF4444]" : legale ? "bg-amber-50 dark:bg-amber-500/10 border-l-[3px] border-l-amber-500" : !attivo ? "bg-muted/40 text-muted-foreground" : ""}`}
C2 +L1837:                   onClick={() => navigate({ to: "/clienti/$clienteId", params: { clienteId: c.id } })}
C2 +L1838:                 >
C2 +L1839:                   {!isAgente && (
C2 +L1840:                     <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
C2 +L1841:                       <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c)} />
C2 +L1842:                     </TableCell>
C2 +L1843:                   )}
C2 +L1844:                   <TableCell className="align-top">
C2 +L1845:                     <div className="flex items-start gap-2 min-w-0">
C2 +L1846:                       <span
C2 +L1847:                         className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-full ${sem?.stadio ? SEMAFORO_DOT[sem.stadio] : "bg-muted"}`}
C2 +L1848:                         title={sem?.motivo ?? (sem?.stadio ? SEMAFORO_LABEL[sem.stadio] : "Semaforo non ancora calcolato")}
C2 +L1849:                       />
C2 +L1850:                       <div className="min-w-0">
C2 +L1851:                         <div className="font-medium break-words">
C2 +L1852:                           {legale && <span title="In gestione legale" className="text-orange-600 mr-1">⚖</span>}
C2 +L1853:                           {c.ragione_sociale}
C2 +L1854:                         </div>
C2 +L1855:                         <div className="text-xs text-muted-foreground break-words">
C2 +L1856:                           <span className="font-mono">{c.codice_gestionale || "—"}</span>
C2 +L1857:                           {c.partita_iva ? ` · P. IVA ${c.partita_iva}` : ""}
C2 +L1858:                           {c.citta ? ` · ${c.citta}${c.provincia ? ` (${c.provincia})` : ""}` : ""}
C2 +L1859:                         </div>
C2 +L1860:                       </div>
C2 +L1861:                     </div>
C2 +L1862:                   </TableCell>
C2 +L1863:                   <TableCell className="align-top text-sm break-words">
C2 +L1864:                     {c.stores?.nome || <span className="text-muted-foreground">—</span>}
C2 +L1865:                   </TableCell>
C2 +L1866:                   <TableCell className="align-top text-right text-sm tabular-nums">
C2 +L1867:                     <div>{fmtEuro(c.fido_gestionale)}</div>
C2 +L1868:                     <div className={`text-xs ${residuoNum != null && residuoNum < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
C2 +L1869:                       Residuo {fmtEuro(c.fido_residuo)}
C2 +L1870:                     </div>
C2 +L1871:                     {ft && <div className="text-xs text-muted-foreground">Proposto {fmtEuro(ft.fido_proposto)}</div>}
C2 +L1872:                   </TableCell>
C2 +L1873:                   <TableCell className="align-top">
C2 +L1874:                     <div className="flex flex-col items-start gap-1">
C2 +L1875:                       {sc && sc.ha_scaduto ? (
C2 +L1876:                         <Badge className="bg-destructive/15 text-destructive gap-1" title="Importo scaduto">
C2 +L1877:                           <AlertCircle className="size-3" /> {fmtEuro(sc.totale_scaduto)}
C2 +L1878:                         </Badge>
C2 +L1879:                       ) : (
C2 +L1880:                         <span className="text-muted-foreground text-sm">—</span>
C2 +L1881:                       )}
C2 +L1882:                       {sc && sc.ha_a_scadere && (
C2 +L1883:                         <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 gap-1" title="A scadere">
C2 +L1884:                           <Clock className="size-3" /> {fmtEuro(sc.totale_a_scadere)}
C2 +L1885:                         </Badge>
C2 +L1886:                       )}
C2 +L1887:                     </div>
C2 +L1888:                   </TableCell>
C2 +L1889:                   <TableCell className="align-top">
C2 +L1890:                     <div className="flex flex-col items-start gap-1">
C2 +L1891:                       <Badge variant={!attivo ? "secondary" : "default"}>{!attivo ? "Non attivo" : "Attivo"}</Badge>
C2 +L1892:                       {c.ind_blocco === 1 && <Badge className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-500">Blocco revocabile</Badge>}
C2 +L1893:                       {c.ind_blocco === 2 && <Badge className="bg-destructive/15 text-destructive">Bloccato</Badge>}
C2 +L1894:                       {legale && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-500">⚖️ Legale</Badge>}
C2 +L1895:                       {privacyDisplayMap?.get(c.id) ? (
C2 +L1896:                         <Badge className="bg-success/15 text-success gap-1"><Shield className="size-3" /> Privacy OK</Badge>
C2 +L1897:                       ) : (
C2 +L1898:                         <Badge className="bg-warning/15 text-warning gap-1"><ShieldOff className="size-3" /> Privacy da richiedere</Badge>
C2 +L1899:                       )}
C2 +L1900:                       {c.assicurazione_attiva && <Badge className="bg-success/15 text-success">POUEY</Badge>}
C2 +L1901:                       {badgePromessa(c.id)}
C2 +L1902:                     </div>
C2 +L1903:                   </TableCell>
C2 +L1904:                   <TableCell className="align-top" onClick={(e) => e.stopPropagation()}>
C2 +L1905:                     <Button
C2 +L1906:                       variant="ghost"
C2 +L1907:                       size="icon"
C2 +L1908:                       title="Modifica"
C2 +L1909:                       aria-label="Modifica"
C2 +L1910:                       onClick={() => navigate({ to: "/clienti/$clienteId", params: { clienteId: c.id }, search: { edit: 1 } as any })}
C2 +L1911:                     >
C2 +L1912:                       <Pencil className="size-4" />
C2 +L1913:                     </Button>
C2 +L1914:                   </TableCell>
C2 +L1915:                 </TableRow>
C2 +L1916:               );
C2 +L1917:             })}
C2 +L1918:           </TableBody>
C2 +L1919:         </Table>
C2 +L1920:       </div>
C2 +L1921:     );
C2 +L1922:   }
C2 +L1923: 
C1 -L1867:                 className="underline hover:text-foreground"
C1 +L2019:                 className="underline hover:text-foreground tablet:inline-flex tablet:min-h-10 tablet:items-center tablet:px-1"
C2 -L1918:             <div className="md:hidden mb-2">
C2 +L2070:             <div className={isTablet ? "lg:hidden mb-2" : "md:hidden mb-2"}>
C2 +L2089:             finoA={isTablet ? "lg" : "md"}
C2 +L2122:                     ...(isTablet ? [{ etichetta: "Codice", valore: c.codice_gestionale || "—" }] : []),
C2 +L2127:                     ...(isTablet ? [{ etichetta: "Scaduto", valore: sc && sc.ha_scaduto ? fmtEuro(sc.totale_scaduto) : "—" }] : []),
C2 +L2154:                       {isTablet && (
C2 +L2155:                         <Button
C2 +L2156:                           variant="outline"
C2 +L2157:                           size="sm"
C2 +L2158:                           className="ml-auto gap-1.5"
C2 +L2159:                           onClick={(e) => {
C2 +L2160:                             e.stopPropagation();
C2 +L2161:                             navigate({ to: "/clienti/$clienteId", params: { clienteId: c.id }, search: { edit: 1 } as any });
C2 +L2162:                           }}
C2 +L2163:                         >
C2 +L2164:                           <Pencil className="size-4" /> Modifica
C2 +L2165:                         </Button>
C2 +L2166:                       )}
C2 +L2175:           {isTablet ? renderTabellaTablet() : (
C2 +L2379:           )}
C1 -L2237:                     className="min-w-9"
C1 +L2407:                     className="min-w-9 tablet:min-w-10"
```

### src/routes/_app/recupero-crediti-calendario.tsx

```text
C1 -L565:       <Card className="p-4">
C1 +L565:       <Card className="p-4 tablet:[&_.fc-button]:min-h-10 tablet:[&_.fc-button]:min-w-10 tablet:[&_.fc-daygrid-day-frame]:min-h-10 tablet:[&_.fc-timegrid-slot]:h-10 tablet:[&_.fc-col-header-cell-cushion]:inline-flex tablet:[&_.fc-col-header-cell-cushion]:min-h-10 tablet:[&_.fc-col-header-cell-cushion]:items-center tablet:[&_.fc-daygrid-day-number]:inline-flex tablet:[&_.fc-daygrid-day-number]:min-h-10 tablet:[&_.fc-daygrid-day-number]:min-w-10 tablet:[&_.fc-daygrid-day-number]:items-center tablet:[&_.fc-daygrid-day-number]:justify-center">
```

### src/routes/_app/recupero-crediti-campagne.tsx

```text
C1 -L152:         <Table>
C1 +L152:         <Table className="tablet:table-fixed">
C1 -L155:               <TableHead>Data</TableHead>
C1 -L156:               <TableHead>Operatore</TableHead>
C1 -L157:               <TableHead>Template</TableHead>
C1 +L155:               <TableHead className="tablet:hidden">Data</TableHead>
C1 +L156:               <TableHead className="tablet:hidden">Operatore</TableHead>
C1 +L157:               <TableHead className="tablet:w-[44%]">Template</TableHead>
C1 -L159:               <TableHead className="text-right">Tot.</TableHead>
C1 -L160:               <TableHead className="text-right">Inviati</TableHead>
C1 -L161:               <TableHead className="text-right">Saltati</TableHead>
C1 -L162:               <TableHead className="text-right">Falliti</TableHead>
C1 -L163:               <TableHead className="min-w-[180px]">Avanzamento</TableHead>
C1 -L164:               <TableHead className="w-[60px]"></TableHead>
C1 -L165:               <TableHead className="w-[40px]"></TableHead>
C1 +L159:               <TableHead className="text-right tablet:hidden">Tot.</TableHead>
C1 +L160:               <TableHead className="text-right tablet:hidden">Inviati</TableHead>
C1 +L161:               <TableHead className="text-right tablet:hidden">Saltati</TableHead>
C1 +L162:               <TableHead className="text-right tablet:hidden">Falliti</TableHead>
C1 +L163:               <TableHead className="min-w-[180px] tablet:hidden">Avanzamento</TableHead>
C1 +L164:               <TableHead className="w-[60px] tablet:w-16"></TableHead>
C1 +L165:               <TableHead className="w-[40px] tablet:w-16"></TableHead>
C1 -L185:                     <TableCell className="whitespace-nowrap cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{fmtDateTime(c.created_at)}</TableCell>
C1 -L186:                     <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</TableCell>
C1 +L185:                     <TableCell className="whitespace-nowrap cursor-pointer tablet:hidden" onClick={() => setOpenDettaglio(c.id)}>{fmtDateTime(c.created_at)}</TableCell>
C1 +L186:                     <TableCell className="cursor-pointer tablet:hidden" onClick={() => setOpenDettaglio(c.id)}>{`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</TableCell>
C1 -L188:                       <div className="flex items-center gap-2">
C1 +L188:                       <div className="flex items-center gap-2 tablet:flex-wrap tablet:break-words">
C4 +L194:                       <div className="hidden tablet:block mt-2 space-y-1 text-sm text-muted-foreground break-words">
C4 +L195:                         <div>{fmtDateTime(c.created_at)} · {`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</div>
C4 +L196:                         <div>Totale: {c.totale_destinatari} · Inviati: {c.inviati} · Saltati: {c.saltati} · <span className="text-destructive">Falliti: {c.falliti}</span></div>
C4 +L197:                         <div className="flex items-center gap-2"><Progress value={pct} className="h-2" /><span className="shrink-0">{pct}%</span></div>
C4 +L198:                       </div>
C1 -L196:                     <TableCell className="text-right font-medium cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.totale_destinatari}</TableCell>
C1 -L197:                     <TableCell className="text-right text-emerald-600 cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.inviati}</TableCell>
C1 -L198:                     <TableCell className="text-right text-amber-600 cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.saltati}</TableCell>
C1 -L199:                     <TableCell className="text-right text-destructive cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>{c.falliti}</TableCell>
C1 -L200:                     <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}>
C1 +L201:                     <TableCell className="text-right font-medium cursor-pointer tablet:hidden" onClick={() => setOpenDettaglio(c.id)}>{c.totale_destinatari}</TableCell>
C1 +L202:                     <TableCell className="text-right text-emerald-600 cursor-pointer tablet:hidden" onClick={() => setOpenDettaglio(c.id)}>{c.inviati}</TableCell>
C1 +L203:                     <TableCell className="text-right text-amber-600 cursor-pointer tablet:hidden" onClick={() => setOpenDettaglio(c.id)}>{c.saltati}</TableCell>
C1 +L204:                     <TableCell className="text-right text-destructive cursor-pointer tablet:hidden" onClick={() => setOpenDettaglio(c.id)}>{c.falliti}</TableCell>
C1 +L205:                     <TableCell className="cursor-pointer tablet:hidden" onClick={() => setOpenDettaglio(c.id)}>
C4 -L206:                     <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
C4 +L211:                     <TableCell className="cursor-pointer" onClick={() => setOpenDettaglio(c.id)}><ChevronRight className="size-4 text-muted-foreground tablet:hidden" /><Button variant="ghost" size="icon" className="hidden tablet:inline-flex" aria-label="Apri campagna" onClick={() => setOpenDettaglio(c.id)}><ChevronRight className="size-4" /></Button></TableCell>
```

### src/routes/_app/recupero-crediti.tsx

```text
C4 +L36: import { useIsTablet } from "@/hooks/use-tablet";
C4 +L66:   head: () => ({ meta: [{ title: "Recupero crediti | FidiManager" }, { name: "description", content: "Clienti, scaduti e attività di recupero crediti MADE." }, { property: "og:title", content: "Recupero crediti | FidiManager" }, { property: "og:description", content: "Clienti, scaduti e attività di recupero crediti MADE." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
C4 +L171:   const isTablet = useIsTablet();
C1 -L449:       <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
C1 +L452:       <div className="flex flex-col gap-3 sm:flex-row sm:items-center tablet:flex-col tablet:items-stretch">
C1 -L459:         <div className="flex flex-wrap gap-2">
C1 +L462:         <div className="flex flex-wrap gap-2 tablet:grid tablet:grid-cols-2 tablet:lg:grid-cols-4">
C1 -L472:             <Button variant="outline" size="sm" onClick={() => setInvioMassivoOpen(true)} className="gap-1.5">
C1 +L475:             <Button variant="outline" size="sm" onClick={() => setInvioMassivoOpen(true)} className="gap-1.5 tablet:min-h-10">
C1 -L480:       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
C1 +L483:       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tablet:grid-cols-2">
C1 -L490:           <TabsList>
C1 -L491:             <TabsTrigger value="aperti" className="gap-1.5">
C1 +L493:           <TabsList className="tablet:h-auto">
C1 +L494:             <TabsTrigger value="aperti" className="gap-1.5 tablet:min-h-10">
C1 -L494:             <TabsTrigger value="tutti" className="gap-1.5">
C1 +L497:             <TabsTrigger value="tutti" className="gap-1.5 tablet:min-h-10">
C1 -L497:             <TabsTrigger value="conclusi" className="gap-1.5">
C1 +L500:             <TabsTrigger value="conclusi" className="gap-1.5 tablet:min-h-10">
C1 -L507:               "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors",
C1 +L510:               "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors tablet:min-h-10",
C1 -L522:         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
C1 -L523:           <div className="lg:col-span-2">
C1 +L525:         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 tablet:grid-cols-2 tablet:lg:grid-cols-3">
C1 +L526:           <div className="lg:col-span-2 tablet:col-span-full">
C2 -L586:         <div className="md:hidden p-3">
C2 +L589:         <div className={isTablet ? "p-3 lg:hidden" : "md:hidden p-3"}>
C2 -L594:             <ElencoSchede>
C2 +L597:             <ElencoSchede finoA={isTablet ? "lg" : "md"}>
C2 -L635:         <div className="hidden md:block">
C1 -L636:           <Table className="min-w-[1150px]">
C2 +L638:         <div className={isTablet ? "hidden lg:block" : "hidden md:block"}>
C1 +L639:           <Table className="min-w-[1150px] tablet:min-w-0 tablet:table-fixed">
C1 -L639:                 <TableHead className="w-10" />
C1 +L642:                 <TableHead className="w-10 tablet:hidden" />
C1 -L641:                 <TableHead>Store</TableHead>
C1 +L644:                 <TableHead className="tablet:hidden">Store</TableHead>
C1 -L646:                 <TableHead>Stadio</TableHead>
C1 -L647:                 <TableHead>Stato</TableHead>
C1 -L648:                 <TableHead className="w-16 text-center">Azioni</TableHead>
C1 +L649:                 <TableHead className="tablet:hidden">Stadio</TableHead>
C1 +L650:                 <TableHead className="tablet:hidden">Stato</TableHead>
C1 +L651:                 <TableHead className="w-16 text-center tablet:w-28">Azioni</TableHead>
C1 -L681:                       <TableCell onClick={(e) => e.stopPropagation()}>
C1 +L684:                       <TableCell className="tablet:hidden" onClick={(e) => e.stopPropagation()}>
C1 -L692:                         <div className="flex items-center gap-2">
C1 +L695:                         <div className="flex items-center gap-2 tablet:flex-wrap">
C1 -L696:                             className="text-primary hover:underline"
C1 +L699:                             className="text-primary hover:underline tablet:flex tablet:min-h-10 tablet:items-center tablet:break-words"
C2 +L712:                         {isTablet && <div className="text-sm text-muted-foreground break-words">{r.store_nome ?? "—"} · Aperte: {r.azioni_aperte}
C2 +L713:                           <div className="mt-1 flex flex-wrap gap-2"><StadioSollecitoBadge stadio={r.stadio_sollecito} data={r.stadio_data} giorni={r.stadio_giorni} />
C2 +L714:                             {prossimaInRitardo ? <Badge variant="destructive">In ritardo</Badge> : hasAperte ? <Badge variant="secondary">Aperte</Badge> : <Badge variant="secondary">Solo storico</Badge>}
C2 +L715:                           </div>
C2 +L716:                           {r.prossima_data && <div className="mt-1">Prossima: {tipoLabel(r.prossima_tipo)} {fmtDateTime(r.prossima_data)}</div>}
C2 +L717:                         </div>}
C1 -L710:                       <TableCell className="text-sm text-muted-foreground">
C1 +L719:                       <TableCell className="text-sm text-muted-foreground tablet:hidden">
C1 -L719:                       <TableCell className="text-center">
C1 +L728:                       <TableCell className="text-center tablet:hidden">
C1 -L728:                       <TableCell className="whitespace-nowrap text-sm">
C1 +L737:                       <TableCell className="whitespace-nowrap text-sm tablet:hidden">
C1 -L742:                       <TableCell className="whitespace-nowrap text-sm">
C1 +L751:                       <TableCell className="whitespace-nowrap text-sm tablet:whitespace-normal">
C1 -L745:                           <div className="flex items-center gap-2">
C1 +L754:                           <div className="flex items-center gap-2 tablet:flex-wrap">
C1 -L754:                       <TableCell>
C1 +L763:                       <TableCell className="tablet:hidden">
C1 -L757:                       <TableCell>
C1 +L766:                       <TableCell className="tablet:hidden">
C2 +L778:                         {isTablet && <Button variant="ghost" size="icon" aria-label="Mostra attività" onClick={(e) => { e.stopPropagation(); setExpandedClienteId(expanded ? null : r.cliente_id); }}>{expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</Button>}
C4 -L917:     <TableHead className={cn(align === "right" && "text-right", align === "center" && "text-center")}>
C4 +L927:     <TableHead className={cn(k === "azioni_aperte" || k === "prossima" ? "tablet:hidden" : k === "scaduto" ? "tablet:w-40" : k === "ultima" ? "tablet:w-[30%]" : "", align === "right" && "text-right", align === "center" && "text-center")}>
C1 -L920:         className={cn("inline-flex items-center gap-1 hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
C1 +L930:         className={cn("inline-flex items-center gap-1 hover:text-foreground tablet:min-h-10", active ? "text-foreground" : "text-muted-foreground")}
```

### src/routes/_app/richieste.tsx

```text
C4 +L64: import { useIsTablet } from "@/hooks/use-tablet";
C1 -L475:       <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
C1 +L476:       <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 tablet:xl:grid-cols-3 gap-2 sm:gap-3">
C1 -L507:             <TabsTrigger value="bozze">Bozze {bozze.length > 0 && <Badge variant="secondary" className="ml-2">{bozze.length}</Badge>}</TabsTrigger>
C1 +L508:             <TabsTrigger value="bozze" className="tablet:min-h-10">Bozze {bozze.length > 0 && <Badge variant="secondary" className="ml-2">{bozze.length}</Badge>}</TabsTrigger>
C1 -L509:           <TabsTrigger value="in_approvazione">
C1 +L510:           <TabsTrigger value="in_approvazione" className="tablet:min-h-10">
C1 -L512:           <TabsTrigger value="approvate">
C1 +L513:           <TabsTrigger value="approvate" className="tablet:min-h-10">
C1 -L515:           <TabsTrigger value="rifiutate">
C1 +L516:           <TabsTrigger value="rifiutate" className="tablet:min-h-10">
C1 -L519:             <TabsTrigger value="tutto">
C1 +L520:             <TabsTrigger value="tutto" className="tablet:min-h-10">
C4 +L609:   const isTablet = useIsTablet();
C2 +L661:         finoA={isTablet ? "lg" : "md"}
C2 +L677:               ...(isTablet ? [{ etichetta: "Store", valore: r.clienti?.stores?.nome ?? "—" }, { etichetta: "Stato", valore: STATO_LABEL[r.stato as keyof typeof STATO_LABEL] ?? r.stato }] : []),
C2 -L681:       <div className="hidden md:block">
C2 +L685:       {isTablet ? (
C2 +L686: <TabellaFidoTablet
C2 +L687:           rows={rows}
C2 +L688:           onApri={(r: any) => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
C2 +L689:           selezione={{ tutti: allSel, onTutti: toggleTutte, checked: (r) => selected.has(r.id), onToggle: (r) => toggle(r.id) }}
C2 +L690:           badge={(r) => <><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /><BadgeExtraTeorico importo={r.importo_richiesto} teorico={(r as any).fido_teorico_riferimento} />{(msgCounts?.[r.id] ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{msgCounts![r.id]}</span>}</>}
C2 +L691:           dettagli={(r) => [r.clienti?.stores?.nome ?? "—", userName((r as any).richiedente), formatDate(r.created_at)]}
C2 +L692:           importo={(r) => <><div className="font-medium">{formatEuro(Number(r.importo_richiesto))}</div><div className="text-xs text-muted-foreground">Fido attuale {formatEuro(getFidoAttuale(r.clienti))}</div></>}
C2 +L693:           stato={(r) => <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as keyof typeof STATO_TONE]}`}>{STATO_LABEL[r.stato as keyof typeof STATO_LABEL]}</span>}
C2 +L694:         />
C2 +L695: ) : (
C2 +L696: <div className="hidden md:block">
C2 +L752: )}
C4 +L763:   const isTablet = useIsTablet();
C1 -L869:               <div className="flex flex-wrap gap-2">
C1 +L886:               <div className="flex flex-wrap gap-2 tablet:gap-6">
C2 +L899:         finoA={isTablet ? "lg" : "md"}
C2 +L928:                     ...(isTablet ? [{ etichetta: "Data invio", valore: formatDate(r.data_invio ?? (r.stato !== "bozza" ? r.created_at : null)) }] : []),
C2 -L923:           <div className="hidden md:block">
C2 +L942:           {isTablet ? (
C2 +L943: <TabellaFidoTablet
C2 +L944:             rows={filtered}
C2 +L945:             onApri={(r: any) => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
C2 +L946:             selezione={canApprove ? { tutti: allSel, disabled: decidibili.length === 0, onTutti: toggleTutte, checked: (r) => selected.has(r.id), onToggle: (r) => toggle(r.id), abilitata: (r) => decidibile(r), motivo: (r) => motivoNonDecidibile(r) } : undefined}
C2 +L947:             badge={(r) => { const unread = msgNonLetti?.[r.id] ?? 0; const nAltre = altreAttiveMap.get(r.cliente_id) ?? 0; return <><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /><BadgeExtraTeorico importo={r.importo_richiesto} teorico={(r as any).fido_teorico_riferimento} />{unread > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{unread}</span>}{nAltre > 0 && <Badge variant="outline" className="text-warning border-warning/40 gap-1 text-xs" title="Altra richiesta attiva o approvata-non-esportata per lo stesso cliente"><AlertCircle className="size-3" /> +{nAltre}</Badge>}</>; }}
C2 +L948:             dettagli={(r) => [r.clienti?.stores?.nome ?? "—", userName((r as any).richiedente), `Inviata ${formatDate(r.data_invio ?? (r.stato !== "bozza" ? r.created_at : null))}`]}
C2 +L949:             importo={(r) => <><div className="font-medium">{formatEuro(Number(r.importo_richiesto))}</div><div className="text-xs text-muted-foreground">Fido {formatEuro(getFidoAttuale(r.clienti))}</div><div className="text-xs text-muted-foreground">Rischio {formatEuro(Number(r.clienti?.totale_rischio ?? 0))}</div>{Number(r.clienti?.scaduto ?? 0) > 0 && <div className="text-xs text-destructive">Scaduto {formatEuro(Number(r.clienti?.scaduto))}</div>}</>}
C2 +L950:             stato={(r) => { const g = giorniDa(r.data_invio); return <><Badge variant="outline">L{r.livello_corrente}/{r.livello_richiesto}</Badge><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${attesaTone(g)}`}>{g}gg</span></>; }}
C2 +L951:           />
C2 +L952: ) : (
C2 +L953: <div className="hidden md:block">
C2 +L1027: )}
C4 +L1115:   const isTablet = useIsTablet();
C2 -L1129:           <ElencoSchede>
C2 +L1161:           <ElencoSchede finoA={isTablet ? "lg" : "md"}>
C2 +L1180:                     ...(isTablet ? [{ etichetta: "Store", valore: r.clienti?.stores?.nome ?? "—" }] : []),
C2 -L1159:           <div className="hidden md:block">
C2 +L1192:           {isTablet ? (
C2 +L1193: <TabellaFidoTablet
C2 +L1194:             rows={filtered}
C2 +L1195:             onApri={(r: any) => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
C2 +L1196:             badge={(r) => <><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /><BadgeExtraTeorico importo={r.importo_richiesto} teorico={(r as any).fido_teorico_riferimento} />{(msgCounts?.[r.id] ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{msgCounts![r.id]}</span>}</>}
C2 +L1197:             dettagli={(r) => [r.clienti?.stores?.nome ?? "—", userName((r as any).richiedente), `${kind === "approvata" ? "Approvato da" : "Deciso da"} ${userName((r as any).approvatore)}`, formatDate(r.data_chiusura ?? r.created_at), ...(kind === "rifiutata" ? [`Motivo: ${r.note ?? r.motivazione ?? "—"}`] : [])]}
C2 +L1198:             importo={(r) => <><div className="font-medium">{formatEuro(Number(r.importo_richiesto))}</div>{kind === "approvata" && (mapRichiestaFido(r).soloCondizione ? <div className="text-xs text-muted-foreground">solo cond. pag.</div> : <div className="text-xs text-success font-medium">Appr. {formatEuro(Number(r.importo_approvato ?? r.importo_richiesto))}</div>)}</>}
C2 +L1199:             stato={(r) => { const se = r.stato_export as string | null; const L: Record<string,string> = { da_esportare:"Da esportare", esportata:"Esportata", processata:"Processata", errore_export:"Errore" }; const T: Record<string,string> = { da_esportare:"bg-info/15 text-info", esportata:"bg-warning/15 text-warning", processata:"bg-success/15 text-success", errore_export:"bg-destructive/15 text-destructive" }; return <><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as keyof typeof STATO_TONE]}`}>{STATO_LABEL[r.stato as keyof typeof STATO_LABEL]}</span>{kind === "approvata" && se && <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${T[se]}`}>{L[se]}</span>}</>; }}
C2 +L1200:           />
C2 +L1201: ) : (
C2 +L1202: <div className="hidden md:block">
C2 +L1265: )}
C4 +L1274:   const isTablet = useIsTablet();
C2 -L1259:         <ElencoSchede>
C2 +L1304:         <ElencoSchede finoA={isTablet ? "lg" : "md"}>
C2 -L1285:         <div className="hidden md:block">
C2 +L1330:         {isTablet ? (
C2 +L1331: <TabellaFidoTablet
C2 +L1332:           rows={filtered}
C2 +L1333:           onApri={(r: any) => navigate({ to: "/richieste/$richiestaId", params: { richiestaId: r.id } })}
C2 +L1334:           badge={(r) => <><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TIPO_TONE[r.tipo as TipoRichiesta]}`}>{etichettaTipoRichiesta(r.tipo, importoPerEtichettaTipo(r))}</span><CambioCondizionePagamento variant="badge" richiesta={r} /><BadgeExtraTeorico importo={r.importo_richiesto} teorico={(r as any).fido_teorico_riferimento} />{(msgCounts?.[r.id] ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-info/15 text-info px-2 py-0.5 text-xs font-medium"><MessageSquare className="size-3" />{msgCounts![r.id]}</span>}</>}
C2 +L1335:           dettagli={(r) => [r.clienti?.stores?.nome ?? "—", `L${r.livello_corrente}/${r.livello_richiesto}`, userName((r as any).richiedente), `Approvato da ${userName((r as any).approvatore)}`, formatDate(r.created_at)]}
C2 +L1336:           importo={(r) => <div className="font-medium">{formatEuro(Number(r.importo_richiesto))}</div>}
C2 +L1337:           stato={(r) => <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATO_TONE[r.stato as keyof typeof STATO_TONE]}`}>{STATO_LABEL[r.stato as keyof typeof STATO_LABEL]}</span>}
C2 +L1338:         />
C2 +L1339: ) : (
C2 +L1340: <div className="hidden md:block">
C2 +L1388: )}
C2 +L1394: /* ===================== TABELLA TABLET (FM79) ===================== */
C2 +L1395: /**
C2 +L1396:  * Solo tablet in orizzontale (≥1024px, useIsTablet): colonne essenziali
C2 +L1397:  * Richiesta/Cliente · Importo · Stato · Azioni; tipo, sede, richiedente e date
C2 +L1398:  * dentro la riga. Telefono e PC continuano a usare schede e tabella originali.
C2 +L1399:  */
C2 +L1400: function TabellaFidoTablet({
C2 +L1401:   rows, onApri, selezione, badge, dettagli, importo, stato,
C2 +L1402: }: {
C2 +L1403:   rows: any[];
C2 +L1404:   onApri: (r: any) => void;
C2 +L1405:   selezione?: {
C2 +L1406:     tutti: boolean; disabled?: boolean; onTutti: () => void;
C2 +L1407:     checked: (r: any) => boolean; onToggle: (r: any) => void;
C2 +L1408:     abilitata?: (r: any) => boolean; motivo?: (r: any) => string;
C2 +L1409:   };
C2 +L1410:   badge: (r: any) => React.ReactNode;
C2 +L1411:   dettagli: (r: any) => string[];
C2 +L1412:   importo: (r: any) => React.ReactNode;
C2 +L1413:   stato: (r: any) => React.ReactNode;
C2 +L1414: }) {
C2 +L1415:   return (
C2 +L1416:     <div className="hidden lg:block">
C2 +L1417:       <Table className="table-fixed w-full">
C2 +L1418:         <TableHeader>
C2 +L1419:           <TableRow>
C2 +L1420:             {selezione && (
C2 +L1421:               <TableHead className="w-14">
C2 +L1422:                 <Checkbox aria-label="Seleziona tutte" checked={selezione.tutti} disabled={selezione.disabled} onCheckedChange={selezione.onTutti} />
C2 +L1423:               </TableHead>
C2 +L1424:             )}
C2 +L1425:             <TableHead>Richiesta</TableHead>
C2 +L1426:             <TableHead className="w-40 text-right">Importo</TableHead>
C2 +L1427:             <TableHead className="w-36">Stato</TableHead>
C2 +L1428:             <TableHead className="w-24 text-right"><span className="sr-only">Azioni</span></TableHead>
C2 +L1429:           </TableRow>
C2 +L1430:         </TableHeader>
C2 +L1431:         <TableBody>
C2 +L1432:           {rows.map((r) => {
C2 +L1433:             const abil = selezione ? (selezione.abilitata ? selezione.abilitata(r) : true) : false;
C2 +L1434:             return (
C2 +L1435:               <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onApri(r)}>
C2 +L1436:                 {selezione && (
C2 +L1437:                   <TableCell onClick={(e) => e.stopPropagation()} className="align-top">
C2 +L1438:                     <Checkbox
C2 +L1439:                       aria-label="Seleziona richiesta"
C2 +L1440:                       checked={abil ? selezione.checked(r) : false}
C2 +L1441:                       disabled={!abil}
C2 +L1442:                       title={!abil ? selezione.motivo?.(r) : undefined}
C2 +L1443:                       onCheckedChange={() => selezione.onToggle(r)}
C2 +L1444:                     />
C2 +L1445:                   </TableCell>
C2 +L1446:                 )}
C2 +L1447:                 <TableCell className="align-top min-w-0 whitespace-normal">
C2 +L1448:                   <div className="flex items-start gap-2 min-w-0">
C2 +L1449:                     <SemaforoPallino cliente={r.clienti} className="mt-1.5 shrink-0" />
C2 +L1450:                     <span className="min-w-0 break-words font-medium">{r.clienti?.ragione_sociale ?? "—"}</span>
C2 +L1451:                   </div>
C2 +L1452:                   <div className="mt-1 flex flex-wrap items-center gap-1">{badge(r)}</div>
C2 +L1453:                   <div className="mt-1 text-xs text-muted-foreground break-words">{dettagli(r).join(" · ")}</div>
C2 +L1454:                 </TableCell>
C2 +L1455:                 <TableCell className="align-top text-right tabular-nums whitespace-normal">{importo(r)}</TableCell>
C2 +L1456:                 <TableCell className="align-top whitespace-normal"><div className="flex flex-col items-start gap-1">{stato(r)}</div></TableCell>
C2 +L1457:                 <TableCell className="align-top text-right" onClick={(e) => e.stopPropagation()}>
C2 +L1458:                   <Button variant="outline" size="sm" onClick={() => onApri(r)}>Apri</Button>
C2 +L1459:                 </TableCell>
C2 +L1460:               </TableRow>
C2 +L1461:             );
C2 +L1462:           })}
C2 +L1463:         </TableBody>
C2 +L1464:       </Table>
C2 +L1465:     </div>
C2 +L1466:   );
C2 +L1467: }
C2 +L1468: 
```

### src/styles.css

```text
C3 +L9: /* tablet = schermo touch senza mouse da 768px, escluso il telefono in orizzontale (complemento di pv-orizzontale); gemello JS in src/hooks/use-tablet.ts (FM79) */
C3 +L10: @custom-variant tablet { @media (pointer: coarse) and (hover: none) and (min-width: 768px) and (min-height: 501px) { @slot; } }
```



## Fetta 5 — Commerciale (17/11/2026)

Base: `9fbfa470804808f7c58d61ec865330e1e77f7928`. Codice verificato: `928dfd0246fa994a798a1bbe983f6dabb92129c4`. Solo cinque route commerciali; nessuna migrazione, dati, query, permessi, handler o logo modificati.

### A. Prova statica

Stesso criterio delle quattro categorie sopra; si contano separatamente aggiunte e rimozioni. ClassName prima assente con soli token tablet rientra in C1. C2 comprende anche le righe originali conservate nelle sostituzioni JSX con discendenti tablet.

| Categoria | Aggiunte | Rimosse | Totale |
|---|---:|---:|---:|
| 1 | 88 | 90 | 178 |
| 2 | 28 | 3 | 31 |
| 3 | 0 | 0 | 0 |
| 4 | 8 | 0 | 8 |

**ALTRO, elenco completo:**

- `src/routes/_app/cantieri.tsx:+12` — `import { useIsTablet } from "@/hooks/use-tablet";`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.

- `src/routes/_app/cantieri.tsx:+62` — `const isTablet = useIsTablet();`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.

- `src/routes/_app/contatti.tsx:+8` — `import { useIsTablet } from "@/hooks/use-tablet";`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.

- `src/routes/_app/contatti.tsx:+35` — `const isTablet = useIsTablet();`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.

- `src/routes/_app/lead.index.tsx:+18` — `import { useIsTablet } from "@/hooks/use-tablet";`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.

- `src/routes/_app/lead.index.tsx:+94` — `const isTablet = useIsTablet();`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.


- `src/routes/_app/opportunita.index.tsx:+10` — `import { useIsTablet } from "@/hooks/use-tablet";`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.

- `src/routes/_app/opportunita.index.tsx:+45` — `const isTablet = useIsTablet();`. Import/invocazione hook fuori dal ramo: listener matchMedia anche su telefono/PC, ma valore false e nessun cambiamento visivo, di dati o dei gestori.


Il hook conserva false al primo render/SSR; dopo useEffect diventa true soltanto sul tablet. Le classi CSS tablet possono essere già attive prima del hook: il brevissimo layout iniziale è quindi misto, non necessariamente la vista PC completa. Tutte le prop finoA mantengono md nel ramo false; tutti i nuovi testi sono condizionati a isTablet. Nessuna riga ALTRO cambia telefono/PC.

### B. Fotografie originali/attuali

15 coppie sequenziali: cinque pagine × 375×812 touch, 1280×800 mouse e 1440×900 mouse, fixture 14 righe (calendario: 14 attività). 13 coppie subito identiche; due diverse a 375 (/lead, /opportunita) ripetute da sole secondo 3+3.

| Coppia | Tre originali stabili | Tre attuali stabili | Esito |
|---|---|---|---|
| Lead 375 | Sì | No | Rumore; primo originale/attuale identici |
| Opportunità 375 | No | No | Rumore |

**Differenze VERE: 0 a 375; 0 a 1280; 0 a 1440.** Non si afferma che ogni scatto sia identico: le due serie instabili sono rumore secondo il criterio richiesto. Originali caricati nel browser mediante transpilation esbuild e intercettazione dei cinque moduli storici, senza sostituire il codice app; nessun confronto di schermi d’errore accettato.

### C. Misure touch

Per ciascuna pagina misurati DOM completo, overflow orizzontale, testi stretti e controlli visibili; fotografie ai quattro formati. Le checkbox esistenti hanno icona 16/20px e pseudo-elemento after con inset -12px: il target effettivo è 40/44px, non la sola icona. Si misura tale area, senza cambiarne la presentazione.

| Pagina | Dimensione | Px nascosti | Una lettera/riga | Target <40px |
|---|---|---:|---:|---:|
| /lead | 768 | 0 | 0 | 0 |
| /opportunita | 768 | 0 | 0 | 0 |
| /contatti | 768 | 0 | 0 | 0 |
| /cantieri | 768 | 0 | 0 | 0 |
| /calendario-commerciale | 768 | 0 | 0 | 0 |
| /lead | 820 | 0 | 0 | 0 |
| /opportunita | 820 | 0 | 0 | 0 |
| /contatti | 820 | 0 | 0 | 0 |
| /cantieri | 820 | 0 | 0 | 0 |
| /calendario-commerciale | 820 | 0 | 0 | 0 |
| /lead | 1180 | 0 | 0 | 0 |
| /opportunita | 1180 | 0 | 0 | 0 |
| /contatti | 1180 | 0 | 0 | 0 |
| /cantieri | 1180 | 0 | 0 | 0 |
| /calendario-commerciale | 1180 | 0 | 0 | 0 |
| /lead | 1366 | 0 | 0 | 0 |
| /opportunita | 1366 | 0 | 0 | 0 |
| /contatti | 1366 | 0 | 0 | 0 |
| /cantieri | 1366 | 0 | 0 | 0 |
| /calendario-commerciale | 1366 | 0 | 0 | 0 |

Tutte le venti misure: 0/0/0. Screenshot controllati: schede verticali, nomi e città leggibili, tabelle orizzontali essenziali; calendario giorni e pulsanti almeno 40px. Nessun errore app nelle prove definitive. Le prove con fixture verificano presentazione, non flussi reali o permessi.

### D. Test

`bun test`: **1019 pass, 0 fail**, 3433 asserzioni in 137 file. Build automatico OK. Artefatti temporanei in /tmp/browser/fm79-f5. Nessuna nuova fonte di business o modifica delle regole responsive; riutilizzati hook e variante esistenti.

### Appendice: ogni riga della fetta

```text
C1 src/routes/_app/calendario-commerciale.tsx -L279:           <div className="flex items-center gap-2">
C1 src/routes/_app/calendario-commerciale.tsx +L279:           <div className="flex items-center gap-2 tablet:min-h-10 tablet:[&_[role=switch]]:min-h-10 tablet:[&_[role=switch]]:min-w-10">
C1 src/routes/_app/calendario-commerciale.tsx -L303:       <Card className="p-2 sm:p-4 overflow-x-hidden">
C1 src/routes/_app/calendario-commerciale.tsx +L303:       <Card className="p-2 sm:p-4 overflow-x-hidden tablet:[&_.fc-button]:min-h-10 tablet:[&_.fc-button]:min-w-10 tablet:[&_.fc-toolbar]:flex-wrap tablet:[&_.fc-toolbar]:gap-3 tablet:[&_.fc-daygrid-day-frame]:min-h-20 tablet:[&_.fc-daygrid-day-number]:inline-flex tablet:[&_.fc-daygrid-day-number]:min-h-10 tablet:[&_.fc-daygrid-day-number]:min-w-10 tablet:[&_.fc-daygrid-day-number]:items-center tablet:[&_.fc-daygrid-day-number]:justify-center tablet:[&_.fc-event]:min-h-10 tablet:[&_.fc-event-title]:whitespace-normal tablet:[&_.fc-event-title]:break-words">
C4 src/routes/_app/cantieri.tsx +L12: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/cantieri.tsx +L62:   const isTablet = useIsTablet();
C1 src/routes/_app/cantieri.tsx -L249:         <TabsList>
C1 src/routes/_app/cantieri.tsx -L250:           <TabsTrigger value="lista">Lista</TabsTrigger>
C1 src/routes/_app/cantieri.tsx -L251:           <TabsTrigger value="mappa">Mappa</TabsTrigger>
C1 src/routes/_app/cantieri.tsx +L251:         <TabsList className="tablet:h-auto">
C1 src/routes/_app/cantieri.tsx +L252:           <TabsTrigger className="tablet:min-h-10" value="lista">Lista</TabsTrigger>
C1 src/routes/_app/cantieri.tsx +L253:           <TabsTrigger className="tablet:min-h-10" value="mappa">Mappa</TabsTrigger>
C2 src/routes/_app/cantieri.tsx -L272:               <ElencoSchede>
C2 src/routes/_app/cantieri.tsx +L274:               <ElencoSchede finoA={isTablet ? "lg" : "md"}>
C1 src/routes/_app/cantieri.tsx -L318:               <Card className="hidden md:block">
C1 src/routes/_app/cantieri.tsx -L319:                 <Table>
C1 src/routes/_app/cantieri.tsx +L320:               <Card className="hidden md:block tablet:max-lg:hidden">
C1 src/routes/_app/cantieri.tsx +L321:                 <Table className="tablet:table-fixed tablet:[&_td]:whitespace-normal tablet:[&_td]:break-normal tablet:[&_th]:whitespace-normal" >
C1 src/routes/_app/cantieri.tsx -L322:                       <TableHead>Nome</TableHead>
C1 src/routes/_app/cantieri.tsx -L323:                       <TableHead>Cliente / Lead</TableHead>
C1 src/routes/_app/cantieri.tsx -L324:                       <TableHead>Indirizzo</TableHead>
C1 src/routes/_app/cantieri.tsx -L325:                       <TableHead>Geocodifica</TableHead>
C1 src/routes/_app/cantieri.tsx -L326:                       <TableHead>Sede più vicina</TableHead>
C1 src/routes/_app/cantieri.tsx -L327:                       <TableHead>Agente</TableHead>
C1 src/routes/_app/cantieri.tsx +L324:                       <TableHead className="tablet:w-[42%]">Nome</TableHead>
C1 src/routes/_app/cantieri.tsx +L325:                       <TableHead className="tablet:w-[28%]">Cliente / Lead</TableHead>
C1 src/routes/_app/cantieri.tsx +L326:                       <TableHead className="tablet:hidden">Indirizzo</TableHead>
C1 src/routes/_app/cantieri.tsx +L327:                       <TableHead className="tablet:hidden">Geocodifica</TableHead>
C1 src/routes/_app/cantieri.tsx +L328:                       <TableHead className="tablet:hidden">Sede più vicina</TableHead>
C1 src/routes/_app/cantieri.tsx +L329:                       <TableHead className="tablet:hidden">Agente</TableHead>
C1 src/routes/_app/cantieri.tsx -L329:                       <TableHead className="w-32" />
C1 src/routes/_app/cantieri.tsx +L331:                       <TableHead className="w-32 tablet:w-24" />
C2 src/routes/_app/cantieri.tsx +L341:                             {isTablet && <div className="space-y-1 text-xs font-normal text-muted-foreground">
C2 src/routes/_app/cantieri.tsx +L342:                               <div>{indirizzoCompleto(c) || "—"}</div>
C2 src/routes/_app/cantieri.tsx +L343:                               <div>Sede più vicina: {testoSedeVicina(c) ?? "—"}</div>
C2 src/routes/_app/cantieri.tsx +L344:                               <div>Agente: {c.agente_codice ? (agenteLabel.get(c.agente_codice) ?? c.agente_codice) : "—"}</div>
C2 src/routes/_app/cantieri.tsx +L345:                               <Badge variant="outline" className={GEO_CLASS[s]}>{GEO_LABEL[s]}</Badge>
C2 src/routes/_app/cantieri.tsx +L346:                             </div>}
C1 src/routes/_app/cantieri.tsx -L348:                           <TableCell className="text-sm text-muted-foreground">{indirizzoCompleto(c) || "—"}</TableCell>
C1 src/routes/_app/cantieri.tsx -L349:                           <TableCell>
C1 src/routes/_app/cantieri.tsx +L356:                           <TableCell className="text-sm text-muted-foreground tablet:hidden">{indirizzoCompleto(c) || "—"}</TableCell>
C1 src/routes/_app/cantieri.tsx +L357:                           <TableCell className="tablet:hidden">
C1 src/routes/_app/cantieri.tsx -L355:                           <TableCell className="text-sm">{testoSedeVicina(c) ?? "—"}</TableCell>
C1 src/routes/_app/cantieri.tsx -L356:                           <TableCell className="text-sm">
C1 src/routes/_app/cantieri.tsx +L363:                           <TableCell className="text-sm tablet:hidden">{testoSedeVicina(c) ?? "—"}</TableCell>
C1 src/routes/_app/cantieri.tsx +L364:                           <TableCell className="text-sm tablet:hidden">
C1 src/routes/_app/cantieri.tsx -L365:                             <div className="flex items-center gap-0.5">
C1 src/routes/_app/cantieri.tsx +L373:                             <div className="flex items-center gap-0.5 tablet:flex-col tablet:gap-2">
C1 src/routes/_app/cantieri.tsx -L456:       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
C1 src/routes/_app/cantieri.tsx +L464:       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 tablet:grid-cols-2 tablet:lg:grid-cols-3">
C4 src/routes/_app/contatti.tsx +L8: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/contatti.tsx +L35:   const isTablet = useIsTablet();
C1 src/routes/_app/contatti.tsx -L135:         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
C1 src/routes/_app/contatti.tsx -L136:           <div className="lg:col-span-2">
C1 src/routes/_app/contatti.tsx +L137:         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tablet:grid-cols-2 tablet:lg:grid-cols-3">
C1 src/routes/_app/contatti.tsx +L138:           <div className="lg:col-span-2 tablet:col-span-full">
C1 src/routes/_app/contatti.tsx -L190:           <div className="md:hidden p-3">
C2 src/routes/_app/contatti.tsx -L191:           <ElencoSchede>
C1 src/routes/_app/contatti.tsx +L192:           <div className="md:hidden p-3 tablet:max-lg:block">
C2 src/routes/_app/contatti.tsx +L193:           <ElencoSchede finoA={isTablet ? "lg" : "md"}>
C1 src/routes/_app/contatti.tsx -L231:           <div className="hidden md:block">
C1 src/routes/_app/contatti.tsx -L232:           <Table>
C1 src/routes/_app/contatti.tsx +L233:           <div className="hidden md:block tablet:max-lg:hidden">
C1 src/routes/_app/contatti.tsx +L234:           <Table className="tablet:table-fixed tablet:[&_td]:whitespace-normal tablet:[&_td]:break-normal tablet:[&_th]:whitespace-normal" >
C1 src/routes/_app/contatti.tsx -L236:                 <TableHead>Nome</TableHead>
C1 src/routes/_app/contatti.tsx -L237:                 <TableHead>Cliente</TableHead>
C1 src/routes/_app/contatti.tsx -L238:                 <TableHead>Ruolo</TableHead>
C1 src/routes/_app/contatti.tsx -L239:                 <TableHead>Email</TableHead>
C1 src/routes/_app/contatti.tsx -L240:                 <TableHead>Cellulare</TableHead>
C1 src/routes/_app/contatti.tsx +L238:                 <TableHead className="tablet:w-[25%]">Nome</TableHead>
C1 src/routes/_app/contatti.tsx +L239:                 <TableHead className="tablet:w-[30%]">Cliente</TableHead>
C1 src/routes/_app/contatti.tsx +L240:                 <TableHead className="tablet:hidden">Ruolo</TableHead>
C1 src/routes/_app/contatti.tsx +L241:                 <TableHead className="tablet:w-[30%]">Email</TableHead>
C1 src/routes/_app/contatti.tsx +L242:                 <TableHead className="tablet:hidden">Cellulare</TableHead>
C1 src/routes/_app/contatti.tsx -L242:                 <TableHead>Data firma</TableHead>
C1 src/routes/_app/contatti.tsx +L244:                 <TableHead className="tablet:hidden">Data firma</TableHead>
C1 src/routes/_app/contatti.tsx -L257:                     <div className="flex items-center gap-1.5">
C1 src/routes/_app/contatti.tsx +L259:                     <div className="flex items-center gap-1.5 tablet:flex-wrap">
C2 src/routes/_app/contatti.tsx +L263:                     {isTablet && <div className="text-xs font-normal text-muted-foreground">{c.ruolo ?? "—"}<div>Data firma: {fmtDate(c.data_firma)}</div></div>}
C1 src/routes/_app/contatti.tsx -L266:                   <TableCell className="text-muted-foreground">{c.ruolo ?? "—"}</TableCell>
C1 src/routes/_app/contatti.tsx -L267:                   <TableCell className="text-muted-foreground text-xs">{c.email ?? "—"}</TableCell>
C1 src/routes/_app/contatti.tsx -L268:                   <TableCell className="text-muted-foreground">{c.cellulare ?? "—"}</TableCell>
C1 src/routes/_app/contatti.tsx +L269:                   <TableCell className="text-muted-foreground tablet:hidden">{c.ruolo ?? "—"}</TableCell>
C2 src/routes/_app/contatti.tsx +L270:                   <TableCell className="text-muted-foreground text-xs tablet:break-words">{c.email ?? "—"}{isTablet && <div className="mt-1">{c.cellulare ?? "—"}</div>}</TableCell>
C2 src/routes/_app/contatti.tsx +L271:                   <TableCell className="text-muted-foreground tablet:hidden">{c.cellulare ?? "—"}</TableCell>
C1 src/routes/_app/contatti.tsx -L277:                   <TableCell className="text-muted-foreground">{fmtDate(c.data_firma)}</TableCell>
C1 src/routes/_app/contatti.tsx +L280:                   <TableCell className="text-muted-foreground tablet:hidden">{fmtDate(c.data_firma)}</TableCell>
C4 src/routes/_app/lead.index.tsx +L18: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/lead.index.tsx +L94:   const isTablet = useIsTablet();
C1 src/routes/_app/lead.index.tsx -L417:         className="flex items-center gap-1 font-medium hover:text-primary transition-colors"
C1 src/routes/_app/lead.index.tsx +L419:         className="flex items-center gap-1 font-medium hover:text-primary transition-colors tablet:min-h-10 tablet:min-w-10"
C1 src/routes/_app/lead.index.tsx -L494:         <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
C1 src/routes/_app/lead.index.tsx -L495:           <TabsTrigger value="attivi" className="gap-1.5">
C1 src/routes/_app/lead.index.tsx +L496:         <TabsList className="w-full justify-start overflow-x-auto sm:w-auto tablet:h-auto tablet:flex-wrap">
C1 src/routes/_app/lead.index.tsx +L497:           <TabsTrigger value="attivi" className="gap-1.5 tablet:min-h-10">
C1 src/routes/_app/lead.index.tsx -L498:           <TabsTrigger value="ricontattare" className="gap-1.5">
C1 src/routes/_app/lead.index.tsx +L500:           <TabsTrigger value="ricontattare" className="gap-1.5 tablet:min-h-10">
C1 src/routes/_app/lead.index.tsx -L502:           <TabsTrigger value="convertiti" className="gap-1.5">
C1 src/routes/_app/lead.index.tsx +L504:           <TabsTrigger value="convertiti" className="gap-1.5 tablet:min-h-10">
C1 src/routes/_app/lead.index.tsx -L505:           <TabsTrigger value="persi" className="gap-1.5">
C1 src/routes/_app/lead.index.tsx +L507:           <TabsTrigger value="persi" className="gap-1.5 tablet:min-h-10">
C1 src/routes/_app/lead.index.tsx -L570:         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
C1 src/routes/_app/lead.index.tsx +L572:         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 tablet:grid-cols-2 tablet:lg:grid-cols-3">
C1 src/routes/_app/lead.index.tsx -L572:           <div className="lg:col-span-2">
C1 src/routes/_app/lead.index.tsx +L574:           <div className="lg:col-span-2 tablet:col-span-full">
C1 src/routes/_app/lead.index.tsx -L718:               className="text-primary hover:underline disabled:opacity-60"
C1 src/routes/_app/lead.index.tsx +L720:               className="text-primary hover:underline disabled:opacity-60 tablet:min-h-10"
C2 src/routes/_app/lead.index.tsx +L753:             finoA={isTablet ? "lg" : "md"}
C2 src/routes/_app/lead.index.tsx +L775:                   ...(isTablet ? [{ etichetta: "Sede / Agente", valore: `${nomeStore(l.store_id)}${l.agente_codice ? ` · ${l.agente_codice}` : ""}` }] : []),
C1 src/routes/_app/lead.index.tsx -L803:           <div className="hidden md:block">
C1 src/routes/_app/lead.index.tsx -L804:             <Table>
C1 src/routes/_app/lead.index.tsx +L807:           <div className="hidden md:block tablet:max-lg:hidden">
C1 src/routes/_app/lead.index.tsx +L808:             <Table className="tablet:table-fixed tablet:[&_td]:whitespace-normal tablet:[&_td]:break-normal tablet:[&_th]:whitespace-normal" >
C1 src/routes/_app/lead.index.tsx -L808:                     <TableHead className="w-10">
C1 src/routes/_app/lead.index.tsx +L812:                     <TableHead className="w-10 tablet:w-14">
C1 src/routes/_app/lead.index.tsx -L816:                   <TableHead><SortHeader col="ragione_sociale" label="Nominativo" /></TableHead>
C1 src/routes/_app/lead.index.tsx -L817:                   <TableHead>Tipo soggetto</TableHead>
C1 src/routes/_app/lead.index.tsx +L820:                   <TableHead className="tablet:w-[42%]"><SortHeader col="ragione_sociale" label="Nominativo" /></TableHead>
C1 src/routes/_app/lead.index.tsx +L821:                   <TableHead className="tablet:hidden">Tipo soggetto</TableHead>
C1 src/routes/_app/lead.index.tsx -L819:                   <TableHead>Tipo lead</TableHead>
C1 src/routes/_app/lead.index.tsx +L823:                   <TableHead className="tablet:hidden">Tipo lead</TableHead>
C1 src/routes/_app/lead.index.tsx -L821:                   <TableHead>Fonte</TableHead>
C1 src/routes/_app/lead.index.tsx -L822:                   <TableHead>Città</TableHead>
C1 src/routes/_app/lead.index.tsx -L823:                   <TableHead>Sede / Agente</TableHead>
C1 src/routes/_app/lead.index.tsx -L824:                   <TableHead>Assegnato a</TableHead>
C1 src/routes/_app/lead.index.tsx +L825:                   <TableHead className="tablet:hidden">Fonte</TableHead>
C1 src/routes/_app/lead.index.tsx +L826:                   <TableHead className="tablet:hidden">Città</TableHead>
C1 src/routes/_app/lead.index.tsx +L827:                   <TableHead className="tablet:hidden">Sede / Agente</TableHead>
C1 src/routes/_app/lead.index.tsx +L828:                   <TableHead className="tablet:hidden">Assegnato a</TableHead>
C1 src/routes/_app/lead.index.tsx -L827:                       <TableHead><SortHeader col="convertito_il" label="Data conversione" /></TableHead>
C1 src/routes/_app/lead.index.tsx -L828:                       <TableHead>Cliente</TableHead>
C1 src/routes/_app/lead.index.tsx +L831:                       <TableHead className="tablet:hidden"><SortHeader col="convertito_il" label="Data conversione" /></TableHead>
C1 src/routes/_app/lead.index.tsx +L832:                       <TableHead className="tablet:hidden">Cliente</TableHead>
C1 src/routes/_app/lead.index.tsx -L833:                   <TableHead><SortHeader col="created_at" label="Creato" /></TableHead>
C1 src/routes/_app/lead.index.tsx +L837:                   <TableHead className="tablet:hidden"><SortHeader col="created_at" label="Creato" /></TableHead>
C1 src/routes/_app/lead.index.tsx -L845:                       <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
C1 src/routes/_app/lead.index.tsx +L849:                       <TableCell className="w-10 tablet:w-14" onClick={(e) => e.stopPropagation()}>
C1 src/routes/_app/lead.index.tsx -L853:                     <TableCell className="font-medium">{nomeLead(l)}</TableCell>
C1 src/routes/_app/lead.index.tsx -L854:                     <TableCell className="text-xs text-muted-foreground">
C1 src/routes/_app/lead.index.tsx +L857:                     <TableCell className="font-medium tablet:whitespace-normal tablet:break-normal">{nomeLead(l)}
C2 src/routes/_app/lead.index.tsx +L858:                       {isTablet && <div className="space-y-1 text-xs font-normal text-muted-foreground">
C2 src/routes/_app/lead.index.tsx +L859:                         <div>{etichettaTipoSoggetto(l.tipo_soggetto)} · {LEAD_TIPO_LABEL[l.tipo_lead]} · {LEAD_FONTE_LABEL[l.fonte]}</div>
C2 src/routes/_app/lead.index.tsx +L860:                         <div>{l.citta ?? "—"}{l.provincia ? ` (${l.provincia})` : ""}</div>
C2 src/routes/_app/lead.index.tsx +L861:                         <div>{nomeStore(l.store_id)}{l.agente_codice ? ` · ${l.agente_codice}` : ""}</div>
C2 src/routes/_app/lead.index.tsx +L862:                         <div>Assegnato a: {nomeProfilo(l.assegnato_a)}</div>
C2 src/routes/_app/lead.index.tsx +L863:                         <div>Creato: {formatData(l.created_at)}</div>
C2 src/routes/_app/lead.index.tsx +L864:                         {mostraConversione && <div>Convertito: {formatData(l.convertito_il)} · {l.cliente?.ragione_sociale ?? "Cliente non collegato"}</div>}
C2 src/routes/_app/lead.index.tsx +L865:                       </div>}
C2 src/routes/_app/lead.index.tsx +L866:                     </TableCell>
C1 src/routes/_app/lead.index.tsx +L867:                     <TableCell className="text-xs text-muted-foreground tablet:hidden">
C1 src/routes/_app/lead.index.tsx -L859:                     <TableCell className="text-xs">{LEAD_TIPO_LABEL[l.tipo_lead]}</TableCell>
C1 src/routes/_app/lead.index.tsx +L872:                     <TableCell className="text-xs tablet:hidden">{LEAD_TIPO_LABEL[l.tipo_lead]}</TableCell>
C1 src/routes/_app/lead.index.tsx -L861:                     <TableCell className="text-xs">{LEAD_FONTE_LABEL[l.fonte]}</TableCell>
C1 src/routes/_app/lead.index.tsx -L862:                     <TableCell className="text-xs">
C1 src/routes/_app/lead.index.tsx +L874:                     <TableCell className="text-xs tablet:hidden">{LEAD_FONTE_LABEL[l.fonte]}</TableCell>
C1 src/routes/_app/lead.index.tsx +L875:                     <TableCell className="text-xs tablet:hidden">
C1 src/routes/_app/lead.index.tsx -L865:                     <TableCell className="text-xs">
C1 src/routes/_app/lead.index.tsx +L878:                     <TableCell className="text-xs tablet:hidden">
C1 src/routes/_app/lead.index.tsx -L868:                     <TableCell className="text-xs">{nomeProfilo(l.assegnato_a)}</TableCell>
C1 src/routes/_app/lead.index.tsx +L881:                     <TableCell className="text-xs tablet:hidden">{nomeProfilo(l.assegnato_a)}</TableCell>
C1 src/routes/_app/lead.index.tsx -L871:                         <TableCell className="text-xs">{formatData(l.convertito_il)}</TableCell>
C1 src/routes/_app/lead.index.tsx -L872:                         <TableCell className="text-xs" onClick={(e) => e.stopPropagation()}>
C1 src/routes/_app/lead.index.tsx +L884:                         <TableCell className="text-xs tablet:hidden">{formatData(l.convertito_il)}</TableCell>
C1 src/routes/_app/lead.index.tsx +L885:                         <TableCell className="text-xs tablet:hidden" onClick={(e) => e.stopPropagation()}>
C1 src/routes/_app/lead.index.tsx -L877:                               className="text-primary hover:underline"
C1 src/routes/_app/lead.index.tsx +L890:                               className="text-primary hover:underline tablet:inline-flex tablet:min-h-10"
C1 src/routes/_app/lead.index.tsx -L893:                     <TableCell className="text-xs">{formatData(l.created_at)}</TableCell>
C1 src/routes/_app/lead.index.tsx +L906:                     <TableCell className="text-xs tablet:hidden">{formatData(l.created_at)}</TableCell>
C4 src/routes/_app/opportunita.index.tsx +L10: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/opportunita.index.tsx +L45:   const isTablet = useIsTablet();
C1 src/routes/_app/opportunita.index.tsx -L193:           <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
C1 src/routes/_app/opportunita.index.tsx +L195:           <div className="grid grid-cols-1 md:grid-cols-4 gap-3 tablet:grid-cols-2 tablet:lg:grid-cols-3">
C2 src/routes/_app/opportunita.index.tsx -L231:             <ElencoSchede>
C2 src/routes/_app/opportunita.index.tsx +L233:             <ElencoSchede finoA={isTablet ? "lg" : "md"}>
C1 src/routes/_app/opportunita.index.tsx -L236:                     <Link to="/opportunita/$opportunitaId" params={{ opportunitaId: o.id }} className="hover:underline">
C1 src/routes/_app/opportunita.index.tsx +L238:                     <Link to="/opportunita/$opportunitaId" params={{ opportunitaId: o.id }} className="hover:underline tablet:inline-flex tablet:min-h-10 tablet:items-center tablet:whitespace-normal tablet:break-normal">
C1 src/routes/_app/opportunita.index.tsx -L251:                         <SelectTrigger className="h-8 w-[150px]">
C1 src/routes/_app/opportunita.index.tsx +L253:                         <SelectTrigger className="h-8 w-[150px] tablet:w-full tablet:min-w-0 tablet:[&_span]:whitespace-normal">
C1 src/routes/_app/opportunita.index.tsx -L277:             <div className="hidden md:block">
C1 src/routes/_app/opportunita.index.tsx -L278:               <Table>
C1 src/routes/_app/opportunita.index.tsx +L279:             <div className="hidden md:block tablet:max-lg:hidden">
C1 src/routes/_app/opportunita.index.tsx +L280:               <Table className="tablet:table-fixed tablet:[&_td]:whitespace-normal tablet:[&_td]:break-normal tablet:[&_th]:whitespace-normal" >
C1 src/routes/_app/opportunita.index.tsx -L281:                     <TableHead>Titolo</TableHead>
C1 src/routes/_app/opportunita.index.tsx -L282:                     <TableHead>Soggetto</TableHead>
C1 src/routes/_app/opportunita.index.tsx -L283:                     <TableHead>Tipo</TableHead>
C1 src/routes/_app/opportunita.index.tsx -L284:                     <TableHead>Stato</TableHead>
C1 src/routes/_app/opportunita.index.tsx +L283:                     <TableHead className="tablet:w-[25%]">Titolo</TableHead>
C1 src/routes/_app/opportunita.index.tsx +L284:                     <TableHead className="tablet:w-[25%]">Soggetto</TableHead>
C1 src/routes/_app/opportunita.index.tsx +L285:                     <TableHead className="tablet:hidden">Tipo</TableHead>
C1 src/routes/_app/opportunita.index.tsx +L286:                     <TableHead className="tablet:w-[20%]">Stato</TableHead>
C1 src/routes/_app/opportunita.index.tsx -L286:                     <TableHead>Agente</TableHead>
C1 src/routes/_app/opportunita.index.tsx -L287:                     <TableHead>Chiusura prevista</TableHead>
C1 src/routes/_app/opportunita.index.tsx -L288:                     <TableHead className="w-20" />
C1 src/routes/_app/opportunita.index.tsx +L288:                     <TableHead className="tablet:hidden">Agente</TableHead>
C1 src/routes/_app/opportunita.index.tsx +L289:                     <TableHead className="tablet:hidden">Chiusura prevista</TableHead>
C1 src/routes/_app/opportunita.index.tsx +L290:                     <TableHead className="w-20 tablet:w-24" />
C1 src/routes/_app/opportunita.index.tsx -L298:                           className="hover:underline"
C1 src/routes/_app/opportunita.index.tsx +L300:                           className="hover:underline tablet:inline-flex tablet:min-h-10 tablet:items-center tablet:whitespace-normal tablet:break-normal"
C2 src/routes/_app/opportunita.index.tsx +L304:                         {isTablet && <div className="space-y-1 text-xs font-normal text-muted-foreground">
C2 src/routes/_app/opportunita.index.tsx +L305:                           <div>{TIPO_LABEL[o.tipo]}</div>
C2 src/routes/_app/opportunita.index.tsx +L306:                           <div>Agente: {o.agente_codice ? (agenteLabel.get(o.agente_codice) ?? o.agente_codice) : "—"}</div>
C2 src/routes/_app/opportunita.index.tsx +L307:                           <div>Chiusura prevista: {fmtData(o.data_prevista_chiusura)}</div>
C2 src/routes/_app/opportunita.index.tsx +L308:                         </div>}
C1 src/routes/_app/opportunita.index.tsx -L304:                         <div className="flex items-center gap-2">
C1 src/routes/_app/opportunita.index.tsx +L311:                         <div className="flex items-center gap-2 tablet:flex-col tablet:items-start">
C1 src/routes/_app/opportunita.index.tsx -L308:                           <span className="truncate">{nomeSoggetto(o)}</span>
C1 src/routes/_app/opportunita.index.tsx +L315:                           <span className="truncate tablet:whitespace-normal tablet:break-normal">{nomeSoggetto(o)}</span>
C1 src/routes/_app/opportunita.index.tsx -L311:                       <TableCell>{TIPO_LABEL[o.tipo]}</TableCell>
C1 src/routes/_app/opportunita.index.tsx +L318:                       <TableCell className="tablet:hidden">{TIPO_LABEL[o.tipo]}</TableCell>
C1 src/routes/_app/opportunita.index.tsx -L314:                           <SelectTrigger className="h-8 w-[150px]">
C1 src/routes/_app/opportunita.index.tsx +L321:                           <SelectTrigger className="h-8 w-[150px] tablet:w-full tablet:min-w-0 tablet:[&_span]:whitespace-normal">
C1 src/routes/_app/opportunita.index.tsx -L325:                       <TableCell>{o.agente_codice ? (agenteLabel.get(o.agente_codice) ?? o.agente_codice) : "—"}</TableCell>
C1 src/routes/_app/opportunita.index.tsx -L326:                       <TableCell>{fmtData(o.data_prevista_chiusura)}</TableCell>
C1 src/routes/_app/opportunita.index.tsx +L332:                       <TableCell className="tablet:hidden">{o.agente_codice ? (agenteLabel.get(o.agente_codice) ?? o.agente_codice) : "—"}</TableCell>
C1 src/routes/_app/opportunita.index.tsx +L333:                       <TableCell className="tablet:hidden">{fmtData(o.data_prevista_chiusura)}</TableCell>
C1 src/routes/_app/opportunita.index.tsx -L328:                         <div className="flex items-center gap-0.5">
C1 src/routes/_app/opportunita.index.tsx +L335:                         <div className="flex items-center gap-0.5 tablet:flex-col tablet:gap-2">
```
