CREATE OR REPLACE FUNCTION public.bulk_update_clienti_anagrafica(_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF current_setting('role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Operazione non consentita';
  END IF;

  -- Stessa semantica dell'update per-riga via PostgREST: una colonna viene scritta
  -- SOLO se la chiave è presente nel JSON (anche con valore null => NULL);
  -- chiave assente => colonna invariata.
  WITH upd AS (
    UPDATE public.clienti c
    SET
      ragione_sociale          = CASE WHEN p ? 'ragione_sociale'          THEN p->>'ragione_sociale'          ELSE c.ragione_sociale          END,
      codice_gestionale        = CASE WHEN p ? 'codice_gestionale'        THEN p->>'codice_gestionale'        ELSE c.codice_gestionale        END,
      partita_iva              = CASE WHEN p ? 'partita_iva'              THEN p->>'partita_iva'              ELSE c.partita_iva              END,
      codice_fiscale           = CASE WHEN p ? 'codice_fiscale'           THEN p->>'codice_fiscale'           ELSE c.codice_fiscale           END,
      tipo_soggetto            = CASE WHEN p ? 'tipo_soggetto'            THEN p->>'tipo_soggetto'            ELSE c.tipo_soggetto            END,
      indirizzo                = CASE WHEN p ? 'indirizzo'                THEN p->>'indirizzo'                ELSE c.indirizzo                END,
      citta                    = CASE WHEN p ? 'citta'                    THEN p->>'citta'                    ELSE c.citta                    END,
      cap                      = CASE WHEN p ? 'cap'                      THEN p->>'cap'                      ELSE c.cap                      END,
      provincia                = CASE WHEN p ? 'provincia'                THEN p->>'provincia'                ELSE c.provincia                END,
      telefono                 = CASE WHEN p ? 'telefono'                 THEN p->>'telefono'                 ELSE c.telefono                 END,
      cellulare                = CASE WHEN p ? 'cellulare'                THEN p->>'cellulare'                ELSE c.cellulare                END,
      telefono_2               = CASE WHEN p ? 'telefono_2'               THEN p->>'telefono_2'               ELSE c.telefono_2               END,
      email                    = CASE WHEN p ? 'email'                    THEN p->>'email'                    ELSE c.email                    END,
      pec                      = CASE WHEN p ? 'pec'                      THEN p->>'pec'                      ELSE c.pec                      END,
      codice_sdi               = CASE WHEN p ? 'codice_sdi'               THEN p->>'codice_sdi'               ELSE c.codice_sdi               END,
      note                     = CASE WHEN p ? 'note'                     THEN p->>'note'                     ELSE c.note                     END,
      codice_macrocategoria    = CASE WHEN p ? 'codice_macrocategoria'    THEN p->>'codice_macrocategoria'    ELSE c.codice_macrocategoria    END,
      macrocategoria           = CASE WHEN p ? 'macrocategoria'           THEN p->>'macrocategoria'           ELSE c.macrocategoria           END,
      codice_categoria         = CASE WHEN p ? 'codice_categoria'         THEN p->>'codice_categoria'         ELSE c.codice_categoria         END,
      categoria                = CASE WHEN p ? 'categoria'                THEN p->>'categoria'                ELSE c.categoria                END,
      codice_agente            = CASE WHEN p ? 'codice_agente'            THEN p->>'codice_agente'            ELSE c.codice_agente            END,
      agente                   = CASE WHEN p ? 'agente'                   THEN p->>'agente'                   ELSE c.agente                   END,
      condizione_pagamento_cod = CASE WHEN p ? 'condizione_pagamento_cod' THEN p->>'condizione_pagamento_cod' ELSE c.condizione_pagamento_cod END,
      condizione_pagamento_desc= CASE WHEN p ? 'condizione_pagamento_desc'THEN p->>'condizione_pagamento_desc'ELSE c.condizione_pagamento_desc END,
      condizioni_pagamento     = CASE WHEN p ? 'condizioni_pagamento'     THEN p->>'condizioni_pagamento'     ELSE c.condizioni_pagamento     END,
      store_id                 = CASE WHEN p ? 'store_id'                 THEN (p->>'store_id')::uuid         ELSE c.store_id                 END
    FROM jsonb_array_elements(_rows) AS p
    WHERE c.id = (p->>'id')::uuid
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_update_clienti_anagrafica(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_clienti_anagrafica(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';