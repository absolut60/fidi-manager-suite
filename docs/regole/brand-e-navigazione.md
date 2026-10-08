# Brand e navigazione

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 6. Asset di brand: un solo logo originale

Il logo MADE esiste in tre file base64 (`logo-made-base64.ts`, `logo-made-email-base64.ts`, `logo-made-sidebar-base64.ts`). Nessuna nuova variante va creata a mano o ricostruita da una descrizione: va derivata dal logo ufficiale; se non è chiaro quale sia, chiedere.

## 7. Pulsante "Indietro" nelle schede di dettaglio

Ogni pagina di dettaglio raggiungibile da più punti usa `<BackButton fallbackTo="..." fallbackLabel="..." iconOnly? />` (`src/components/back-button.tsx`), non un link fisso. Limite noto: filtri/scroll in state locale non vengono conservati. Per una nuova pagina, allargare l'unione di tipo `fallbackTo` con il percorso letterale (non `string`). Già applicato a: clienti.$clienteId, lead.$leadId, richieste.$richiestaId, task.$id, articoli.$id, kit.$id, preventivatore.$id, eventi.$eventoId.
