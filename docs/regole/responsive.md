# Responsive: ogni larghezza, non solo il telefono

Regola permanente del proprietario. Si aggiunge alla sezione 1 del knowledge.

- Responsive vale da 320px a 1920px. Su PC la pagina non deve allargarsi con riquadri enormi, testo sovradimensionato e spazio vuoto.
- Contenitore con larghezza massima (`max-w-6xl`/`max-w-7xl`), mai colonne uniche larghe con metà schermo vuota.
- Pagine di dettaglio da `xl` (≥1280px): due colonne, principale ~2/3 e laterale ~1/3 (stato, azioni, cronologia) `sticky` con scroll proprio. Sotto `xl` una colonna con stato e azioni in alto.
- Card compatte: spaziatura tra card `gap-3`/`space-y-3`, padding `p-3` mobile e `p-4` desktop; riquadri dati `p-2.5`, etichetta `text-[11px]`, valore `text-base` (solo i dati principali `text-lg`).
- Righe etichetta/valore in griglia a 2 colonne (`grid-cols-[7rem_minmax(0,1fr)]`), non impilate.
- Verificare sempre a 390, 768, 1280 e 1920px: nessuno scroll orizzontale, nessuna colonna stretta illeggibile.
