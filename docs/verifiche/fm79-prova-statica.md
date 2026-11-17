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


## Fetta 6 — Finestre e tastiera (17/11/2026)

Base `964f7b8b9c3fb5720d6cf3dda3c25ed8d9325fe4`; codice verificato `2ab19e342a2c4d4b2c30f398885e14db51baca3a`. Solo dialog.tsx, sheet.tsx, alert-dialog.tsx; viewport, query, dati e permessi invariati.

### A. Diff

| Categoria | Aggiunte | Rimosse | Totale |
|---|---:|---:|---:|
| 1 — classi tablet | 8 | 8 | 16 |
| 2 — rami tablet | 0 | 0 | 0 |
| 3 — hook/variante nuovi | 0 | 0 | 0 |
| ALTRO | 0 | 0 | 0 |

Ogni token preesistente conservato nello stesso ordine: tolti soltanto i token tablet aggiunti si recupera la stringa originale. Nessun ALTRO. Nessun nuovo modulo o fonte unica: piedi e limiti sono nei componenti condivisi già esistenti. Nessuna correzione locale applicata; PDF e compose con scroll interno conservano struttura e handler (non certificati con documento reale in questa verifica).

### B. Fotografie sequenziali

Quattro finestre realmente aperte attraverso i pulsanti delle pagine: Nuovo preventivo, Nuovo lead, Nuova opportunità, conferma eliminazione opportunità (senza confermare). Tre dimensioni: 375×812 touch, 1280×800 e 1440×900 mouse. Backend intercettato con fixture, nessuna scrittura.

12 coppie: 11 identiche subito; conferma 1440 diversa in un sottile tratto dello sfondo. Ripetuta da sola 3 originali + 3 attuali: entrambi i gruppi instabili, prima coppia dei gruppi identica → rumore. Originale nel 3+3 ottenuto intercettando i tre moduli e rimuovendo solo le classi tablet aggiunte (equivalenza verificata dal diff). **Differenze VERE: 0**.

### C. Misure

| Finestra | Dimensioni | Dentro schermo | Piede visibile senza scroll iniziale | Target <40px |
|---|---|---|---|---:|
| preventivo | 768×1024, 820×1180, 1180×820, 1366×1024 | Sì in tutte | Sì in tutte | 0 in tutte |
| lead | 768×1024, 820×1180, 1180×820, 1366×1024 | Sì in tutte | Sì in tutte | 0 in tutte |
| opportunita | 768×1024, 820×1180, 1180×820, 1366×1024 | Sì in tutte | Sì in tutte | 0 in tutte |
| conferma | 768×1024, 820×1180, 1180×820, 1366×1024 | Sì in tutte | Sì in tutte | 0 in tutte |

Simulazione: finestra aperta ad altezza piena, poi viewport ridotto e ultimo campo focalizzato.

| Finestra | 820×780: piede/campo | Target <40px | 1180×480: piede/campo | Target <40px |
|---|---|---:|---|---:|
| preventivo | Visibili (conferma senza campo) | 0 | Visibili (conferma senza campo) | 12 |
| lead | Visibili (conferma senza campo) | 0 | Visibili (conferma senza campo) | 9 |
| opportunita | Visibili (conferma senza campo) | 0 | Visibili (conferma senza campo) | 8 |
| conferma | Visibili (conferma senza campo) | 0 | Visibili (conferma senza campo) | 2 |

**Precisazione Andrea, 17/11/2026:** il limite della simulazione a 1180×480 non è un problema reale della tastiera iPad: la tastiera riduce solo il visual viewport, non il layout viewport usato dalla media query, quindi la regola `tablet` resta attiva. Ridurre il viewport Playwright a 480px non riproduce questo comportamento. Regola e meta viewport restano invariati; la verifica finale della tastiera si fa sul dispositivo e non è certificata dagli scatti Chromium.

### D. Test

`bun test`: 1019 pass, 0 fail, 3433 asserzioni, 137 file. Build automatico OK. Screenshot e script temporanei /tmp/browser/fm79-f6; esiti conservati qui.

### Appendice completa

```text
C1 src/components/ui/alert-dialog.tsx -L37:         "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg max-h-[90dvh] overflow-y-auto",
C1 src/components/ui/alert-dialog.tsx +L37:         "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg max-h-[90dvh] overflow-y-auto tablet:max-h-[90dvh] tablet:overflow-y-auto tablet:scroll-pb-24 tablet:[&_button]:min-h-10 tablet:[&_button]:min-w-10",
C1 src/components/ui/alert-dialog.tsx -L53:     className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
C1 src/components/ui/alert-dialog.tsx +L53:     className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 tablet:sticky tablet:bottom-0 tablet:z-10 tablet:bg-background tablet:py-3 tablet:shrink-0 tablet:gap-2", className)}
C1 src/components/ui/dialog.tsx -L41:         "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg max-h-[90vh] max-h-[90dvh] overflow-y-auto",
C1 src/components/ui/dialog.tsx +L41:         "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg max-h-[90vh] max-h-[90dvh] overflow-y-auto tablet:max-h-[90dvh] tablet:overflow-y-auto tablet:scroll-pb-24 tablet:[&_button]:min-h-10 tablet:[&_button]:min-w-10",
C1 src/components/ui/dialog.tsx -L47:       <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
C1 src/components/ui/dialog.tsx +L47:       <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm tablet:min-h-10 tablet:min-w-10 tablet:flex tablet:items-center tablet:justify-center opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
C1 src/components/ui/dialog.tsx -L63:     className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
C1 src/components/ui/dialog.tsx +L63:     className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 tablet:sticky tablet:bottom-0 tablet:z-10 tablet:bg-background tablet:py-3 tablet:shrink-0 tablet:gap-2", className)}
C1 src/components/ui/sheet.tsx -L34:   "fixed z-50 gap-4 bg-background p-4 sm:p-6 shadow-lg overflow-y-auto transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
C1 src/components/ui/sheet.tsx +L34:   "fixed z-50 gap-4 bg-background p-4 sm:p-6 shadow-lg overflow-y-auto tablet:max-h-[100dvh] tablet:overflow-y-auto tablet:scroll-pb-24 tablet:[&_button]:min-h-10 tablet:[&_button]:min-w-10 transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
C1 src/components/ui/sheet.tsx -L64:       <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
C1 src/components/ui/sheet.tsx +L64:       <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm tablet:min-h-10 tablet:min-w-10 tablet:flex tablet:items-center tablet:justify-center opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
C1 src/components/ui/sheet.tsx -L81:     className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
C1 src/components/ui/sheet.tsx +L81:     className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 tablet:sticky tablet:bottom-0 tablet:z-10 tablet:bg-background tablet:py-3 tablet:shrink-0 tablet:gap-2", className)}
```


## Fette 7–8 — Marketing e Utenti (17/11/2026)

Perimetro eseguito: marketing.invii, marketing.campagne (tab Email), marketing.segmenti (elenco Email e nomi dei salvati), marketing/iscritti-whatsapp, utenti. I tre listini acquisto/vendita/matrice NON modificati: rimandati al prossimo giro come autorizzato. Le tabelle WhatsApp incorporate in Campagne/Segmenti non sono modificate; aggiunti soltanto target tablet ai selettori della pagina Campagne.

### A. Prova statica

Base `4a29acf812103dab653b2f4052f241e5bec6c399`; cinque file src. Conteggi delle righe firmate (+ e −, sostituzione = due righe); categoria 2 per le righe miste con JSX aggiunto sotto isTablet, categoria 1 per i soli token tablet e categoria 4 conservativa per import/invocazioni.

| Categoria | Righe |
|---|---:|
| 1 | 201 |
| 2 | 38 |
| 3 | 0 |
| 4 | 10 |
| Totale | 249 |

Tutti i token di classe preesistenti restano, nello stesso ordine; solo aggiunte tablet. Ramo false di Utenti conserva ElencoSchede e contenuto originali. Nuovi dati secondari montati solo con isTablet, usando gli stessi dati già caricati e gli stessi gestori. Nessuna query/mutazione/permesso/calcolo cambiati. Hook false al primo render, poi effetto; nessun ramo attivato su telefono o PC mouse. Nessuna nuova fonte unica o dipendenza; root AGENTS al limite, nessuna regola aggiunta. Head delle pagine esaminati: Campagne/Invii/Segmenti già specifici; Utenti e Iscritti privi di head specifico, non aggiunto in questo perimetro tablet per non cambiare telefono/PC.

#### ALTRO completo

