# Tassonomia Mestiere / Settore

Estratto dal knowledge di progetto il 08/10/2026 (sessione 40). Si aggiorna modificando questo file.

## 8. Tassonomia Mestiere / Settore

Tabella unica `categorie_segmento` (`dimensione` = `'mestiere'`|`'settore'`, `parent_id` per sotto-famiglie).
- **Mestiere** (`lead.mestiere_id`, `clienti.mestiere_id`): chi è il soggetto; propagato da lead a cliente in `converti_lead_in_cliente`.
- **Settore** (`opportunita.settore_id`): cosa cerca in quell'occasione.
- Ogni cambio di Mestiere va storicizzato in `categoria_storico` (solo INSERT).
- `macrocategorie`/`categorie_cliente` sono dell'import GAMMA: OFF LIMITS.
- Riusa `useCategorieSegmento(dimensione)` e `<SegmentoSelect>`.
