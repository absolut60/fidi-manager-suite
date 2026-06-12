INSERT INTO public.template_email (nome, tipo, oggetto, corpo, attivo) VALUES
(
  'Primo sollecito',
  'sollecito_1',
  'Sollecito di pagamento — {{ragione_sociale}}',
  '<p>Spettabile <strong>{{ragione_sociale}}</strong>,</p>
<p>dai nostri controlli amministrativi in data {{data_oggi}} risultano le seguenti scadenze non ancora regolarizzate, per un totale di <strong>{{totale_scaduto}}</strong>:</p>
{{elenco_scadenze}}
<p>Vi preghiamo cortesemente di provvedere al pagamento al più presto. Qualora abbiate già provveduto, considerate la presente come non inviata.</p>
<p>Restiamo a disposizione per qualsiasi chiarimento.</p>
<p>Cordiali saluti,<br>{{nome_operatore}}</p>',
  true
),
(
  'Secondo sollecito',
  'sollecito_2',
  'Secondo sollecito — pagamento scaduto {{totale_scaduto}}',
  '<p>Spettabile <strong>{{ragione_sociale}}</strong>,</p>
<p>nonostante il precedente sollecito, alla data del {{data_oggi}} risultano ancora insoluti i seguenti documenti per un importo complessivo di <strong>{{totale_scaduto}}</strong>:</p>
{{elenco_scadenze}}
<p>Vi invitiamo a saldare quanto dovuto entro <strong>7 giorni</strong> dalla ricezione della presente, al fine di evitare il passaggio della pratica alle vie legali.</p>
<p>In attesa di un Vostro tempestivo riscontro, porgiamo distinti saluti.</p>
<p>{{nome_operatore}}</p>',
  true
),
(
  'Messa in mora',
  'messa_in_mora',
  'Costituzione in mora — {{ragione_sociale}}',
  '<p>Spett.le <strong>{{ragione_sociale}}</strong>,</p>
<p>con la presente, ai sensi e per gli effetti dell''art. 1219 c.c., Vi costituiamo formalmente in mora per il pagamento dei seguenti documenti, scaduti e non onorati, per un ammontare complessivo di <strong>{{totale_scaduto}}</strong>:</p>
{{elenco_scadenze}}
<p>Vi diffidiamo a provvedere al saldo integrale di quanto dovuto, oltre interessi di mora ex D.Lgs. 231/2002, entro e non oltre <strong>15 giorni</strong> dal ricevimento della presente.</p>
<p>In difetto, la pratica sarà trasmessa senza ulteriore preavviso al nostro Ufficio Legale per il recupero coattivo del credito, con aggravio a Vostro carico di ogni ulteriore spesa.</p>
<p>Data: {{data_oggi}}</p>
<p>Distinti saluti,<br>{{nome_operatore}}</p>',
  true
);