- `src/routes/_app/marketing.campagne.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/marketing.campagne.tsx:134` `+const isTablet = useIsTablet();` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/marketing.invii.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/marketing.invii.tsx:100` `+const isTablet = useIsTablet();` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/marketing.segmenti.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/marketing.segmenti.tsx:122` `+const isTablet = useIsTablet();` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/marketing/iscritti-whatsapp.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/marketing/iscritti-whatsapp.tsx:161` `+const isTablet = useIsTablet();` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/utenti.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.
- `src/routes/_app/utenti.tsx:151` `+const isTablet = useIsTablet();` — import/invocazione del hook: listener senza effetti sul layout telefono/PC; false fuori tablet.

### B. Fotografie sequenziali

15 coppie sulle cinque pagine a 375×812 touch, 1280×800 e 1440×900 mouse, 14 righe simulate per elenco. 12 identiche subito; tre diverse ripetute isolate, tre originali e tre attuali:

| Coppia | Tre originali | Tre attuali | Esito |
|---|---|---|---|
| Campagne 375 | stabili | stabili, identici agli originali | nessuna differenza vera |
| Campagne 1280 | stabili | instabili | rumore, non differenza vera |
| Segmenti 1440 | stabili | stabili, identici agli originali | nessuna differenza vera |

**Differenze vere: 0 a ciascuna dimensione.** Per il 3+3 riferimento client ottenuto rimuovendo i soli token tablet e fissando isTablet=false nell'intercettazione dei moduli Vite; equivalenza presentazionale verificata dal diff, senza riscrivere i file app. CSS corrente invariato perché tablet non attivo nelle tre dimensioni di controllo. Fotografie acquisite sequenzialmente dopo attesa font/caricamenti e due screenshot identici; nessun processo in parallelo. Problemi preesistenti su telefono/PC deliberatamente conservati (es. Utenti largo con nomi artificiali lunghi).

### C. Misure touch

| Pagina | Dimensioni | Px nascosti / lettere singole / target <40px |
|---|---|---|
| /marketing/invii | 768×1024, 820×1180, 1180×820, 1366×1024 | 0 / 0 / 0 in tutte |
| /marketing/campagne | 768×1024, 820×1180, 1180×820, 1366×1024 | 0 / 0 / 0 in tutte |
| /marketing/segmenti | 768×1024, 820×1180, 1180×820, 1366×1024 | 0 / 0 / 0 in tutte |
| /marketing/iscritti-whatsapp | 768×1024, 820×1180, 1180×820, 1366×1024 | 0 / 0 / 0 in tutte |
| /utenti | 768×1024, 820×1180, 1180×820, 1366×1024 | 0 / 0 / 0 in tutte |

20 casi, 14 righe per lista, nessuno scroll interno o esterno orizzontale. Checkbox: visuale 16px, area effettiva 40×40 tramite pseudo-elemento già introdotto nella fetta 1; il primo rilevatore contava il solo box visivo, corretto il rilevatore temporaneo (nessuna modifica checkbox). Le righe Segmenti sotto la piega fotografate anche scorrendo. Utenti: schede su tutti i tablet, due affiancate in orizzontale. Contatori invio/campagna nelle righe; stato e azioni restano nelle colonne. Nomi interi e dettagli nelle righe; loghi intatti. Test presentazionali con fixture, non verifiche di permessi/invii reali; nessuna scrittura reale.

### D. Test e artefatti

`bun test`: 1019 pass, 0 fail, 3433 asserzioni, 137 file; build automatico OK. SHA codice verificato `beafc8dde4e8c924989162c06d7a51d677e5becd` (documentazione conclusiva successiva). Script/immagini/JSON temporanei in /tmp/browser/fm79-f78.

### Appendice: ogni riga del diff classificata

```text
C4 src/routes/_app/marketing.campagne.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/marketing.campagne.tsx +L134:   const isTablet = useIsTablet();
C1 src/routes/_app/marketing.campagne.tsx -L256:       <TabsList>
C1 src/routes/_app/marketing.campagne.tsx -L257:         <TabsTrigger value="email">Email</TabsTrigger>
C1 src/routes/_app/marketing.campagne.tsx -L258:         <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
C1 src/routes/_app/marketing.campagne.tsx +L258:       <TabsList className="tablet:h-auto">
C1 src/routes/_app/marketing.campagne.tsx +L259:         <TabsTrigger className="tablet:min-h-10" value="email">Email</TabsTrigger>
C1 src/routes/_app/marketing.campagne.tsx +L260:         <TabsTrigger className="tablet:min-h-10" value="whatsapp">WhatsApp</TabsTrigger>
C1 src/routes/_app/marketing.campagne.tsx -L287:           <Table>
C1 src/routes/_app/marketing.campagne.tsx -L288:             <TableHeader>
C1 src/routes/_app/marketing.campagne.tsx +L289:           <Table className="tablet:table-fixed tablet:w-full tablet:max-lg:block">
C1 src/routes/_app/marketing.campagne.tsx +L290:             <TableHeader className="tablet:max-lg:hidden">
C1 src/routes/_app/marketing.campagne.tsx -L290:                 <TableHead>Nome</TableHead>
C1 src/routes/_app/marketing.campagne.tsx -L291:                 <TableHead>Oggetto</TableHead>
C1 src/routes/_app/marketing.campagne.tsx -L292:                 <TableHead>Stato</TableHead>
C1 src/routes/_app/marketing.campagne.tsx -L293:                 <TableHead className="text-center">Destinatari</TableHead>
C1 src/routes/_app/marketing.campagne.tsx -L294:                 <TableHead>Avanzamento</TableHead>
C1 src/routes/_app/marketing.campagne.tsx -L295:                 <TableHead>Aggiornata</TableHead>
C1 src/routes/_app/marketing.campagne.tsx -L296:                 <TableHead className="text-right">Azioni</TableHead>
C1 src/routes/_app/marketing.campagne.tsx +L292:                 <TableHead className="tablet:w-[50%]">Nome</TableHead>
C1 src/routes/_app/marketing.campagne.tsx +L293:                 <TableHead className="tablet:hidden">Oggetto</TableHead>
C1 src/routes/_app/marketing.campagne.tsx +L294:                 <TableHead className="tablet:w-48">Stato</TableHead>
C1 src/routes/_app/marketing.campagne.tsx +L295:                 <TableHead className="text-center tablet:hidden">Destinatari</TableHead>
C1 src/routes/_app/marketing.campagne.tsx +L296:                 <TableHead className="tablet:hidden">Avanzamento</TableHead>
C1 src/routes/_app/marketing.campagne.tsx +L297:                 <TableHead className="tablet:hidden">Aggiornata</TableHead>
C1 src/routes/_app/marketing.campagne.tsx +L298:                 <TableHead className="text-right tablet:w-56">Azioni</TableHead>
C1 src/routes/_app/marketing.campagne.tsx -L299:             <TableBody>
C1 src/routes/_app/marketing.campagne.tsx +L301:             <TableBody className="tablet:max-lg:block tablet:max-lg:space-y-3">
C1 src/routes/_app/marketing.campagne.tsx -L305:                 <TableRow key={c.id}>
C1 src/routes/_app/marketing.campagne.tsx -L306:                   <TableCell className="font-medium">{c.nome}</TableCell>
C1 src/routes/_app/marketing.campagne.tsx -L307:                   <TableCell className="text-muted-foreground">{c.oggetto || "—"}</TableCell>
C1 src/routes/_app/marketing.campagne.tsx -L308:                   <TableCell>
C1 src/routes/_app/marketing.campagne.tsx +L307:                 <TableRow key={c.id} className="tablet:max-lg:grid tablet:max-lg:grid-cols-1 tablet:max-lg:border-b tablet:max-lg:p-3">
C2 src/routes/_app/marketing.campagne.tsx +L308:                   <TableCell className="font-medium tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">{c.nome}{isTablet && <div className="mt-2 space-y-2 text-sm font-normal text-muted-foreground break-words"><div>{c.oggetto || "—"}</div><div>Aggiornata: {fmtDate(c.updated_at)}</div><Button variant="outline" size="sm" onClick={() => setDestinatariDi(c)}><Users className="size-4 mr-2" />Destinatari: {totale.toLocaleString("it-IT")}</Button><div className="grid grid-cols-2 gap-2"><span>Da inviare: {daInviare}</span><span>Inviate: {k?.inviato ?? 0}</span><span>Fallite: {k?.fallito ?? 0}</span><span>Saltate: {k?.saltato ?? 0}</span></div></div>}</TableCell>
C1 src/routes/_app/marketing.campagne.tsx +L309:                   <TableCell className="text-muted-foreground tablet:hidden">{c.oggetto || "—"}</TableCell>
C1 src/routes/_app/marketing.campagne.tsx +L310:                   <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/marketing.campagne.tsx -L314:                   <TableCell className="text-center">
C1 src/routes/_app/marketing.campagne.tsx +L316:                   <TableCell className="text-center tablet:hidden">
C1 src/routes/_app/marketing.campagne.tsx -L325:                   <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
C1 src/routes/_app/marketing.campagne.tsx +L327:                   <TableCell className="text-xs text-muted-foreground whitespace-nowrap tablet:hidden">
C1 src/routes/_app/marketing.campagne.tsx -L336:                   <TableCell className="text-muted-foreground">{fmtDate(c.updated_at)}</TableCell>
C1 src/routes/_app/marketing.campagne.tsx -L337:                   <TableCell className="text-right space-x-1 whitespace-nowrap">
C1 src/routes/_app/marketing.campagne.tsx +L338:                   <TableCell className="text-muted-foreground tablet:hidden">{fmtDate(c.updated_at)}</TableCell>
C1 src/routes/_app/marketing.campagne.tsx +L339:                   <TableCell className="text-right space-x-1 whitespace-nowrap tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0 tablet:space-x-0 tablet:whitespace-normal tablet:[&_button]:m-1">
C1 src/routes/_app/marketing.campagne.tsx -L425:           <TabsList>
C1 src/routes/_app/marketing.campagne.tsx -L426:             <TabsTrigger value="campagne">Campagne</TabsTrigger>
C1 src/routes/_app/marketing.campagne.tsx -L427:             <TabsTrigger value="template">Template</TabsTrigger>
C1 src/routes/_app/marketing.campagne.tsx +L427:           <TabsList className="tablet:h-auto">
C1 src/routes/_app/marketing.campagne.tsx +L428:             <TabsTrigger className="tablet:min-h-10" value="campagne">Campagne</TabsTrigger>
C1 src/routes/_app/marketing.campagne.tsx +L429:             <TabsTrigger className="tablet:min-h-10" value="template">Template</TabsTrigger>
C4 src/routes/_app/marketing.invii.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/marketing.invii.tsx +L100:   const isTablet = useIsTablet();
C1 src/routes/_app/marketing.invii.tsx -L333:         <Table>
C1 src/routes/_app/marketing.invii.tsx -L334:           <TableHeader>
C1 src/routes/_app/marketing.invii.tsx +L335:         <Table className="tablet:table-fixed tablet:w-full tablet:max-lg:block">
C1 src/routes/_app/marketing.invii.tsx +L336:           <TableHeader className="tablet:max-lg:hidden">
C1 src/routes/_app/marketing.invii.tsx -L336:               <TableHead>Data</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L337:               <TableHead>Operatore</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L338:               <TableHead>Campagna</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L339:               <TableHead>Oggetto</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L340:               <TableHead>Stato</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L341:               <TableHead className="text-right">Tot.</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L342:               <TableHead className="text-right">Inviati</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L343:               <TableHead className="text-right">Saltati</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L344:               <TableHead className="text-right">Falliti</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L345:               <TableHead className="text-right">Clic reali</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L346:               <TableHead className="text-right">Tasso clic</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L347:               <TableHead className="min-w-[180px]">Avanzamento</TableHead>
C1 src/routes/_app/marketing.invii.tsx -L348:               <TableHead className="w-[60px]"></TableHead>
C1 src/routes/_app/marketing.invii.tsx -L349:               <TableHead className="w-[40px]"></TableHead>
C1 src/routes/_app/marketing.invii.tsx +L338:               <TableHead className="tablet:hidden">Data</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L339:               <TableHead className="tablet:hidden">Operatore</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L340:               <TableHead className="tablet:w-[45%]">Campagna</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L341:               <TableHead className="tablet:hidden">Oggetto</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L342:               <TableHead className="tablet:w-40">Stato</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L343:               <TableHead className="text-right tablet:hidden">Tot.</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L344:               <TableHead className="text-right tablet:hidden">Inviati</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L345:               <TableHead className="text-right tablet:hidden">Saltati</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L346:               <TableHead className="text-right tablet:hidden">Falliti</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L347:               <TableHead className="text-right tablet:hidden">Clic reali</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L348:               <TableHead className="text-right tablet:hidden">Tasso clic</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L349:               <TableHead className="min-w-[180px] tablet:w-48">Avanzamento</TableHead>
C1 src/routes/_app/marketing.invii.tsx +L350:               <TableHead className="w-[60px] tablet:w-12"></TableHead>
C1 src/routes/_app/marketing.invii.tsx +L351:               <TableHead className="w-[40px] tablet:w-16"></TableHead>
C1 src/routes/_app/marketing.invii.tsx -L352:           <TableBody>
C1 src/routes/_app/marketing.invii.tsx +L354:           <TableBody className="tablet:max-lg:block tablet:max-lg:space-y-3">
C1 src/routes/_app/marketing.invii.tsx -L384:                   <TableRow key={c.id} className="hover:bg-muted/50">
C1 src/routes/_app/marketing.invii.tsx -L385:                     <TableCell className="whitespace-nowrap cursor-pointer" onClick={apri}>{fmtDateTime(c.inviata_at ?? c.created_at)}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L386:                     <TableCell className="cursor-pointer" onClick={apri}>{`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L387:                     <TableCell className="font-medium cursor-pointer" onClick={apri}>{c.nome}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L388:                     <TableCell className="cursor-pointer text-muted-foreground max-w-[240px] truncate" onClick={apri}>{c.oggetto || "—"}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L389:                     <TableCell className="cursor-pointer" onClick={apri}>
C1 src/routes/_app/marketing.invii.tsx +L386:                   <TableRow key={c.id} className="hover:bg-muted/50 tablet:max-lg:grid tablet:max-lg:grid-cols-2 tablet:max-lg:border-b tablet:max-lg:p-3">
C1 src/routes/_app/marketing.invii.tsx +L387:                     <TableCell className="whitespace-nowrap cursor-pointer tablet:hidden" onClick={apri}>{fmtDateTime(c.inviata_at ?? c.created_at)}</TableCell>
C1 src/routes/_app/marketing.invii.tsx +L388:                     <TableCell className="cursor-pointer tablet:hidden" onClick={apri}>{`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</TableCell>
C2 src/routes/_app/marketing.invii.tsx +L389:                     <TableCell className="font-medium cursor-pointer tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0 tablet:max-lg:col-span-2" onClick={apri}>{c.nome}{isTablet && <div className="mt-2 space-y-1 text-sm font-normal text-muted-foreground break-words"><div>{c.oggetto || "—"}</div><div>{fmtDateTime(c.inviata_at ?? c.created_at)} · {`${c.operatore?.nome ?? ""} ${c.operatore?.cognome ?? ""}`.trim() || "—"}</div><div className="grid grid-cols-2 gap-2 mt-2"><span>Totale: {c.totale_destinatari}</span><span>Inviati: {c.inviati}</span><span>Saltati: {c.saltati}</span><span>Falliti: {c.falliti}</span><span>Clic reali: {clicReali?.[c.id]?.clic_reali_unici ?? 0}</span><span>Tasso clic: {c.inviati > 0 ? `${Math.round(((clicReali?.[c.id]?.clic_reali_unici ?? 0) / c.inviati) * 1000) / 10}%` : "—"}</span></div></div>}</TableCell>
C1 src/routes/_app/marketing.invii.tsx +L390:                     <TableCell className="cursor-pointer text-muted-foreground max-w-[240px] truncate tablet:hidden" onClick={apri}>{c.oggetto || "—"}</TableCell>
C1 src/routes/_app/marketing.invii.tsx +L391:                     <TableCell className="cursor-pointer tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0" onClick={apri}>
C1 src/routes/_app/marketing.invii.tsx -L411:                     <TableCell className="text-right font-medium cursor-pointer" onClick={apri}>{c.totale_destinatari}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L412:                     <TableCell className="text-right text-emerald-600 cursor-pointer" onClick={apri}>{c.inviati}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L413:                     <TableCell className="text-right text-amber-600 cursor-pointer" onClick={apri}>{c.saltati}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L414:                     <TableCell className="text-right text-destructive cursor-pointer" onClick={apri}>{c.falliti}</TableCell>
C1 src/routes/_app/marketing.invii.tsx +L413:                     <TableCell className="text-right font-medium cursor-pointer tablet:hidden" onClick={apri}>{c.totale_destinatari}</TableCell>
C1 src/routes/_app/marketing.invii.tsx +L414:                     <TableCell className="text-right text-emerald-600 cursor-pointer tablet:hidden" onClick={apri}>{c.inviati}</TableCell>
C1 src/routes/_app/marketing.invii.tsx +L415:                     <TableCell className="text-right text-amber-600 cursor-pointer tablet:hidden" onClick={apri}>{c.saltati}</TableCell>
C1 src/routes/_app/marketing.invii.tsx +L416:                     <TableCell className="text-right text-destructive cursor-pointer tablet:hidden" onClick={apri}>{c.falliti}</TableCell>
C1 src/routes/_app/marketing.invii.tsx -L416:                       className="text-right font-medium cursor-pointer"
C1 src/routes/_app/marketing.invii.tsx +L418:                       className="text-right font-medium cursor-pointer tablet:hidden"
C1 src/routes/_app/marketing.invii.tsx -L432:                     <TableCell className="text-right text-sm tabular-nums cursor-pointer" onClick={apri}>
C1 src/routes/_app/marketing.invii.tsx +L434:                     <TableCell className="text-right text-sm tabular-nums cursor-pointer tablet:hidden" onClick={apri}>
C1 src/routes/_app/marketing.invii.tsx -L435:                     <TableCell>
C1 src/routes/_app/marketing.invii.tsx +L437:                     <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/marketing.invii.tsx -L453:                     <TableCell className="cursor-pointer" onClick={apri}><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
C1 src/routes/_app/marketing.invii.tsx -L454:                     <TableCell>
C1 src/routes/_app/marketing.invii.tsx +L455:                     <TableCell className="cursor-pointer tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0" onClick={apri}><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
C1 src/routes/_app/marketing.invii.tsx +L456:                     <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C4 src/routes/_app/marketing.segmenti.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/marketing.segmenti.tsx +L122:   const isTablet = useIsTablet();
C1 src/routes/_app/marketing.segmenti.tsx -L1145:           <div className="flex items-center gap-2 ml-auto">
C1 src/routes/_app/marketing.segmenti.tsx +L1147:           <div className="flex items-center gap-2 ml-auto tablet:flex-wrap tablet:w-full">
C1 src/routes/_app/marketing.segmenti.tsx -L1235:         <Table>
C1 src/routes/_app/marketing.segmenti.tsx -L1236:           <TableHeader>
C1 src/routes/_app/marketing.segmenti.tsx +L1237:         <Table className="tablet:table-fixed tablet:w-full tablet:max-lg:block">
C1 src/routes/_app/marketing.segmenti.tsx +L1238:           <TableHeader className="tablet:max-lg:hidden">
C1 src/routes/_app/marketing.segmenti.tsx -L1238:               <TableHead className="w-10">
C1 src/routes/_app/marketing.segmenti.tsx +L1240:               <TableHead className="w-10 tablet:w-14">
C1 src/routes/_app/marketing.segmenti.tsx -L1248:               <TableHead className="w-8" />
C1 src/routes/_app/marketing.segmenti.tsx -L1249:               <TableHead>Ragione sociale</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx -L1250:               <TableHead>Città / Prov.</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx -L1251:               <TableHead>Sede</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx -L1252:               <TableHead>Agente</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx -L1253:               <TableHead>Categoria</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx -L1254:               <TableHead className="text-center">Email valida</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx -L1255:               <TableHead className="text-center">Marketing</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx +L1250:               <TableHead className="w-8 tablet:w-14" />
C1 src/routes/_app/marketing.segmenti.tsx +L1251:               <TableHead className="tablet:w-[55%]">Ragione sociale</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx +L1252:               <TableHead className="tablet:hidden">Città / Prov.</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx +L1253:               <TableHead className="tablet:hidden">Sede</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx +L1254:               <TableHead className="tablet:hidden">Agente</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx +L1255:               <TableHead className="tablet:hidden">Categoria</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx +L1256:               <TableHead className="text-center tablet:w-32">Email valida</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx +L1257:               <TableHead className="text-center tablet:w-32">Marketing</TableHead>
C1 src/routes/_app/marketing.segmenti.tsx -L1258:           <TableBody>
C1 src/routes/_app/marketing.segmenti.tsx +L1260:           <TableBody className="tablet:max-lg:block tablet:max-lg:space-y-3">
C1 src/routes/_app/marketing.segmenti.tsx -L1276:                   <TableRow>
C1 src/routes/_app/marketing.segmenti.tsx -L1277:                     <TableCell>
C1 src/routes/_app/marketing.segmenti.tsx +L1278:                   <TableRow className="tablet:max-lg:grid tablet:max-lg:grid-cols-[40px_40px_minmax(0,1fr)] tablet:max-lg:border-b tablet:max-lg:p-3">
C1 src/routes/_app/marketing.segmenti.tsx +L1279:                     <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/marketing.segmenti.tsx -L1284:                     <TableCell>
C1 src/routes/_app/marketing.segmenti.tsx +L1286:                     <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/marketing.segmenti.tsx -L1288:                         className="text-muted-foreground hover:text-foreground"
C1 src/routes/_app/marketing.segmenti.tsx +L1290:                         className="text-muted-foreground hover:text-foreground tablet:min-h-10 tablet:min-w-10"
C1 src/routes/_app/marketing.segmenti.tsx -L1294:                     <TableCell className="font-medium cursor-pointer" onClick={() => toggleEspanso(c.id)}>
C1 src/routes/_app/marketing.segmenti.tsx +L1296:                     <TableCell className="font-medium cursor-pointer tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0" onClick={() => toggleEspanso(c.id)}>
C2 src/routes/_app/marketing.segmenti.tsx +L1298:                       {isTablet && <div className="mt-2 space-y-1 text-sm font-normal text-muted-foreground break-words"><div>{[c.citta, c.provincia].filter(Boolean).join(" — ") || "—"}</div><div>{c.store_id ? (storeNomeById.get(c.store_id) ?? "—") : "—"}</div><div>{c.agente || c.codice_agente || "—"}</div><div>{c.categoria || "—"}</div></div>}
C1 src/routes/_app/marketing.segmenti.tsx -L1297:                     <TableCell className="text-sm text-muted-foreground">
C1 src/routes/_app/marketing.segmenti.tsx +L1300:                     <TableCell className="text-sm text-muted-foreground tablet:hidden">
C1 src/routes/_app/marketing.segmenti.tsx -L1300:                     <TableCell className="text-sm">{c.store_id ? (storeNomeById.get(c.store_id) ?? "—") : "—"}</TableCell>
C1 src/routes/_app/marketing.segmenti.tsx -L1301:                     <TableCell className="text-sm">{c.agente || (c.codice_agente ? c.codice_agente : "—")}</TableCell>
C1 src/routes/_app/marketing.segmenti.tsx -L1302:                     <TableCell className="text-sm">{c.categoria || "—"}</TableCell>
C1 src/routes/_app/marketing.segmenti.tsx -L1303:                     <TableCell className="text-center">
C1 src/routes/_app/marketing.segmenti.tsx +L1303:                     <TableCell className="text-sm tablet:hidden">{c.store_id ? (storeNomeById.get(c.store_id) ?? "—") : "—"}</TableCell>
C1 src/routes/_app/marketing.segmenti.tsx +L1304:                     <TableCell className="text-sm tablet:hidden">{c.agente || (c.codice_agente ? c.codice_agente : "—")}</TableCell>
C1 src/routes/_app/marketing.segmenti.tsx +L1305:                     <TableCell className="text-sm tablet:hidden">{c.categoria || "—"}</TableCell>
C1 src/routes/_app/marketing.segmenti.tsx +L1306:                     <TableCell className="text-center tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0 tablet:max-lg:col-span-3 tablet:max-lg:text-left">
C1 src/routes/_app/marketing.segmenti.tsx -L1314:                     <TableCell className="text-center">
C1 src/routes/_app/marketing.segmenti.tsx +L1317:                     <TableCell className="text-center tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0 tablet:max-lg:col-span-3 tablet:max-lg:text-left">
C1 src/routes/_app/marketing.segmenti.tsx -L1435:                       <div className="font-medium truncate">{s.nome}</div>
C1 src/routes/_app/marketing.segmenti.tsx +L1438:                       <div className="font-medium truncate tablet:whitespace-normal tablet:break-words">{s.nome}</div>
C4 src/routes/_app/marketing/iscritti-whatsapp.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/marketing/iscritti-whatsapp.tsx +L161:   const isTablet = useIsTablet();
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L556:         <div className="md:hidden space-y-2">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L558:         <div className="md:hidden space-y-2 tablet:max-lg:block">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L632:         <div className="hidden md:block">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L633:         <Table>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L634:         <div className="hidden md:block tablet:max-lg:hidden">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L635:         <Table className="tablet:table-fixed tablet:w-full">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L636:               <TableHead>Numero</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L638:               <TableHead className="tablet:w-40">Numero</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L638:               <TableHead>Impresa / privato</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L639:               <TableHead>Origine</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L640:               <TableHead>Data</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L641:               <TableHead>Stato</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L642:               <TableHead>Collegato a</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L643:               <TableHead className="text-right">Azioni</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L640:               <TableHead className="tablet:hidden">Impresa / privato</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L641:               <TableHead className="tablet:hidden">Origine</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L642:               <TableHead className="tablet:hidden">Data</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L643:               <TableHead className="tablet:w-44">Stato</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L644:               <TableHead className="tablet:hidden">Collegato a</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L645:               <TableHead className="text-right tablet:w-36">Azioni</TableHead>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L662:                   <TableCell className="font-mono text-sm">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L664:                   <TableCell className="font-mono text-sm tablet:whitespace-normal tablet:break-words">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L665:                   <TableCell>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L667:                   <TableCell className="tablet:whitespace-normal tablet:break-words">
C2 src/routes/_app/marketing/iscritti-whatsapp.tsx +L669:                     {isTablet && <div className="mt-2 space-y-1 text-sm text-muted-foreground break-words"><div>{r.azienda || "—"}</div><div>{r.partita_iva ? `P.IVA ${r.partita_iva}` : ""}</div><div>{r.store_id ? sediMap[r.store_id] : "—"}</div><div>{fmtData(r.created_at)} · {LABEL_ORIGINE[r.origine ?? ""] ?? r.origine}</div><div>{nomiCollegati[r.cliente_id ?? r.lead_id ?? ""] || "—"}</div></div>}
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L668:                   <TableCell>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L671:                   <TableCell className="tablet:hidden">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L689:                   <TableCell>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L692:                   <TableCell className="tablet:hidden">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L694:                   <TableCell className="text-sm">{fmtData(r.created_at)}</TableCell>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L695:                   <TableCell>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L697:                   <TableCell className="text-sm tablet:hidden">{fmtData(r.created_at)}</TableCell>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L698:                   <TableCell className="tablet:whitespace-normal tablet:break-words">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L702:                   <TableCell>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L705:                   <TableCell className="tablet:hidden">
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx -L711:                   <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
C1 src/routes/_app/marketing/iscritti-whatsapp.tsx +L714:                   <TableCell className="text-right space-x-2 tablet:whitespace-normal tablet:break-words tablet:space-x-0 tablet:[&_button]:w-full tablet:[&_button]:mb-2" onClick={(e) => e.stopPropagation()}>
C4 src/routes/_app/utenti.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/utenti.tsx +L151:   const isTablet = useIsTablet();
C1 src/routes/_app/utenti.tsx -L351:             <div className="mb-3 flex items-center gap-2 md:hidden">
C1 src/routes/_app/utenti.tsx +L353:             <div className="mb-3 flex items-center gap-2 md:hidden tablet:flex">
C2 src/routes/_app/utenti.tsx +L376:                 {isTablet ? (
C2 src/routes/_app/utenti.tsx +L377:                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
C2 src/routes/_app/utenti.tsx +L378:                   {ordinati.map((u) => (
C2 src/routes/_app/utenti.tsx +L379:                     <SchedaLista
C2 src/routes/_app/utenti.tsx +L380:                       key={u.id}
C2 src/routes/_app/utenti.tsx +L381:                       badge={<Badge variant={u.attivo ? "default" : "secondary"}>{u.attivo ? "Attivo" : "Inattivo"}</Badge>}
C2 src/routes/_app/utenti.tsx +L382:                       titolo={<span className="min-w-0 break-words">{[u.nome, u.cognome].filter(Boolean).join(" ") || "—"}</span>}
C2 src/routes/_app/utenti.tsx +L383:                       campi={[
C2 src/routes/_app/utenti.tsx +L384:                         {
C2 src/routes/_app/utenti.tsx +L385:                           etichetta: "Email",
C2 src/routes/_app/utenti.tsx +L386:                           valore: u.email ? <span className="break-all">{u.email}</span> : "—",
C2 src/routes/_app/utenti.tsx +L387:                         },
C2 src/routes/_app/utenti.tsx +L388:                         { etichetta: "Punto vendita", valore: u.store_nome ?? "—" },
C2 src/routes/_app/utenti.tsx +L389:                         { etichetta: "Verifica in due passaggi", valore: testoMfa(u.id) },
C2 src/routes/_app/utenti.tsx +L390:                         {
C2 src/routes/_app/utenti.tsx +L391:                           etichetta: "Ruoli",
C2 src/routes/_app/utenti.tsx +L392:                           valore: u.ruoli.length === 0 ? "—" : (
C2 src/routes/_app/utenti.tsx +L393:                             <span className="flex flex-wrap gap-1">
C2 src/routes/_app/utenti.tsx +L394:                               {u.ruoli.map((r) => (
C2 src/routes/_app/utenti.tsx +L395:                                 <Badge key={r} variant="outline">{RUOLI_LABEL[r]}</Badge>
C2 src/routes/_app/utenti.tsx +L396:                               ))}
C2 src/routes/_app/utenti.tsx +L397:                             </span>
C2 src/routes/_app/utenti.tsx +L398:                           ),
C2 src/routes/_app/utenti.tsx +L399:                         },
C2 src/routes/_app/utenti.tsx +L400:                       ]}
C2 src/routes/_app/utenti.tsx +L401:                       footer={
C2 src/routes/_app/utenti.tsx +L402:                         <Button size="sm" className="h-10 gap-2" onClick={() => setEditing(u)}>
C2 src/routes/_app/utenti.tsx +L403:                           <Pencil className="size-4" /> Modifica
C2 src/routes/_app/utenti.tsx +L404:                         </Button>
C2 src/routes/_app/utenti.tsx +L405:                       }
C2 src/routes/_app/utenti.tsx +L406:                     />
C2 src/routes/_app/utenti.tsx +L407:                   ))}
C2 src/routes/_app/utenti.tsx +L408:                 </div>
C2 src/routes/_app/utenti.tsx +L409:                 ) : (
C1 src/routes/_app/utenti.tsx +L442:                 )}
C1 src/routes/_app/utenti.tsx -L408:                 <div className="hidden md:block">
C1 src/routes/_app/utenti.tsx +L445:                 <div className="hidden md:block tablet:hidden">
```

### Ricontrollo finale delle pagine e dei dettagli

Eseguiti 40 casi sequenziali: cinque pagine × telefono 375, PC 1280, tablet 820 e 1180 × classe dark assente/presente. Scorrimento degli elenchi e apertura editor campagna, dettaglio invio, espansione segmento, riconciliazione e modifica utente senza salvare; nessun errore JavaScript. La classe dark non produce un tema completo distinto nelle pagine attuali (token restano chiari): non aggiunto un tema. Problemi già presenti su telefono/PC, incluso editor Campagne largo a 375 e tabelle dense, conservati per l’invarianza richiesta; non sono correzioni autorizzate da questa fetta. Screenshot supplementari in /tmp/browser/fm79-f78/review.


## Fetta 9 — Listini e B1–B5 (17/11/2026)

Base `559d37c2a54deaa233f6fe650f1a2d1e1f4a2b92`. Tre listini, Privacy, template email/lettera, Audit e banner; aggiunta solo tablet anche ai tre selettori in listini.tsx (necessaria per i target ≥40px). Nessun dato, prezzo, formula, handler, permesso, logo o viewport modificato.

### A. Diff classificato

| Categoria | Righe firmate |
|---|---:|
| 1 | 201 |
| 2 | 3 |
| 3 | 0 |
| 4 | 6 |
| Totale | 210 |

C1: soli token tablet aggiunti, classi precedenti preservate. C2: dettagli secondari solo con isTablet; il testo principale e gestori originali conservati. C3: nessun nuovo hook. ALTRO completo:

- `src/routes/_app/privacy.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";`: import/invocazione hook; false su telefono/PC, nessun effetto sulla presentazione.
- `src/routes/_app/privacy.tsx:39` `+const isTablet = useIsTablet();`: import/invocazione hook; false su telefono/PC, nessun effetto sulla presentazione.
- `src/routes/_app/template-email.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";`: import/invocazione hook; false su telefono/PC, nessun effetto sulla presentazione.
- `src/routes/_app/template-email.tsx:55` `+const isTablet = useIsTablet();`: import/invocazione hook; false su telefono/PC, nessun effetto sulla presentazione.
- `src/routes/_app/template-lettera.tsx:1` `+import { useIsTablet } from "@/hooks/use-tablet";`: import/invocazione hook; false su telefono/PC, nessun effetto sulla presentazione.
- `src/routes/_app/template-lettera.tsx:53` `+const isTablet = useIsTablet();`: import/invocazione hook; false su telefono/PC, nessun effetto sulla presentazione.

Head: Listini e template già specifici; Privacy/Audit senza head specifico preesistente, non aggiunto nel perimetro tablet. Nessuna nuova fonte unica o struttura; AGENTS pieno, non ampliato.

### B. Fotografie sequenziali

21 coppie: sette viste (tre tab Listini più Privacy/Email/Lettera/Audit) × 375×812 touch, 1280×800 e 1440×900 mouse. 19 identiche subito; Audit 375 e acquisto 1440 diverse su pochi pixel nei contatori della barra. Primo 3+3 ancora troppo presto rispetto ai contatori: differenze stabili. Ripetuto aggiungendo attesa dei dati secondari: entrambi i gruppi stabili e identici, **0 differenze vere** in entrambe le coppie. Nessun difetto app corretto per queste differenze. Riferimento nel 3+3: moduli client intercettati senza soli token tablet e con isTablet=false, equivalente al diff fuori tablet; nessun ripristino dei file.

### C. Touch e scelta listini

28 casi (sette viste × 768×1024, 820×1180, 1180×820, 1366×1024): scroll pagina 0, lettere singole 0, target <40px 0, intestazioni sovrapposte 0, errori runtime 0. Privacy/template/Audit: nessun contenuto nascosto. Banner: da 52px circa a 48px, testo compatto, Configura conserva target 40px; fixture lo mostra su tutte le pagine.

**Eccezioni deliberate listini:** scroll soltanto nel riquadro, codice e descrizione fissi insieme (delta 0px per entrambe le colonne nel test scrollLeft); sfondo opaco anche nelle intestazioni. Il rilevatore generico conta intestazioni parzialmente visibili al bordo del riquadro: non sono colonne perse, sono raggiungibili scorrendo. Colonne minime: acquisto totale 1688px, vendita 992px; codice 104px, descrizione 280px, altre 88–160px; matrice minimo 1200px.

| Vista | Larghezza tablet | Scroll interno px |
|---|---:|---:|
| acquisto | 768 | 968 |
| vendita | 768 | 272 |
| matrice | 768 | 480 |
| acquisto | 820 | 916 |
| vendita | 820 | 220 |
| matrice | 820 | 428 |
| acquisto | 1180 | 572 |
| vendita | 1180 | 0 |
| matrice | 1180 | 84 |
| acquisto | 1366 | 386 |
| vendita | 1366 | 0 |
| matrice | 1366 | 0 |

In verticale conservata la stessa tabella con colonne identificative fisse: la consultazione prezzi richiede confronto fra sconti, costo, trasporto e fasce, che le schede disperderebbero. È possibile scorrere tutte le colonne senza perdere l’articolo; campi almeno 44px. Nella matrice la descrizione resta il campo modificabile originale, testo lungo consultabile spostando il cursore nel campo.

Scorse tutte le righe (14 articoli/contatti/template/eventi; matrice 26 categorie), fotografata ultima riga; aperti editor template, modifica massiva vendita e conferma matrice, poi Annulla senza scritture. Privacy: verificato pulsante PDF visibile, non un download reale (file simulato); scheda articolo e cliente restano da provare sul dispositivo. Tema app corrente chiaro; nessun tema nuovo introdotto.

### D. Test

`bun test`: 1019 pass, 0 fail, 3433 asserzioni, 137 file. Build automatico OK. Script, JSON e screenshot /tmp/browser/fm79-f9.

### Appendice completa diff

```text
C1 src/components/banner-attiva-notifiche.tsx -L72:     <div className="flex flex-wrap items-center gap-3 bg-primary px-4 py-2.5 text-primary-foreground sm:px-6">
C1 src/components/banner-attiva-notifiche.tsx +L72:     <div className="flex flex-wrap items-center gap-3 bg-primary px-4 py-2.5 text-primary-foreground sm:px-6 tablet:flex-nowrap tablet:gap-2 tablet:py-1">
C1 src/components/banner-attiva-notifiche.tsx -L74:       <p className="flex-1 text-sm">
C1 src/components/banner-attiva-notifiche.tsx +L74:       <p className="flex-1 text-sm tablet:min-w-0 tablet:text-xs">
C1 src/components/listini/ListinoAcquistoView.tsx -L226:       <div className="flex-1 overflow-auto">
C1 src/components/listini/ListinoAcquistoView.tsx +L226:       <div className="flex-1 overflow-auto tablet:relative tablet:isolate tablet:max-w-full tablet:[&_input]:min-h-11 tablet:[&_input]:text-base tablet:[&_th]:whitespace-normal tablet:[&_th]:align-top tablet:[&_th]:bg-primary tablet:[&_th]:text-primary-foreground tablet:[&_td]:align-top">
C1 src/components/listini/ListinoAcquistoView.tsx -L228:         <table className="w-full text-xs table-fixed">
C1 src/components/listini/ListinoAcquistoView.tsx +L228:         <table className="w-full text-xs table-fixed tablet:min-w-[1688px] tablet:w-[1688px]">
C1 src/components/listini/ListinoAcquistoView.tsx -L230:             <col style={{ width: "104px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L231:             <col />
C1 src/components/listini/ListinoAcquistoView.tsx -L232:             <col style={{ width: "140px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L233:             <col style={{ width: "80px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L234:             <col style={{ width: "56px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L235:             <col style={{ width: "56px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L236:             <col style={{ width: "56px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L237:             <col style={{ width: "56px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L238:             <col style={{ width: "56px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L239:             <col style={{ width: "88px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L240:             <col style={{ width: "68px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L241:             <col style={{ width: "68px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L242:             <col style={{ width: "104px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx -L243:             <col style={{ width: "88px" }} />
C1 src/components/listini/ListinoAcquistoView.tsx +L230:             <col style={{ width: "104px" }} className="tablet:w-[104px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L231:             <col className="tablet:w-[280px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L232:             <col style={{ width: "140px" }} className="tablet:w-[160px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L233:             <col style={{ width: "80px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L234:             <col style={{ width: "56px" }} className="tablet:w-[88px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L235:             <col style={{ width: "56px" }} className="tablet:w-[88px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L236:             <col style={{ width: "56px" }} className="tablet:w-[88px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L237:             <col style={{ width: "56px" }} className="tablet:w-[88px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L238:             <col style={{ width: "56px" }} className="tablet:w-[88px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L239:             <col style={{ width: "88px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L240:             <col style={{ width: "68px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L241:             <col style={{ width: "68px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L242:             <col style={{ width: "104px" }} className="tablet:w-[144px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx +L243:             <col style={{ width: "88px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoAcquistoView.tsx -L247:               <th className="px-2 py-2 text-left">Cod. GAMMA</th>
C1 src/components/listini/ListinoAcquistoView.tsx -L248:               <th className="px-3 py-2 text-left">Descrizione</th>
C1 src/components/listini/ListinoAcquistoView.tsx +L247:               <th className="px-2 py-2 text-left tablet:sticky tablet:left-0 tablet:z-20 tablet:bg-primary tablet:text-primary-foreground">Cod. GAMMA</th>
C1 src/components/listini/ListinoAcquistoView.tsx +L248:               <th className="px-3 py-2 text-left tablet:sticky tablet:left-[104px] tablet:z-20 tablet:bg-primary tablet:text-primary-foreground">Descrizione</th>
C1 src/components/listini/ListinoAcquistoView.tsx -L270:                     className="px-2 py-1 font-mono truncate cursor-pointer"
C1 src/components/listini/ListinoAcquistoView.tsx +L270:                     className="px-2 py-1 font-mono truncate cursor-pointer tablet:sticky tablet:left-0 tablet:z-10 tablet:bg-card tablet:whitespace-normal tablet:break-words tablet:min-h-10"
C1 src/components/listini/ListinoAcquistoView.tsx -L277:                     className="px-3 py-1 truncate cursor-pointer"
C1 src/components/listini/ListinoAcquistoView.tsx +L277:                     className="px-3 py-1 truncate cursor-pointer tablet:sticky tablet:left-[104px] tablet:z-10 tablet:bg-card tablet:whitespace-normal tablet:break-words"
C1 src/components/listini/ListinoVenditaView.tsx -L300:       <div className="flex-1 overflow-auto">
C1 src/components/listini/ListinoVenditaView.tsx +L300:       <div className="flex-1 overflow-auto tablet:relative tablet:isolate tablet:max-w-full tablet:[&_input]:min-h-11 tablet:[&_input]:text-base tablet:[&_th]:whitespace-normal tablet:[&_th]:align-top tablet:[&_th]:bg-primary tablet:[&_th]:text-primary-foreground tablet:[&_td]:align-top">
C1 src/components/listini/ListinoVenditaView.tsx -L302:         <table className="w-full text-xs table-fixed">
C1 src/components/listini/ListinoVenditaView.tsx +L302:         <table className="w-full text-xs table-fixed tablet:min-w-[992px] tablet:w-[992px]">
C1 src/components/listini/ListinoVenditaView.tsx -L304:             <col style={{ width: "104px" }} />
C1 src/components/listini/ListinoVenditaView.tsx -L305:             <col />
C1 src/components/listini/ListinoVenditaView.tsx -L306:             <col style={{ width: "140px" }} />
C1 src/components/listini/ListinoVenditaView.tsx -L307:             <col style={{ width: "96px" }} />
C1 src/components/listini/ListinoVenditaView.tsx -L308:             <col style={{ width: "88px" }} />
C1 src/components/listini/ListinoVenditaView.tsx -L309:             <col style={{ width: "96px" }} />
C1 src/components/listini/ListinoVenditaView.tsx -L310:             <col style={{ width: "80px" }} />
C1 src/components/listini/ListinoVenditaView.tsx +L304:             <col style={{ width: "104px" }} className="tablet:w-[104px]!" />
C1 src/components/listini/ListinoVenditaView.tsx +L305:             <col className="tablet:w-[280px]!" />
C1 src/components/listini/ListinoVenditaView.tsx +L306:             <col style={{ width: "140px" }} className="tablet:w-[160px]!" />
C1 src/components/listini/ListinoVenditaView.tsx +L307:             <col style={{ width: "96px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoVenditaView.tsx +L308:             <col style={{ width: "88px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoVenditaView.tsx +L309:             <col style={{ width: "96px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoVenditaView.tsx +L310:             <col style={{ width: "80px" }} className="tablet:w-[112px]!" />
C1 src/components/listini/ListinoVenditaView.tsx -L314:               <th className="px-2 py-2 text-left">Cod. GAMMA</th>
C1 src/components/listini/ListinoVenditaView.tsx -L315:               <th className="px-3 py-2 text-left">Descrizione</th>
C1 src/components/listini/ListinoVenditaView.tsx +L314:               <th className="px-2 py-2 text-left tablet:sticky tablet:left-0 tablet:z-20 tablet:bg-primary tablet:text-primary-foreground">Cod. GAMMA</th>
C1 src/components/listini/ListinoVenditaView.tsx +L315:               <th className="px-3 py-2 text-left tablet:sticky tablet:left-[104px] tablet:z-20 tablet:bg-primary tablet:text-primary-foreground">Descrizione</th>
C1 src/components/listini/ListinoVenditaView.tsx -L330:                     className="px-2 py-1 font-mono truncate cursor-pointer"
C1 src/components/listini/ListinoVenditaView.tsx +L330:                     className="px-2 py-1 font-mono truncate cursor-pointer tablet:sticky tablet:left-0 tablet:z-10 tablet:bg-card tablet:whitespace-normal tablet:break-words tablet:min-h-10"
C1 src/components/listini/ListinoVenditaView.tsx -L337:                     className="px-3 py-1 truncate cursor-pointer"
C1 src/components/listini/ListinoVenditaView.tsx +L337:                     className="px-3 py-1 truncate cursor-pointer tablet:sticky tablet:left-[104px] tablet:z-10 tablet:bg-card tablet:whitespace-normal tablet:break-words"
C1 src/components/listini/MatriceRicarichiView.tsx -L263:       <div className="flex-1 overflow-auto">
C1 src/components/listini/MatriceRicarichiView.tsx -L264:         <table className="w-full text-xs">
C1 src/components/listini/MatriceRicarichiView.tsx +L263:       <div className="flex-1 overflow-auto tablet:relative tablet:isolate tablet:max-w-full tablet:[&_input]:min-h-11 tablet:[&_input]:text-base tablet:[&_th]:whitespace-normal tablet:[&_th]:align-top tablet:[&_th]:bg-primary tablet:[&_th]:text-primary-foreground tablet:[&_td]:align-top">
C1 src/components/listini/MatriceRicarichiView.tsx +L264:         <table className="w-full text-xs tablet:table-fixed tablet:min-w-[1200px]">
C1 src/components/listini/MatriceRicarichiView.tsx -L267:               <th className="px-3 py-2 text-left w-14">Cat.</th>
C1 src/components/listini/MatriceRicarichiView.tsx -L268:               <th className="px-3 py-2 text-left">Descrizione</th>
C1 src/components/listini/MatriceRicarichiView.tsx +L267:               <th className="px-3 py-2 text-left w-14 tablet:w-14 tablet:sticky tablet:left-0 tablet:z-20 tablet:bg-primary tablet:text-primary-foreground">Cat.</th>
C1 src/components/listini/MatriceRicarichiView.tsx +L268:               <th className="px-3 py-2 text-left tablet:w-[280px] tablet:sticky tablet:left-14 tablet:z-20 tablet:bg-primary tablet:text-primary-foreground">Descrizione</th>
C1 src/components/listini/MatriceRicarichiView.tsx -L279:                 <td className="px-3 py-1 font-mono font-bold text-navy">{r.categoria}</td>
C1 src/components/listini/MatriceRicarichiView.tsx -L280:                 <td className="px-2 py-0.5">
C1 src/components/listini/MatriceRicarichiView.tsx +L279:                 <td className="px-3 py-1 font-mono font-bold text-navy tablet:sticky tablet:left-0 tablet:z-10 tablet:bg-card">{r.categoria}</td>
C1 src/components/listini/MatriceRicarichiView.tsx +L280:                 <td className="px-2 py-0.5 tablet:sticky tablet:left-14 tablet:z-10 tablet:bg-card">
C1 src/routes/_app/audit.tsx -L113:           <Table>
C1 src/routes/_app/audit.tsx -L114:             <TableHeader>
C1 src/routes/_app/audit.tsx +L113:           <Table className="tablet:table-fixed tablet:w-full tablet:block">
C1 src/routes/_app/audit.tsx +L114:             <TableHeader className="tablet:hidden">
C1 src/routes/_app/audit.tsx -L123:             <TableBody>
C1 src/routes/_app/audit.tsx +L123:             <TableBody className="tablet:block">
C1 src/routes/_app/audit.tsx -L129:                 <TableRow key={r.id}>
C1 src/routes/_app/audit.tsx -L130:                   <TableCell className="text-xs whitespace-nowrap">
C1 src/routes/_app/audit.tsx +L129:                 <TableRow key={r.id} className="tablet:grid tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] tablet:p-3">
C1 src/routes/_app/audit.tsx +L130:                   <TableCell className="text-xs whitespace-nowrap tablet:whitespace-normal tablet:block">
C1 src/routes/_app/audit.tsx -L133:                   <TableCell className="text-xs">{r.user_email ?? "—"}</TableCell>
C1 src/routes/_app/audit.tsx -L134:                   <TableCell><Badge variant="outline">{r.entita}</Badge></TableCell>
C1 src/routes/_app/audit.tsx -L135:                   <TableCell><Badge>{r.azione}</Badge></TableCell>
C1 src/routes/_app/audit.tsx -L136:                   <TableCell className="text-xs font-mono max-w-md truncate">
C1 src/routes/_app/audit.tsx +L133:                   <TableCell className="text-xs tablet:whitespace-normal tablet:break-all tablet:block">{r.user_email ?? "—"}</TableCell>
C1 src/routes/_app/audit.tsx +L134:                   <TableCell className="tablet:whitespace-normal tablet:break-words tablet:block"><Badge variant="outline">{r.entita}</Badge></TableCell>
C1 src/routes/_app/audit.tsx +L135:                   <TableCell className="tablet:whitespace-normal tablet:break-words tablet:block"><Badge>{r.azione}</Badge></TableCell>
C1 src/routes/_app/audit.tsx +L136:                   <TableCell className="text-xs font-mono max-w-md truncate tablet:max-w-none tablet:whitespace-normal tablet:break-all tablet:col-span-2 tablet:block">
C1 src/routes/_app/listini.tsx -L22:           <TabsList>
C1 src/routes/_app/listini.tsx -L23:             <TabsTrigger value="acquisto">Listino acquisto</TabsTrigger>
C1 src/routes/_app/listini.tsx -L24:             <TabsTrigger value="vendita">Listino vendita</TabsTrigger>
C1 src/routes/_app/listini.tsx -L25:             <TabsTrigger value="matrice">Matrice ricarichi</TabsTrigger>
C1 src/routes/_app/listini.tsx +L22:           <TabsList className="tablet:h-auto">
C1 src/routes/_app/listini.tsx +L23:             <TabsTrigger className="tablet:min-h-10" value="acquisto">Listino acquisto</TabsTrigger>
C1 src/routes/_app/listini.tsx +L24:             <TabsTrigger className="tablet:min-h-10" value="vendita">Listino vendita</TabsTrigger>
C1 src/routes/_app/listini.tsx +L25:             <TabsTrigger className="tablet:min-h-10" value="matrice">Matrice ricarichi</TabsTrigger>
C4 src/routes/_app/privacy.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/privacy.tsx +L39:   const isTablet = useIsTablet();
C1 src/routes/_app/privacy.tsx -L158:           <Table>
C1 src/routes/_app/privacy.tsx -L159:             <TableHeader>
C1 src/routes/_app/privacy.tsx +L160:           <Table className="tablet:table-fixed tablet:w-full tablet:max-lg:block">
C1 src/routes/_app/privacy.tsx +L161:             <TableHeader className="tablet:max-lg:hidden">
C1 src/routes/_app/privacy.tsx -L161:                 <TableHead>Cliente</TableHead>
C1 src/routes/_app/privacy.tsx -L162:                 <TableHead>Contatto</TableHead>
C1 src/routes/_app/privacy.tsx -L163:                 <TableHead>Ruolo</TableHead>
C1 src/routes/_app/privacy.tsx -L164:                 <TableHead className="text-center">Trattamento dati</TableHead>
C1 src/routes/_app/privacy.tsx -L165:                 <TableHead>Consensi</TableHead>
C1 src/routes/_app/privacy.tsx -L166:                 <TableHead>Data firma</TableHead>
C1 src/routes/_app/privacy.tsx -L167:                 <TableHead className="text-right">PDF</TableHead>
C1 src/routes/_app/privacy.tsx +L163:                 <TableHead className="tablet:w-[35%]">Cliente</TableHead>
C1 src/routes/_app/privacy.tsx +L164:                 <TableHead className="tablet:w-[25%]">Contatto</TableHead>
C1 src/routes/_app/privacy.tsx +L165:                 <TableHead className="tablet:hidden">Ruolo</TableHead>
C1 src/routes/_app/privacy.tsx +L166:                 <TableHead className="text-center tablet:w-28">Trattamento dati</TableHead>
C1 src/routes/_app/privacy.tsx +L167:                 <TableHead className="tablet:w-28">Consensi</TableHead>
C1 src/routes/_app/privacy.tsx +L168:                 <TableHead className="tablet:hidden">Data firma</TableHead>
C1 src/routes/_app/privacy.tsx +L169:                 <TableHead className="text-right tablet:w-36">PDF</TableHead>
C1 src/routes/_app/privacy.tsx -L170:             <TableBody>
C1 src/routes/_app/privacy.tsx +L172:             <TableBody className="tablet:max-lg:block">
C1 src/routes/_app/privacy.tsx -L174:                   className="cursor-pointer hover:bg-muted/40"
C1 src/routes/_app/privacy.tsx +L176:                   className="cursor-pointer hover:bg-muted/40 tablet:max-lg:grid tablet:max-lg:grid-cols-2 tablet:max-lg:p-3"
C1 src/routes/_app/privacy.tsx -L181:                   <TableCell className="font-medium">
C1 src/routes/_app/privacy.tsx +L183:                   <TableCell className="font-medium tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/privacy.tsx -L185:                   <TableCell>{`${r.nome ?? ""} ${r.cognome ?? ""}`.trim() || "—"}</TableCell>
C1 src/routes/_app/privacy.tsx -L186:                   <TableCell className="text-muted-foreground">{r.ruolo ?? "—"}</TableCell>
C1 src/routes/_app/privacy.tsx -L187:                   <TableCell className="text-center">
C2 src/routes/_app/privacy.tsx +L187:                   <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">{`${r.nome ?? ""} ${r.cognome ?? ""}`.trim() || "—"}{isTablet && <div className="mt-2 space-y-1 text-sm text-muted-foreground"><div>{r.ruolo ?? "—"}</div><div>Firma: {fmtDate(r.data_firma)}</div></div>}</TableCell>
C1 src/routes/_app/privacy.tsx +L188:                   <TableCell className="text-muted-foreground tablet:hidden">{r.ruolo ?? "—"}</TableCell>
C1 src/routes/_app/privacy.tsx +L189:                   <TableCell className="text-center tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/privacy.tsx -L190:                   <TableCell>
C1 src/routes/_app/privacy.tsx +L192:                   <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/privacy.tsx -L198:                   <TableCell>{fmtDate(r.data_firma)}</TableCell>
C1 src/routes/_app/privacy.tsx -L199:                   <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
C1 src/routes/_app/privacy.tsx +L200:                   <TableCell className="tablet:hidden">{fmtDate(r.data_firma)}</TableCell>
C1 src/routes/_app/privacy.tsx +L201:                   <TableCell className="text-right tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0" onClick={(e) => e.stopPropagation()}>
C4 src/routes/_app/template-email.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/template-email.tsx +L55:   const isTablet = useIsTablet();
C1 src/routes/_app/template-email.tsx -L114:           <Table>
C1 src/routes/_app/template-email.tsx -L115:             <TableHeader>
C1 src/routes/_app/template-email.tsx +L116:           <Table className="tablet:table-fixed tablet:w-full tablet:max-lg:block">
C1 src/routes/_app/template-email.tsx +L117:             <TableHeader className="tablet:max-lg:hidden">
C1 src/routes/_app/template-email.tsx -L117:                 <TableHead>Nome</TableHead>
C1 src/routes/_app/template-email.tsx -L118:                 <TableHead>Tipo</TableHead>
C1 src/routes/_app/template-email.tsx -L119:                 <TableHead>Oggetto</TableHead>
C1 src/routes/_app/template-email.tsx -L120:                 <TableHead className="w-24">Attivo</TableHead>
C1 src/routes/_app/template-email.tsx -L121:                 <TableHead className="w-32 text-right">Azioni</TableHead>
C1 src/routes/_app/template-email.tsx +L119:                 <TableHead className="tablet:w-[65%]">Nome</TableHead>
C1 src/routes/_app/template-email.tsx +L120:                 <TableHead className="tablet:hidden">Tipo</TableHead>
C1 src/routes/_app/template-email.tsx +L121:                 <TableHead className="tablet:hidden">Oggetto</TableHead>
C1 src/routes/_app/template-email.tsx +L122:                 <TableHead className="w-24 tablet:w-32">Attivo</TableHead>
C1 src/routes/_app/template-email.tsx +L123:                 <TableHead className="w-32 text-right tablet:w-28">Azioni</TableHead>
C1 src/routes/_app/template-email.tsx -L124:             <TableBody>
C1 src/routes/_app/template-email.tsx +L126:             <TableBody className="tablet:max-lg:block">
C1 src/routes/_app/template-email.tsx -L126:                 <TableRow key={t.id}>
C1 src/routes/_app/template-email.tsx -L127:                   <TableCell className="font-medium">{t.nome}</TableCell>
C1 src/routes/_app/template-email.tsx -L128:                   <TableCell><TipoLabel tipo={t.tipo} /></TableCell>
C1 src/routes/_app/template-email.tsx -L129:                   <TableCell className="text-muted-foreground text-sm truncate max-w-md">{t.oggetto}</TableCell>
C1 src/routes/_app/template-email.tsx -L130:                   <TableCell>
C1 src/routes/_app/template-email.tsx +L128:                 <TableRow key={t.id} className="tablet:max-lg:grid tablet:max-lg:grid-cols-[minmax(0,1fr)_auto] tablet:max-lg:p-3">
C2 src/routes/_app/template-email.tsx +L129:                   <TableCell className="font-medium tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">{t.nome}{isTablet && <div className="mt-2 space-y-2 text-sm font-normal text-muted-foreground"><TipoLabel tipo={t.tipo} /><div>{t.oggetto ?? "—"}</div></div>}</TableCell>
C1 src/routes/_app/template-email.tsx +L130:                   <TableCell className="tablet:hidden"><TipoLabel tipo={t.tipo} /></TableCell>
C1 src/routes/_app/template-email.tsx +L131:                   <TableCell className="text-muted-foreground text-sm truncate max-w-md tablet:hidden">{t.oggetto}</TableCell>
C1 src/routes/_app/template-email.tsx +L132:                   <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/template-email.tsx -L133:                   <TableCell className="text-right">
C1 src/routes/_app/template-email.tsx +L135:                   <TableCell className="text-right tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C4 src/routes/_app/template-lettera.tsx +L1: import { useIsTablet } from "@/hooks/use-tablet";
C4 src/routes/_app/template-lettera.tsx +L53:   const isTablet = useIsTablet();
C1 src/routes/_app/template-lettera.tsx -L117:           <Table>
C1 src/routes/_app/template-lettera.tsx -L118:             <TableHeader>
C1 src/routes/_app/template-lettera.tsx +L119:           <Table className="tablet:table-fixed tablet:w-full tablet:max-lg:block">
C1 src/routes/_app/template-lettera.tsx +L120:             <TableHeader className="tablet:max-lg:hidden">
C1 src/routes/_app/template-lettera.tsx -L120:                 <TableHead>Nome</TableHead>
C1 src/routes/_app/template-lettera.tsx -L121:                 <TableHead>Tipo</TableHead>
C1 src/routes/_app/template-lettera.tsx -L122:                 <TableHead>Oggetto</TableHead>
C1 src/routes/_app/template-lettera.tsx -L123:                 <TableHead className="w-32">Dati auto</TableHead>
C1 src/routes/_app/template-lettera.tsx -L124:                 <TableHead className="w-24">Attivo</TableHead>
C1 src/routes/_app/template-lettera.tsx -L125:                 <TableHead className="w-32 text-right">Azioni</TableHead>
C1 src/routes/_app/template-lettera.tsx +L122:                 <TableHead className="tablet:w-[65%]">Nome</TableHead>
C1 src/routes/_app/template-lettera.tsx +L123:                 <TableHead className="tablet:hidden">Tipo</TableHead>
C1 src/routes/_app/template-lettera.tsx +L124:                 <TableHead className="tablet:hidden">Oggetto</TableHead>
C1 src/routes/_app/template-lettera.tsx +L125:                 <TableHead className="w-32 tablet:hidden">Dati auto</TableHead>
C1 src/routes/_app/template-lettera.tsx +L126:                 <TableHead className="w-24 tablet:w-32">Attivo</TableHead>
C1 src/routes/_app/template-lettera.tsx +L127:                 <TableHead className="w-32 text-right tablet:w-28">Azioni</TableHead>
C1 src/routes/_app/template-lettera.tsx -L128:             <TableBody>
C1 src/routes/_app/template-lettera.tsx +L130:             <TableBody className="tablet:max-lg:block">
C1 src/routes/_app/template-lettera.tsx -L130:                 <TableRow key={t.id}>
C1 src/routes/_app/template-lettera.tsx -L131:                   <TableCell className="font-medium">{t.nome}</TableCell>
C1 src/routes/_app/template-lettera.tsx -L132:                   <TableCell><TipoLabel tipo={t.tipo} /></TableCell>
C1 src/routes/_app/template-lettera.tsx -L133:                   <TableCell className="text-muted-foreground text-sm truncate max-w-md">{t.oggetto ?? "—"}</TableCell>
C1 src/routes/_app/template-lettera.tsx -L134:                   <TableCell>
C1 src/routes/_app/template-lettera.tsx +L132:                 <TableRow key={t.id} className="tablet:max-lg:grid tablet:max-lg:grid-cols-[minmax(0,1fr)_auto] tablet:max-lg:p-3">
C2 src/routes/_app/template-lettera.tsx +L133:                   <TableCell className="font-medium tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">{t.nome}{isTablet && <div className="mt-2 space-y-2 text-sm font-normal text-muted-foreground"><TipoLabel tipo={t.tipo} /><div>{t.oggetto ?? "—"}</div><Badge variant="outline">{t.usa_dati_automatici ? "Auto" : "Libero"}</Badge></div>}</TableCell>
C1 src/routes/_app/template-lettera.tsx +L134:                   <TableCell className="tablet:hidden"><TipoLabel tipo={t.tipo} /></TableCell>
C1 src/routes/_app/template-lettera.tsx +L135:                   <TableCell className="text-muted-foreground text-sm truncate max-w-md tablet:hidden">{t.oggetto ?? "—"}</TableCell>
C1 src/routes/_app/template-lettera.tsx +L136:                   <TableCell className="tablet:hidden">
C1 src/routes/_app/template-lettera.tsx -L137:                   <TableCell>
C1 src/routes/_app/template-lettera.tsx +L139:                   <TableCell className="tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
C1 src/routes/_app/template-lettera.tsx -L140:                   <TableCell className="text-right">
C1 src/routes/_app/template-lettera.tsx +L142:                   <TableCell className="text-right tablet:whitespace-normal tablet:break-words tablet:align-top tablet:max-lg:block tablet:max-lg:min-w-0">
```

## FM80 Alert fidi (17/11/2026)

File: `src/routes/_app/alert-fidi.tsx` (solo impaginazione; dati, filtri, permessi e logica invariati).

### Diagnosi (prima, 14 avvisi finti, larghezza reale colonna Perché)

| Dimensione | Perché | Note |
|---|---|---|
| 820×1180 touch | 0 px | tabella da md, testo una lettera per riga (22 elementi) |
| 1180×820 touch | 205 px | |
| 1024×768 mouse | 0 px | una lettera per riga (22) |
| 1280×800 mouse | 96 px | |
| 1440×900 mouse | 208 px | |
| 1600×900 mouse | 320 px | (riferimento ≥2xl) |

### Prova statica sul diff

- **Telefono (<768): invariato.** Nessuna classe senza prefisso è cambiata nelle schede; `ElencoSchede finoA` vale `"md"` e la Card `hidden md:block` quando `useIsTablet()` è falso (ramo false identico all'originale). La tabella è nascosta sotto md come prima.
- **PC ≥1536 (2xl): invariato.** Le nove colonne originali conservano le loro classi; quelle aggiunte sono `hidden 2xl:table-cell` (attive come `table-cell` da 2xl, stessa resa), `max-2xl:w-[…]` (non applicate da 2xl) e i nuovi elementi `2xl:hidden` (colonna Fido e "Alert dal"/azioni dentro Ultima decisione: `display:none`, nessuno spazio). `renderNumeriGriglia(a)` senza secondo argomento produce la stessa classe di prima.
- **Tablet (useIsTablet):** verticale <1024 schede (`finoA="lg"`, tabella `hidden lg:block`); orizzontale ≥1024 la stessa tabella compatta del PC sotto 2xl.
- **PC 768–1535 (cambiato apposta):** sei colonne invece di nove: Fido Gamma / Ci deve / Fido teorico raccolti in una colonna "Fido" (w-32, `renderNumeriGriglia(a, true)`: stessa fonte, una colonna); "Alert dal" e "Apri proposta" sotto Ultima decisione; Cliente 19% e Ultima decisione 17% (prima 17%/13%); Perché prende il resto.
- ALTRO: `import useIsTablet` e `const isTablet = useIsTablet()` (nessun effetto su telefono/PC: al primo render vale false, come nelle fette FM79); parametro opzionale `unaColonna` di `renderNumeriGriglia` (default = comportamento precedente).

### Foto e misure (dopo)

| Dimensione | Vista | Perché | px nascosti | una lettera | target <40 |
|---|---|---|---|---|---|
| 768×1024 touch | schede | — | 0 | 0 | 0 |
| 820×1180 touch | schede | — | 0 | 0 | 0 |
| 1180×820 touch | tabella compatta | 524 px | 0 | 0 | 0 |
| 1366×1024 touch | tabella compatta | 629 px | 0 | 0 | 0 |
| 1024×768 mouse | tabella compatta | 261 px | 0 | 0 | (caselle 16px su mouse, come prima) |
| 1280×800 mouse | tabella compatta | 425 px | 0 | 0 | idem |
| 1440×900 mouse | tabella compatta | 527 px | 0 | 0 | idem |

- **375×812** e **1600×900**: prima/dopo identiche pixel per pixel al primo confronto (nessun 3+3 necessario). A 1600 la colonna Perché resta 320 px come oggi (tabella originale invariata).
- Limite: dati simulati; motivi colorati delle righe non riprodotti dalla fixture (codici segnalazione finti).
