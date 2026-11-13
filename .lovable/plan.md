# Testata preventivo compatta

- Disporre Documento/Cliente e Condizioni commerciali/Cantiere su due colonne 62%/38% da 1024px, con Note a tutta larghezza; sotto 1024px una colonna.
- Aggiungere la densità compatta opt-in a RiquadroScheda senza alterare gli altri utilizzi.
- Compattare campi, dati cliente, condizioni e Note mantenendo identici tutti i gestori di salvataggio e selezione. Rendere compatti e posizionare sotto il selettore i pulsanti Cantiere solo nella Testata, senza modificare il componente del cantiere.
- Il picker cliente diventa l'intestazione del suo riquadro, senza duplicare il nome; in sola lettura resta il testo in grassetto.

## Assunzione da confermare
L'elenco Documento contiene **9 campi**, non 8; con Titolo largo due colonne occupa 10 celle. Per mantenere due righe si useranno **5 colonne** su desktop (Titolo, Numero, Data, Validità sulla prima; Tipo, Stato, Agente, Alternativa sulla seconda con Alternativa larga due colonne). Su telefono i campi andranno a capo senza perdere testo.

## Dettagli tecnici e verifiche
- Modifiche funzionali escluse: database, save/onSave, picker, pagamento e cantiere invariati. Stessa eccezione esistente per Stato editabile nei documenti bloccati.
- File applicativi: TestataPreventivo.tsx e RiquadroScheda.tsx; aggiornamento dei soli documenti di lavoro richiesti.
- Eseguire bun test, confrontare i gestori prima/dopo e controllare la compilazione automatica.
- Verificare con schermate a 1280/1600px in modifica e sola lettura e a 375px, usando dati finti se necessario e rimuovendo la pagina temporanea.
- Riportare file toccati e SHA disponibile; nessuna migrazione.