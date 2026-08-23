export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agenti: {
        Row: {
          codice: string
          created_at: string
          descrizione: string
          updated_at: string
        }
        Insert: {
          codice: string
          created_at?: string
          descrizione: string
          updated_at?: string
        }
        Update: {
          codice?: string
          created_at?: string
          descrizione?: string
          updated_at?: string
        }
        Relationships: []
      }
      allegati: {
        Row: {
          caricato_da: string | null
          cliente_id: string | null
          created_at: string
          descrizione: string | null
          dimensione_bytes: number | null
          entita_id: string
          entita_tipo: string
          id: string
          mime_type: string | null
          nome_file: string
          storage_path: string
        }
        Insert: {
          caricato_da?: string | null
          cliente_id?: string | null
          created_at?: string
          descrizione?: string | null
          dimensione_bytes?: number | null
          entita_id: string
          entita_tipo: string
          id?: string
          mime_type?: string | null
          nome_file: string
          storage_path: string
        }
        Update: {
          caricato_da?: string | null
          cliente_id?: string | null
          created_at?: string
          descrizione?: string | null
          dimensione_bytes?: number | null
          entita_id?: string
          entita_tipo?: string
          id?: string
          mime_type?: string | null
          nome_file?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "allegati_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allegati_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allegati_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      anomalie_import: {
        Row: {
          campo: string
          cliente_id: string | null
          codice_gestionale: string | null
          created_at: string
          gestita_at: string | null
          gestita_da: string | null
          id: string
          importazione_id: string | null
          ragione_sociale: string | null
          stato: string
          tipo_anomalia: string
          valore_attuale: string | null
          valore_nuovo: string | null
        }
        Insert: {
          campo: string
          cliente_id?: string | null
          codice_gestionale?: string | null
          created_at?: string
          gestita_at?: string | null
          gestita_da?: string | null
          id?: string
          importazione_id?: string | null
          ragione_sociale?: string | null
          stato?: string
          tipo_anomalia: string
          valore_attuale?: string | null
          valore_nuovo?: string | null
        }
        Update: {
          campo?: string
          cliente_id?: string | null
          codice_gestionale?: string | null
          created_at?: string
          gestita_at?: string | null
          gestita_da?: string | null
          id?: string
          importazione_id?: string | null
          ragione_sociale?: string | null
          stato?: string
          tipo_anomalia?: string
          valore_attuale?: string | null
          valore_nuovo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anomalie_import_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomalie_import_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomalie_import_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "anomalie_import_gestita_da_fkey"
            columns: ["gestita_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomalie_import_importazione_id_fkey"
            columns: ["importazione_id"]
            isOneToOne: false
            referencedRelation: "importazioni"
            referencedColumns: ["id"]
          },
        ]
      }
      approvazioni: {
        Row: {
          approvatore_id: string
          created_at: string
          esito: Database["public"]["Enums"]["esito_approvazione"]
          id: string
          importo_approvato: number | null
          livello: number
          note: string | null
          richiesta_id: string
        }
        Insert: {
          approvatore_id: string
          created_at?: string
          esito: Database["public"]["Enums"]["esito_approvazione"]
          id?: string
          importo_approvato?: number | null
          livello: number
          note?: string | null
          richiesta_id: string
        }
        Update: {
          approvatore_id?: string
          created_at?: string
          esito?: Database["public"]["Enums"]["esito_approvazione"]
          id?: string
          importo_approvato?: number | null
          livello?: number
          note?: string | null
          richiesta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvazioni_richiesta_id_fkey"
            columns: ["richiesta_id"]
            isOneToOne: false
            referencedRelation: "richieste_fido"
            referencedColumns: ["id"]
          },
        ]
      }
      area_membri: {
        Row: {
          area_id: string
          created_at: string
          id: string
          ruolo_area: string
          user_id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          ruolo_area?: string
          user_id: string
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          ruolo_area?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_membri_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "aree_funzionali"
            referencedColumns: ["id"]
          },
        ]
      }
      aree_funzionali: {
        Row: {
          attiva: boolean
          created_at: string
          id: string
          nome: string
          store_id: string | null
          tipo: Database["public"]["Enums"]["tipo_area"]
          updated_at: string
        }
        Insert: {
          attiva?: boolean
          created_at?: string
          id?: string
          nome: string
          store_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_area"]
          updated_at?: string
        }
        Update: {
          attiva?: boolean
          created_at?: string
          id?: string
          nome?: string
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_area"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aree_funzionali_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      articoli: {
        Row: {
          categoria: string | null
          cod_fornitore: string | null
          cod_gamma: string | null
          componente: string | null
          created_at: string
          descrizione: string
          fornitore_id: string | null
          id: string
          note: string | null
          note_acquisto: string | null
          peso_unit: number | null
          qta_cliente: number | null
          qta_fornitore: number | null
          stato: Database["public"]["Enums"]["stato_articolo"]
          tipologia: string | null
          um: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          cod_fornitore?: string | null
          cod_gamma?: string | null
          componente?: string | null
          created_at?: string
          descrizione: string
          fornitore_id?: string | null
          id?: string
          note?: string | null
          note_acquisto?: string | null
          peso_unit?: number | null
          qta_cliente?: number | null
          qta_fornitore?: number | null
          stato?: Database["public"]["Enums"]["stato_articolo"]
          tipologia?: string | null
          um?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          cod_fornitore?: string | null
          cod_gamma?: string | null
          componente?: string | null
          created_at?: string
          descrizione?: string
          fornitore_id?: string | null
          id?: string
          note?: string | null
          note_acquisto?: string | null
          peso_unit?: number | null
          qta_cliente?: number | null
          qta_fornitore?: number | null
          stato?: Database["public"]["Enums"]["stato_articolo"]
          tipologia?: string | null
          um?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articoli_fornitore_id_fkey"
            columns: ["fornitore_id"]
            isOneToOne: false
            referencedRelation: "fornitori"
            referencedColumns: ["id"]
          },
        ]
      }
      assicurazioni_credito: {
        Row: {
          assicuratore: string
          cliente_id: string
          costo_assicurazione: number | null
          created_at: string
          data_apertura_sinistro: string | null
          data_inizio: string | null
          data_scadenza: string | null
          esito_sinistro: string | null
          gestita_da: string | null
          id: string
          importo_assicurato: number | null
          importo_massimale: number | null
          importo_sinistro: number | null
          note: string | null
          note_sinistro: string | null
          numero_polizza: string | null
          numero_sinistro: string | null
          sinistro_aperto: boolean | null
          stato: Database["public"]["Enums"]["stato_polizza"]
          updated_at: string
        }
        Insert: {
          assicuratore: string
          cliente_id: string
          costo_assicurazione?: number | null
          created_at?: string
          data_apertura_sinistro?: string | null
          data_inizio?: string | null
          data_scadenza?: string | null
          esito_sinistro?: string | null
          gestita_da?: string | null
          id?: string
          importo_assicurato?: number | null
          importo_massimale?: number | null
          importo_sinistro?: number | null
          note?: string | null
          note_sinistro?: string | null
          numero_polizza?: string | null
          numero_sinistro?: string | null
          sinistro_aperto?: boolean | null
          stato?: Database["public"]["Enums"]["stato_polizza"]
          updated_at?: string
        }
        Update: {
          assicuratore?: string
          cliente_id?: string
          costo_assicurazione?: number | null
          created_at?: string
          data_apertura_sinistro?: string | null
          data_inizio?: string | null
          data_scadenza?: string | null
          esito_sinistro?: string | null
          gestita_da?: string | null
          id?: string
          importo_assicurato?: number | null
          importo_massimale?: number | null
          importo_sinistro?: number | null
          note?: string | null
          note_sinistro?: string | null
          numero_polizza?: string | null
          numero_sinistro?: string | null
          sinistro_aperto?: boolean | null
          stato?: Database["public"]["Enums"]["stato_polizza"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assicurazioni_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assicurazioni_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assicurazioni_credito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "assicurazioni_credito_gestita_da_fkey"
            columns: ["gestita_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
        ]
      }
      attivita_commerciale: {
        Row: {
          agente_codice: string | null
          cliente_id: string | null
          completata: boolean
          created_at: string
          data_pianificata: string | null
          data_svolgimento: string | null
          descrizione: string | null
          esito: string | null
          id: string
          lead_id: string | null
          luogo: string | null
          note: string | null
          operatore_id: string | null
          opportunita_id: string | null
          store_id: string | null
          tipo: Database["public"]["Enums"]["tipo_attivita_commerciale"]
          titolo: string
          updated_at: string
        }
        Insert: {
          agente_codice?: string | null
          cliente_id?: string | null
          completata?: boolean
          created_at?: string
          data_pianificata?: string | null
          data_svolgimento?: string | null
          descrizione?: string | null
          esito?: string | null
          id?: string
          lead_id?: string | null
          luogo?: string | null
          note?: string | null
          operatore_id?: string | null
          opportunita_id?: string | null
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_attivita_commerciale"]
          titolo: string
          updated_at?: string
        }
        Update: {
          agente_codice?: string | null
          cliente_id?: string | null
          completata?: boolean
          created_at?: string
          data_pianificata?: string | null
          data_svolgimento?: string | null
          descrizione?: string | null
          esito?: string | null
          id?: string
          lead_id?: string | null
          luogo?: string | null
          note?: string | null
          operatore_id?: string | null
          opportunita_id?: string | null
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_attivita_commerciale"]
          titolo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attivita_commerciale_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attivita_commerciale_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attivita_commerciale_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "attivita_commerciale_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attivita_commerciale_opportunita_id_fkey"
            columns: ["opportunita_id"]
            isOneToOne: false
            referencedRelation: "opportunita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attivita_commerciale_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          azione: string
          created_at: string
          dettagli: Json | null
          entita: string
          entita_id: string | null
          id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          azione: string
          created_at?: string
          dettagli?: Json | null
          entita: string
          entita_id?: string | null
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          azione?: string
          created_at?: string
          dettagli?: Json | null
          entita?: string
          entita_id?: string | null
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      azioni_recupero: {
        Row: {
          cliente_id: string
          created_at: string
          data_azione: string
          data_promessa_pagamento: string | null
          email_corpo_html: string | null
          email_destinatario: string | null
          email_log_id: string | null
          email_message_id: string | null
          email_oggetto: string | null
          esito: string
          id: string
          importo_riferimento: number | null
          livello_sollecito: number | null
          note: string | null
          operatore_id: string | null
          piano_rientro_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_azione?: string
          data_promessa_pagamento?: string | null
          email_corpo_html?: string | null
          email_destinatario?: string | null
          email_log_id?: string | null
          email_message_id?: string | null
          email_oggetto?: string | null
          esito?: string
          id?: string
          importo_riferimento?: number | null
          livello_sollecito?: number | null
          note?: string | null
          operatore_id?: string | null
          piano_rientro_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_azione?: string
          data_promessa_pagamento?: string | null
          email_corpo_html?: string | null
          email_destinatario?: string | null
          email_log_id?: string | null
          email_message_id?: string | null
          email_oggetto?: string | null
          esito?: string
          id?: string
          importo_riferimento?: number | null
          livello_sollecito?: number | null
          note?: string | null
          operatore_id?: string | null
          piano_rientro_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "azioni_recupero_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azioni_recupero_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azioni_recupero_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "azioni_recupero_piano_rientro_id_fkey"
            columns: ["piano_rientro_id"]
            isOneToOne: false
            referencedRelation: "piani_rientro"
            referencedColumns: ["id"]
          },
        ]
      }
      azioni_recupero_scadenze: {
        Row: {
          azione_id: string
          scadenza_id: string
        }
        Insert: {
          azione_id: string
          scadenza_id: string
        }
        Update: {
          azione_id?: string
          scadenza_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "azioni_recupero_scadenze_azione_id_fkey"
            columns: ["azione_id"]
            isOneToOne: false
            referencedRelation: "azioni_recupero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azioni_recupero_scadenze_scadenza_id_fkey"
            columns: ["scadenza_id"]
            isOneToOne: false
            referencedRelation: "scadenze"
            referencedColumns: ["id"]
          },
        ]
      }
      blocchi_preventivo: {
        Row: {
          created_at: string
          descrizione: string | null
          id: string
          importo: number | null
          kit_id: string | null
          note_tecniche: string | null
          ordine: number
          preventivo_id: string
          prezzo_um: number | null
          quantita_base: number | null
          rif_capitolato: string | null
          um_base: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          descrizione?: string | null
          id?: string
          importo?: number | null
          kit_id?: string | null
          note_tecniche?: string | null
          ordine?: number
          preventivo_id: string
          prezzo_um?: number | null
          quantita_base?: number | null
          rif_capitolato?: string | null
          um_base?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          descrizione?: string | null
          id?: string
          importo?: number | null
          kit_id?: string | null
          note_tecniche?: string | null
          ordine?: number
          preventivo_id?: string
          prezzo_um?: number | null
          quantita_base?: number | null
          rif_capitolato?: string | null
          um_base?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocchi_preventivo_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocchi_preventivo_preventivo_id_fkey"
            columns: ["preventivo_id"]
            isOneToOne: false
            referencedRelation: "preventivi"
            referencedColumns: ["id"]
          },
        ]
      }
      campagne_email_clic: {
        Row: {
          campagna_id: string
          created_at: string
          destinatario_id: string
          id: string
          ip_address: string | null
          url_destinazione: string
          user_agent: string | null
        }
        Insert: {
          campagna_id: string
          created_at?: string
          destinatario_id: string
          id?: string
          ip_address?: string | null
          url_destinazione: string
          user_agent?: string | null
        }
        Update: {
          campagna_id?: string
          created_at?: string
          destinatario_id?: string
          id?: string
          ip_address?: string | null
          url_destinazione?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campagne_email_clic_campagna_id_fkey"
            columns: ["campagna_id"]
            isOneToOne: false
            referencedRelation: "campagne_email_marketing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_email_clic_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "campagne_email_destinatari"
            referencedColumns: ["id"]
          },
        ]
      }
      campagne_email_destinatari: {
        Row: {
          aggiunto_da: string | null
          aggiunto_il: string
          campagna_id: string
          cliente_id: string | null
          contatto_id: string | null
          email: string
          errore: string | null
          id: string
          inviato_at: string | null
          message_id: string | null
          nome_riferimento: string | null
          num_clic: number
          primo_clic_at: string | null
          stato_invio: string
          tipo_destinatario: string
          tracking_token: string | null
          ultimo_clic_at: string | null
        }
        Insert: {
          aggiunto_da?: string | null
          aggiunto_il?: string
          campagna_id: string
          cliente_id?: string | null
          contatto_id?: string | null
          email: string
          errore?: string | null
          id?: string
          inviato_at?: string | null
          message_id?: string | null
          nome_riferimento?: string | null
          num_clic?: number
          primo_clic_at?: string | null
          stato_invio?: string
          tipo_destinatario: string
          tracking_token?: string | null
          ultimo_clic_at?: string | null
        }
        Update: {
          aggiunto_da?: string | null
          aggiunto_il?: string
          campagna_id?: string
          cliente_id?: string | null
          contatto_id?: string | null
          email?: string
          errore?: string | null
          id?: string
          inviato_at?: string | null
          message_id?: string | null
          nome_riferimento?: string | null
          num_clic?: number
          primo_clic_at?: string | null
          stato_invio?: string
          tipo_destinatario?: string
          tracking_token?: string | null
          ultimo_clic_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campagne_email_destinatari_campagna_id_fkey"
            columns: ["campagna_id"]
            isOneToOne: false
            referencedRelation: "campagne_email_marketing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_email_destinatari_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_email_destinatari_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_email_destinatari_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "campagne_email_destinatari_contatto_id_fkey"
            columns: ["contatto_id"]
            isOneToOne: false
            referencedRelation: "contatti"
            referencedColumns: ["id"]
          },
        ]
      }
      campagne_email_marketing: {
        Row: {
          clic_totali: number
          clic_unici: number
          corpo_html: string
          created_at: string
          created_by: string | null
          falliti: number
          id: string
          inviata_at: string | null
          inviati: number
          nome: string
          note: string | null
          oggetto: string
          operatore_id: string | null
          saltati: number
          stato: string
          updated_at: string
        }
        Insert: {
          clic_totali?: number
          clic_unici?: number
          corpo_html?: string
          created_at?: string
          created_by?: string | null
          falliti?: number
          id?: string
          inviata_at?: string | null
          inviati?: number
          nome: string
          note?: string | null
          oggetto: string
          operatore_id?: string | null
          saltati?: number
          stato?: string
          updated_at?: string
        }
        Update: {
          clic_totali?: number
          clic_unici?: number
          corpo_html?: string
          created_at?: string
          created_by?: string | null
          falliti?: number
          id?: string
          inviata_at?: string | null
          inviati?: number
          nome?: string
          note?: string | null
          oggetto?: string
          operatore_id?: string | null
          saltati?: number
          stato?: string
          updated_at?: string
        }
        Relationships: []
      }
      campagne_sollecito: {
        Row: {
          completata_at: string | null
          created_at: string
          falliti: number
          id: string
          inviati: number
          mesi: string[] | null
          note: string | null
          operatore_id: string | null
          preferenza_indirizzo: string
          saltati: number
          stato: string
          template_id: string | null
          tipo_campagna: string
          totale_destinatari: number
          updated_at: string
        }
        Insert: {
          completata_at?: string | null
          created_at?: string
          falliti?: number
          id?: string
          inviati?: number
          mesi?: string[] | null
          note?: string | null
          operatore_id?: string | null
          preferenza_indirizzo?: string
          saltati?: number
          stato?: string
          template_id?: string | null
          tipo_campagna?: string
          totale_destinatari?: number
          updated_at?: string
        }
        Update: {
          completata_at?: string | null
          created_at?: string
          falliti?: number
          id?: string
          inviati?: number
          mesi?: string[] | null
          note?: string | null
          operatore_id?: string | null
          preferenza_indirizzo?: string
          saltati?: number
          stato?: string
          template_id?: string | null
          tipo_campagna?: string
          totale_destinatari?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campagne_sollecito_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "template_email"
            referencedColumns: ["id"]
          },
        ]
      }
      campagne_sollecito_destinatari: {
        Row: {
          azione_id: string | null
          campagna_id: string
          cliente_id: string
          created_at: string
          errore: string | null
          id: string
          importo_riferimento: number | null
          indirizzo_usato: string | null
          inviato_at: string | null
          message_id: string | null
          stato: string
        }
        Insert: {
          azione_id?: string | null
          campagna_id: string
          cliente_id: string
          created_at?: string
          errore?: string | null
          id?: string
          importo_riferimento?: number | null
          indirizzo_usato?: string | null
          inviato_at?: string | null
          message_id?: string | null
          stato?: string
        }
        Update: {
          azione_id?: string | null
          campagna_id?: string
          cliente_id?: string
          created_at?: string
          errore?: string | null
          id?: string
          importo_riferimento?: number | null
          indirizzo_usato?: string | null
          inviato_at?: string | null
          message_id?: string | null
          stato?: string
        }
        Relationships: [
          {
            foreignKeyName: "campagne_sollecito_destinatari_azione_id_fkey"
            columns: ["azione_id"]
            isOneToOne: false
            referencedRelation: "azioni_recupero"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_sollecito_destinatari_campagna_id_fkey"
            columns: ["campagna_id"]
            isOneToOne: false
            referencedRelation: "campagne_sollecito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_sollecito_destinatari_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_sollecito_destinatari_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campagne_sollecito_destinatari_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      campagne_whatsapp: {
        Row: {
          creata_da: string | null
          created_at: string
          id: string
          inviata_at: string | null
          invii_falliti: number | null
          invii_ok: number | null
          messaggio: string | null
          nome: string
          parametri: Json | null
          template_name: string
          totale_invii: number | null
        }
        Insert: {
          creata_da?: string | null
          created_at?: string
          id?: string
          inviata_at?: string | null
          invii_falliti?: number | null
          invii_ok?: number | null
          messaggio?: string | null
          nome: string
          parametri?: Json | null
          template_name: string
          totale_invii?: number | null
        }
        Update: {
          creata_da?: string | null
          created_at?: string
          id?: string
          inviata_at?: string | null
          invii_falliti?: number | null
          invii_ok?: number | null
          messaggio?: string | null
          nome?: string
          parametri?: Json | null
          template_name?: string
          totale_invii?: number | null
        }
        Relationships: []
      }
      canale_membri: {
        Row: {
          canale_id: string
          created_at: string
          id: string
          ultimo_letto_at: string | null
          user_id: string
        }
        Insert: {
          canale_id: string
          created_at?: string
          id?: string
          ultimo_letto_at?: string | null
          user_id: string
        }
        Update: {
          canale_id?: string
          created_at?: string
          id?: string
          ultimo_letto_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canale_membri_canale_id_fkey"
            columns: ["canale_id"]
            isOneToOne: false
            referencedRelation: "canali"
            referencedColumns: ["id"]
          },
        ]
      }
      canali: {
        Row: {
          area_id: string | null
          attivo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string | null
          store_id: string | null
          tipo: Database["public"]["Enums"]["tipo_canale"]
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          attivo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string | null
          store_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_canale"]
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          attivo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string | null
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_canale"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canali_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "aree_funzionali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canali_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cantiere_listini_speciali: {
        Row: {
          cantiere_id: string
          cod_gamma: string
          costo_netto_speciale: number | null
          created_at: string
          id: string
          note: string | null
          prezzo_vendita_speciale: number | null
          updated_at: string
        }
        Insert: {
          cantiere_id: string
          cod_gamma: string
          costo_netto_speciale?: number | null
          created_at?: string
          id?: string
          note?: string | null
          prezzo_vendita_speciale?: number | null
          updated_at?: string
        }
        Update: {
          cantiere_id?: string
          cod_gamma?: string
          costo_netto_speciale?: number | null
          created_at?: string
          id?: string
          note?: string | null
          prezzo_vendita_speciale?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cantiere_listini_speciali_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
        ]
      }
      cantieri: {
        Row: {
          agente_codice: string | null
          attivo: boolean
          cap: string | null
          categoria: string | null
          citta: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          data_fine_prevista: string | null
          data_inizio: string | null
          descrizione: string | null
          geocodifica_messaggio: string | null
          geocodifica_stato: string | null
          geocodificato_il: string | null
          id: string
          indirizzo: string | null
          lat: number | null
          lead_id: string | null
          lng: number | null
          nome: string
          note: string | null
          provincia: string | null
          referente: string | null
          sede_piu_vicina_calcolata_il: string | null
          sede_piu_vicina_id: string | null
          sede_piu_vicina_km: number | null
          sede_piu_vicina_min: number | null
          updated_at: string
        }
        Insert: {
          agente_codice?: string | null
          attivo?: boolean
          cap?: string | null
          categoria?: string | null
          citta?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fine_prevista?: string | null
          data_inizio?: string | null
          descrizione?: string | null
          geocodifica_messaggio?: string | null
          geocodifica_stato?: string | null
          geocodificato_il?: string | null
          id?: string
          indirizzo?: string | null
          lat?: number | null
          lead_id?: string | null
          lng?: number | null
          nome: string
          note?: string | null
          provincia?: string | null
          referente?: string | null
          sede_piu_vicina_calcolata_il?: string | null
          sede_piu_vicina_id?: string | null
          sede_piu_vicina_km?: number | null
          sede_piu_vicina_min?: number | null
          updated_at?: string
        }
        Update: {
          agente_codice?: string | null
          attivo?: boolean
          cap?: string | null
          categoria?: string | null
          citta?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fine_prevista?: string | null
          data_inizio?: string | null
          descrizione?: string | null
          geocodifica_messaggio?: string | null
          geocodifica_stato?: string | null
          geocodificato_il?: string | null
          id?: string
          indirizzo?: string | null
          lat?: number | null
          lead_id?: string | null
          lng?: number | null
          nome?: string
          note?: string | null
          provincia?: string | null
          referente?: string | null
          sede_piu_vicina_calcolata_il?: string | null
          sede_piu_vicina_id?: string | null
          sede_piu_vicina_km?: number | null
          sede_piu_vicina_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cantieri_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantieri_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantieri_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cantieri_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cantieri_sede_piu_vicina_id_fkey"
            columns: ["sede_piu_vicina_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categorie_cliente: {
        Row: {
          codice: string
          label: string
        }
        Insert: {
          codice: string
          label: string
        }
        Update: {
          codice?: string
          label?: string
        }
        Relationships: []
      }
      clienti: {
        Row: {
          a_scadere: number | null
          abi: string | null
          agente: string | null
          agenzia: string | null
          assicurazione_attiva: boolean
          attivo: boolean
          banca: string | null
          bloccato: boolean
          bloccato_da: string | null
          cab: string | null
          cap: string | null
          categoria: string | null
          cellulare: string | null
          citta: string | null
          cliente_attivo: boolean
          codice_agente: string | null
          codice_assegnato: string | null
          codice_categoria: string | null
          codice_fiscale: string | null
          codice_gestionale: string | null
          codice_macrocategoria: string | null
          codice_sdi: string | null
          condizione_pagamento_cod: string | null
          condizione_pagamento_desc: string | null
          condizioni_pagamento: string | null
          condizioni_pagamento_concesse: string | null
          condizioni_pagamento_concordate: string | null
          created_at: string
          created_by: string | null
          data_affidamento_aziendale: string | null
          data_blocco: string | null
          data_esito_affidamento: string | null
          data_firma: string | null
          data_richiesta_affidamento: string | null
          dichiarante_cognome: string | null
          dichiarante_nome: string | null
          dilazione_concordata: number | null
          dilazione_effettiva: number | null
          doc_da_evadere: number | null
          doc_da_fatturare: number | null
          effetti_a_rischio: number | null
          email: string | null
          fascia_listino_default:
            | Database["public"]["Enums"]["fascia_listino"]
            | null
          fido: number | null
          fido_aziendale_concesso: number | null
          fido_gestionale: number | null
          fido_residuo: number | null
          firma_url: string | null
          id: string
          importo_affidamento_richiesto: number | null
          importo_affidato: number | null
          in_gestione_legale: boolean
          ind_blocco: number
          indirizzo: string | null
          macrocategoria: string | null
          motivo_blocco: string | null
          note: string | null
          note_amministrazione: string | null
          num_insoluti: number | null
          partita_iva: string | null
          pec: string | null
          privacy_firmata: boolean
          privacy_pdf_url: string | null
          privacy_token: string | null
          privacy_token_expires_at: string | null
          provincia: string | null
          ragione_sociale: string
          rating_esterno: string | null
          rating_esterno_data: string | null
          rating_esterno_fonte: string | null
          saldo_contabile: number | null
          scaduto: number | null
          scheda_pdf_url: string | null
          sede_operatore: string | null
          store_id: string | null
          telefono: string | null
          telefono_2: string | null
          tipo_soggetto: string | null
          totale_rischio: number | null
          ultima_data_fatturazione: string | null
          ultima_importazione_d: string | null
          ultima_sincronizzazione: string | null
          updated_at: string
        }
        Insert: {
          a_scadere?: number | null
          abi?: string | null
          agente?: string | null
          agenzia?: string | null
          assicurazione_attiva?: boolean
          attivo?: boolean
          banca?: string | null
          bloccato?: boolean
          bloccato_da?: string | null
          cab?: string | null
          cap?: string | null
          categoria?: string | null
          cellulare?: string | null
          citta?: string | null
          cliente_attivo?: boolean
          codice_agente?: string | null
          codice_assegnato?: string | null
          codice_categoria?: string | null
          codice_fiscale?: string | null
          codice_gestionale?: string | null
          codice_macrocategoria?: string | null
          codice_sdi?: string | null
          condizione_pagamento_cod?: string | null
          condizione_pagamento_desc?: string | null
          condizioni_pagamento?: string | null
          condizioni_pagamento_concesse?: string | null
          condizioni_pagamento_concordate?: string | null
          created_at?: string
          created_by?: string | null
          data_affidamento_aziendale?: string | null
          data_blocco?: string | null
          data_esito_affidamento?: string | null
          data_firma?: string | null
          data_richiesta_affidamento?: string | null
          dichiarante_cognome?: string | null
          dichiarante_nome?: string | null
          dilazione_concordata?: number | null
          dilazione_effettiva?: number | null
          doc_da_evadere?: number | null
          doc_da_fatturare?: number | null
          effetti_a_rischio?: number | null
          email?: string | null
          fascia_listino_default?:
            | Database["public"]["Enums"]["fascia_listino"]
            | null
          fido?: number | null
          fido_aziendale_concesso?: number | null
          fido_gestionale?: number | null
          fido_residuo?: number | null
          firma_url?: string | null
          id?: string
          importo_affidamento_richiesto?: number | null
          importo_affidato?: number | null
          in_gestione_legale?: boolean
          ind_blocco?: number
          indirizzo?: string | null
          macrocategoria?: string | null
          motivo_blocco?: string | null
          note?: string | null
          note_amministrazione?: string | null
          num_insoluti?: number | null
          partita_iva?: string | null
          pec?: string | null
          privacy_firmata?: boolean
          privacy_pdf_url?: string | null
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          provincia?: string | null
          ragione_sociale: string
          rating_esterno?: string | null
          rating_esterno_data?: string | null
          rating_esterno_fonte?: string | null
          saldo_contabile?: number | null
          scaduto?: number | null
          scheda_pdf_url?: string | null
          sede_operatore?: string | null
          store_id?: string | null
          telefono?: string | null
          telefono_2?: string | null
          tipo_soggetto?: string | null
          totale_rischio?: number | null
          ultima_data_fatturazione?: string | null
          ultima_importazione_d?: string | null
          ultima_sincronizzazione?: string | null
          updated_at?: string
        }
        Update: {
          a_scadere?: number | null
          abi?: string | null
          agente?: string | null
          agenzia?: string | null
          assicurazione_attiva?: boolean
          attivo?: boolean
          banca?: string | null
          bloccato?: boolean
          bloccato_da?: string | null
          cab?: string | null
          cap?: string | null
          categoria?: string | null
          cellulare?: string | null
          citta?: string | null
          cliente_attivo?: boolean
          codice_agente?: string | null
          codice_assegnato?: string | null
          codice_categoria?: string | null
          codice_fiscale?: string | null
          codice_gestionale?: string | null
          codice_macrocategoria?: string | null
          codice_sdi?: string | null
          condizione_pagamento_cod?: string | null
          condizione_pagamento_desc?: string | null
          condizioni_pagamento?: string | null
          condizioni_pagamento_concesse?: string | null
          condizioni_pagamento_concordate?: string | null
          created_at?: string
          created_by?: string | null
          data_affidamento_aziendale?: string | null
          data_blocco?: string | null
          data_esito_affidamento?: string | null
          data_firma?: string | null
          data_richiesta_affidamento?: string | null
          dichiarante_cognome?: string | null
          dichiarante_nome?: string | null
          dilazione_concordata?: number | null
          dilazione_effettiva?: number | null
          doc_da_evadere?: number | null
          doc_da_fatturare?: number | null
          effetti_a_rischio?: number | null
          email?: string | null
          fascia_listino_default?:
            | Database["public"]["Enums"]["fascia_listino"]
            | null
          fido?: number | null
          fido_aziendale_concesso?: number | null
          fido_gestionale?: number | null
          fido_residuo?: number | null
          firma_url?: string | null
          id?: string
          importo_affidamento_richiesto?: number | null
          importo_affidato?: number | null
          in_gestione_legale?: boolean
          ind_blocco?: number
          indirizzo?: string | null
          macrocategoria?: string | null
          motivo_blocco?: string | null
          note?: string | null
          note_amministrazione?: string | null
          num_insoluti?: number | null
          partita_iva?: string | null
          pec?: string | null
          privacy_firmata?: boolean
          privacy_pdf_url?: string | null
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          provincia?: string | null
          ragione_sociale?: string
          rating_esterno?: string | null
          rating_esterno_data?: string | null
          rating_esterno_fonte?: string | null
          saldo_contabile?: number | null
          scaduto?: number | null
          scheda_pdf_url?: string | null
          sede_operatore?: string | null
          store_id?: string | null
          telefono?: string | null
          telefono_2?: string | null
          tipo_soggetto?: string | null
          totale_rischio?: number | null
          ultima_data_fatturazione?: string | null
          ultima_importazione_d?: string | null
          ultima_sincronizzazione?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clienti_bloccato_da_fkey"
            columns: ["bloccato_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clienti_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      codici_pagamento: {
        Row: {
          cod: string
          descrizione: string
        }
        Insert: {
          cod: string
          descrizione: string
        }
        Update: {
          cod?: string
          descrizione?: string
        }
        Relationships: []
      }
      codici_pagamento_giorni: {
        Row: {
          descrizione: string
          giorni_totali: number
          pagamento_immediato: boolean
        }
        Insert: {
          descrizione: string
          giorni_totali: number
          pagamento_immediato?: boolean
        }
        Update: {
          descrizione?: string
          giorni_totali?: number
          pagamento_immediato?: boolean
        }
        Relationships: []
      }
      comunicazioni_richiesta: {
        Row: {
          autore_id: string
          created_at: string
          destinatario: string
          id: string
          letto: boolean
          letto_da: string[]
          richiesta_id: string
          testo: string
        }
        Insert: {
          autore_id: string
          created_at?: string
          destinatario: string
          id?: string
          letto?: boolean
          letto_da?: string[]
          richiesta_id: string
          testo: string
        }
        Update: {
          autore_id?: string
          created_at?: string
          destinatario?: string
          id?: string
          letto?: boolean
          letto_da?: string[]
          richiesta_id?: string
          testo?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicazioni_richiesta_richiesta_id_fkey"
            columns: ["richiesta_id"]
            isOneToOne: false
            referencedRelation: "richieste_fido"
            referencedColumns: ["id"]
          },
        ]
      }
      configurazioni: {
        Row: {
          chiave: string
          descrizione: string | null
          updated_at: string
          updated_by: string | null
          valore: string
        }
        Insert: {
          chiave: string
          descrizione?: string | null
          updated_at?: string
          updated_by?: string | null
          valore: string
        }
        Update: {
          chiave?: string
          descrizione?: string | null
          updated_at?: string
          updated_by?: string | null
          valore?: string
        }
        Relationships: []
      }
      consensi_log: {
        Row: {
          cliente_id: string | null
          contatto_id: string
          created_at: string
          id: string
          informativa_hash: string | null
          informativa_versione: string | null
          ip_address: string | null
          lead_id: string | null
          note: string | null
          operatore_id: string | null
          origine: string
          prova_path: string | null
          secondi_permanenza: number | null
          tipo_consenso: string
          user_agent: string | null
          valore: boolean
        }
        Insert: {
          cliente_id?: string | null
          contatto_id: string
          created_at?: string
          id?: string
          informativa_hash?: string | null
          informativa_versione?: string | null
          ip_address?: string | null
          lead_id?: string | null
          note?: string | null
          operatore_id?: string | null
          origine: string
          prova_path?: string | null
          secondi_permanenza?: number | null
          tipo_consenso: string
          user_agent?: string | null
          valore: boolean
        }
        Update: {
          cliente_id?: string | null
          contatto_id?: string
          created_at?: string
          id?: string
          informativa_hash?: string | null
          informativa_versione?: string | null
          ip_address?: string | null
          lead_id?: string | null
          note?: string | null
          operatore_id?: string | null
          origine?: string
          prova_path?: string | null
          secondi_permanenza?: number | null
          tipo_consenso?: string
          user_agent?: string | null
          valore?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "consensi_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consensi_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consensi_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "consensi_log_contatto_id_fkey"
            columns: ["contatto_id"]
            isOneToOne: false
            referencedRelation: "contatti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consensi_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      contatori_preventivo: {
        Row: {
          anno: number
          tipo: Database["public"]["Enums"]["tipo_documento"]
          ultimo_numero: number
        }
        Insert: {
          anno: number
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          ultimo_numero?: number
        }
        Update: {
          anno?: number
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          ultimo_numero?: number
        }
        Relationships: []
      }
      contatti: {
        Row: {
          cellulare: string | null
          cliente_id: string | null
          codice_fiscale: string | null
          cognome: string | null
          consensi_token: string | null
          consensi_token_expires_at: string | null
          consenso_marketing_diretto: boolean
          consenso_marketing_media: boolean
          consenso_profilazione: boolean
          created_at: string
          data_firma: string | null
          data_nascita: string | null
          email: string | null
          firma_nome_dichiarato: string | null
          firma_url: string | null
          id: string
          lead_id: string | null
          luogo_nascita: string | null
          nome: string
          pdf_privacy_path: string | null
          pdf_privacy_url: string | null
          principale: boolean
          privacy_firmata: boolean
          privacy_token: string | null
          privacy_token_expires_at: string | null
          recesso_token: string | null
          residenza: string | null
          richiesta_privacy_aperta_il: string | null
          richiesta_privacy_generata_il: string | null
          richiesta_privacy_inviata_il: string | null
          ruolo: string | null
          telefono: string | null
          updated_at: string
          whatsapp: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          cellulare?: string | null
          cliente_id?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          consensi_token?: string | null
          consensi_token_expires_at?: string | null
          consenso_marketing_diretto?: boolean
          consenso_marketing_media?: boolean
          consenso_profilazione?: boolean
          created_at?: string
          data_firma?: string | null
          data_nascita?: string | null
          email?: string | null
          firma_nome_dichiarato?: string | null
          firma_url?: string | null
          id?: string
          lead_id?: string | null
          luogo_nascita?: string | null
          nome: string
          pdf_privacy_path?: string | null
          pdf_privacy_url?: string | null
          principale?: boolean
          privacy_firmata?: boolean
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          recesso_token?: string | null
          residenza?: string | null
          richiesta_privacy_aperta_il?: string | null
          richiesta_privacy_generata_il?: string | null
          richiesta_privacy_inviata_il?: string | null
          ruolo?: string | null
          telefono?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          cellulare?: string | null
          cliente_id?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          consensi_token?: string | null
          consensi_token_expires_at?: string | null
          consenso_marketing_diretto?: boolean
          consenso_marketing_media?: boolean
          consenso_profilazione?: boolean
          created_at?: string
          data_firma?: string | null
          data_nascita?: string | null
          email?: string | null
          firma_nome_dichiarato?: string | null
          firma_url?: string | null
          id?: string
          lead_id?: string | null
          luogo_nascita?: string | null
          nome?: string
          pdf_privacy_path?: string | null
          pdf_privacy_url?: string | null
          principale?: boolean
          privacy_firmata?: boolean
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          recesso_token?: string | null
          residenza?: string | null
          richiesta_privacy_aperta_il?: string | null
          richiesta_privacy_generata_il?: string | null
          richiesta_privacy_inviata_il?: string | null
          ruolo?: string | null
          telefono?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contatti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "contatti_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      esportazioni: {
        Row: {
          created_at: string
          eseguita_da: string | null
          file_url: string | null
          filtro_store_id: string | null
          id: string
          nome_file: string
          periodo_a: string | null
          periodo_da: string | null
          righe_esportate: number | null
        }
        Insert: {
          created_at?: string
          eseguita_da?: string | null
          file_url?: string | null
          filtro_store_id?: string | null
          id?: string
          nome_file: string
          periodo_a?: string | null
          periodo_da?: string | null
          righe_esportate?: number | null
        }
        Update: {
          created_at?: string
          eseguita_da?: string | null
          file_url?: string | null
          filtro_store_id?: string | null
          id?: string
          nome_file?: string
          periodo_a?: string | null
          periodo_da?: string | null
          righe_esportate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "esportazioni_filtro_store_id_fkey"
            columns: ["filtro_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      eventi: {
        Row: {
          created_at: string
          created_by: string | null
          data_evento: string | null
          id: string
          luogo: string | null
          nome: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_evento?: string | null
          id?: string
          luogo?: string | null
          nome: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_evento?: string | null
          id?: string
          luogo?: string | null
          nome?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      eventi_import_righe: {
        Row: {
          cellulare: string | null
          codice_fiscale: string | null
          cognome: string | null
          created_at: string
          email: string | null
          evento_id: string
          id: string
          importazione_id: string
          match_alternative: Json | null
          match_contatto_id: string | null
          match_criterio: string | null
          match_id: string | null
          match_privacy_firmata: boolean | null
          match_tipo: string | null
          nome: string | null
          note: string | null
          partita_iva: string | null
          ragione_sociale: string | null
          riga_numero: number | null
          stato: string
          telefono: string | null
        }
        Insert: {
          cellulare?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          created_at?: string
          email?: string | null
          evento_id: string
          id?: string
          importazione_id: string
          match_alternative?: Json | null
          match_contatto_id?: string | null
          match_criterio?: string | null
          match_id?: string | null
          match_privacy_firmata?: boolean | null
          match_tipo?: string | null
          nome?: string | null
          note?: string | null
          partita_iva?: string | null
          ragione_sociale?: string | null
          riga_numero?: number | null
          stato?: string
          telefono?: string | null
        }
        Update: {
          cellulare?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          created_at?: string
          email?: string | null
          evento_id?: string
          id?: string
          importazione_id?: string
          match_alternative?: Json | null
          match_contatto_id?: string | null
          match_criterio?: string | null
          match_id?: string | null
          match_privacy_firmata?: boolean | null
          match_tipo?: string | null
          nome?: string | null
          note?: string | null
          partita_iva?: string | null
          ragione_sociale?: string | null
          riga_numero?: number | null
          stato?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventi_import_righe_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventi_import_righe_importazione_id_fkey"
            columns: ["importazione_id"]
            isOneToOne: false
            referencedRelation: "importazioni"
            referencedColumns: ["id"]
          },
        ]
      }
      eventi_partecipanti: {
        Row: {
          cliente_id: string | null
          codice_fiscale: string | null
          cognome: string | null
          contatto_id: string | null
          created_at: string
          email: string | null
          evento_id: string
          id: string
          lead_id: string | null
          nome: string | null
          note: string | null
          partita_iva: string | null
          ragione_sociale: string | null
          stato: Database["public"]["Enums"]["eventi_partecipante_stato"]
          telefono: string | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          contatto_id?: string | null
          created_at?: string
          email?: string | null
          evento_id: string
          id?: string
          lead_id?: string | null
          nome?: string | null
          note?: string | null
          partita_iva?: string | null
          ragione_sociale?: string | null
          stato?: Database["public"]["Enums"]["eventi_partecipante_stato"]
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          contatto_id?: string | null
          created_at?: string
          email?: string | null
          evento_id?: string
          id?: string
          lead_id?: string | null
          nome?: string | null
          note?: string | null
          partita_iva?: string | null
          ragione_sociale?: string | null
          stato?: Database["public"]["Enums"]["eventi_partecipante_stato"]
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventi_partecipanti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventi_partecipanti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventi_partecipanti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "eventi_partecipanti_contatto_id_fkey"
            columns: ["contatto_id"]
            isOneToOne: false
            referencedRelation: "contatti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventi_partecipanti_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventi_partecipanti_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      fido_teorico_cliente: {
        Row: {
          calcolato_at: string
          cliente_id: string
          coefficiente: number | null
          ddt_da_fatturare: number | null
          esposizione_corrente: number | null
          fatturato_rolling: number | null
          fido_attuale: number | null
          fido_base: number | null
          fido_base_lordo: number | null
          fido_proposto: number | null
          fido_proposto_senza_coefficiente: number | null
          fido_teorico_puro: number | null
          giorni: number | null
          giorni_mancanti: boolean | null
          giorni_oltre_accordo: number | null
          nota_proposta: string | null
          pavimento_applicato: boolean | null
          profilo_pagamento: string | null
          regola_applicata: string | null
          richiede_verifica: boolean | null
          ritmo_mensile: number | null
          scostamento: number | null
          sede_cinisello: boolean | null
          semaforo_motivo: string | null
          semaforo_numero: number | null
          semaforo_stadio: string | null
        }
        Insert: {
          calcolato_at?: string
          cliente_id: string
          coefficiente?: number | null
          ddt_da_fatturare?: number | null
          esposizione_corrente?: number | null
          fatturato_rolling?: number | null
          fido_attuale?: number | null
          fido_base?: number | null
          fido_base_lordo?: number | null
          fido_proposto?: number | null
          fido_proposto_senza_coefficiente?: number | null
          fido_teorico_puro?: number | null
          giorni?: number | null
          giorni_mancanti?: boolean | null
          giorni_oltre_accordo?: number | null
          nota_proposta?: string | null
          pavimento_applicato?: boolean | null
          profilo_pagamento?: string | null
          regola_applicata?: string | null
          richiede_verifica?: boolean | null
          ritmo_mensile?: number | null
          scostamento?: number | null
          sede_cinisello?: boolean | null
          semaforo_motivo?: string | null
          semaforo_numero?: number | null
          semaforo_stadio?: string | null
        }
        Update: {
          calcolato_at?: string
          cliente_id?: string
          coefficiente?: number | null
          ddt_da_fatturare?: number | null
          esposizione_corrente?: number | null
          fatturato_rolling?: number | null
          fido_attuale?: number | null
          fido_base?: number | null
          fido_base_lordo?: number | null
          fido_proposto?: number | null
          fido_proposto_senza_coefficiente?: number | null
          fido_teorico_puro?: number | null
          giorni?: number | null
          giorni_mancanti?: boolean | null
          giorni_oltre_accordo?: number | null
          nota_proposta?: string | null
          pavimento_applicato?: boolean | null
          profilo_pagamento?: string | null
          regola_applicata?: string | null
          richiede_verifica?: boolean | null
          ritmo_mensile?: number | null
          scostamento?: number | null
          sede_cinisello?: boolean | null
          semaforo_motivo?: string | null
          semaforo_numero?: number | null
          semaforo_stadio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fido_teorico_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fido_teorico_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fido_teorico_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      fornitori: {
        Row: {
          categoria_fornitore: string
          created_at: string
          id: string
          nome: string
          note: string | null
          ragione_sociale: string | null
          updated_at: string | null
        }
        Insert: {
          categoria_fornitore?: string
          created_at?: string
          id?: string
          nome: string
          note?: string | null
          ragione_sociale?: string | null
          updated_at?: string | null
        }
        Update: {
          categoria_fornitore?: string
          created_at?: string
          id?: string
          nome?: string
          note?: string | null
          ragione_sociale?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      importazioni: {
        Row: {
          chunks_completati: number | null
          chunks_totali: number | null
          codici_mancanti: Json | null
          completata_at: string | null
          created_at: string
          dimensione_bytes: number | null
          eseguita_da: string | null
          evento_id: string | null
          file_path: string | null
          fonte: string | null
          id: string
          log_errori: Json | null
          nome_file: string
          report_saltati: Json | null
          righe_aggiornate: number | null
          righe_create: number | null
          righe_elaborate: number | null
          righe_errore: number | null
          righe_saltate: number
          righe_totali: number | null
          stato: Database["public"]["Enums"]["stato_importazione"]
        }
        Insert: {
          chunks_completati?: number | null
          chunks_totali?: number | null
          codici_mancanti?: Json | null
          completata_at?: string | null
          created_at?: string
          dimensione_bytes?: number | null
          eseguita_da?: string | null
          evento_id?: string | null
          file_path?: string | null
          fonte?: string | null
          id?: string
          log_errori?: Json | null
          nome_file: string
          report_saltati?: Json | null
          righe_aggiornate?: number | null
          righe_create?: number | null
          righe_elaborate?: number | null
          righe_errore?: number | null
          righe_saltate?: number
          righe_totali?: number | null
          stato?: Database["public"]["Enums"]["stato_importazione"]
        }
        Update: {
          chunks_completati?: number | null
          chunks_totali?: number | null
          codici_mancanti?: Json | null
          completata_at?: string | null
          created_at?: string
          dimensione_bytes?: number | null
          eseguita_da?: string | null
          evento_id?: string | null
          file_path?: string | null
          fonte?: string | null
          id?: string
          log_errori?: Json | null
          nome_file?: string
          report_saltati?: Json | null
          righe_aggiornate?: number | null
          righe_create?: number | null
          righe_elaborate?: number | null
          righe_errore?: number | null
          righe_saltate?: number
          righe_totali?: number | null
          stato?: Database["public"]["Enums"]["stato_importazione"]
        }
        Relationships: [
          {
            foreignKeyName: "importazioni_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventi"
            referencedColumns: ["id"]
          },
        ]
      }
      kit: {
        Row: {
          created_at: string
          descrizione_tecnica: string | null
          famiglia: Database["public"]["Enums"]["kit_famiglia"]
          h_max: number | null
          id: string
          isolante: string | null
          nome: string
          passo: number | null
          passo_um: string | null
          spessore: number | null
          tipo_struttura: string | null
          um_base: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descrizione_tecnica?: string | null
          famiglia?: Database["public"]["Enums"]["kit_famiglia"]
          h_max?: number | null
          id?: string
          isolante?: string | null
          nome: string
          passo?: number | null
          passo_um?: string | null
          spessore?: number | null
          tipo_struttura?: string | null
          um_base?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descrizione_tecnica?: string | null
          famiglia?: Database["public"]["Enums"]["kit_famiglia"]
          h_max?: number | null
          id?: string
          isolante?: string | null
          nome?: string
          passo?: number | null
          passo_um?: string | null
          spessore?: number | null
          tipo_struttura?: string | null
          um_base?: string
          updated_at?: string
        }
        Relationships: []
      }
      kit_componenti: {
        Row: {
          articolo_id: string | null
          created_at: string
          id: string
          incidenza: number | null
          kit_id: string
          lato: number | null
          ordine: number
          ruolo: string | null
          strato: number | null
          tipo_driver: Database["public"]["Enums"]["tipo_driver"] | null
          updated_at: string
          valore_driver: number | null
        }
        Insert: {
          articolo_id?: string | null
          created_at?: string
          id?: string
          incidenza?: number | null
          kit_id: string
          lato?: number | null
          ordine?: number
          ruolo?: string | null
          strato?: number | null
          tipo_driver?: Database["public"]["Enums"]["tipo_driver"] | null
          updated_at?: string
          valore_driver?: number | null
        }
        Update: {
          articolo_id?: string | null
          created_at?: string
          id?: string
          incidenza?: number | null
          kit_id?: string
          lato?: number | null
          ordine?: number
          ruolo?: string | null
          strato?: number | null
          tipo_driver?: Database["public"]["Enums"]["tipo_driver"] | null
          updated_at?: string
          valore_driver?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kit_componenti_articolo_id_fkey"
            columns: ["articolo_id"]
            isOneToOne: false
            referencedRelation: "articoli"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_componenti_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kit"
            referencedColumns: ["id"]
          },
        ]
      }
      lead: {
        Row: {
          agente_codice: string | null
          assegnato_a: string | null
          assegnato_il: string | null
          cap: string | null
          cellulare: string | null
          citta: string | null
          cliente_id: string | null
          codice_fiscale: string | null
          cognome: string | null
          convertito_da: string | null
          convertito_il: string | null
          created_at: string
          created_by: string | null
          email: string | null
          fonte: Database["public"]["Enums"]["lead_fonte"]
          fonte_dettaglio: string | null
          hubspot_id: string | null
          id: string
          indirizzo: string | null
          motivo_perdita: string | null
          nome: string | null
          note: string | null
          partita_iva: string | null
          priorita: Database["public"]["Enums"]["lead_priorita"]
          prossima_azione_il: string | null
          prossima_azione_nota: string | null
          prossima_azione_tipo: string | null
          provincia: string | null
          ragione_sociale: string | null
          stato: Database["public"]["Enums"]["lead_stato"]
          store_id: string | null
          telefono: string | null
          tipo_lead: Database["public"]["Enums"]["lead_tipo"]
          tipo_soggetto: string | null
          updated_at: string
        }
        Insert: {
          agente_codice?: string | null
          assegnato_a?: string | null
          assegnato_il?: string | null
          cap?: string | null
          cellulare?: string | null
          citta?: string | null
          cliente_id?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          convertito_da?: string | null
          convertito_il?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          fonte?: Database["public"]["Enums"]["lead_fonte"]
          fonte_dettaglio?: string | null
          hubspot_id?: string | null
          id?: string
          indirizzo?: string | null
          motivo_perdita?: string | null
          nome?: string | null
          note?: string | null
          partita_iva?: string | null
          priorita?: Database["public"]["Enums"]["lead_priorita"]
          prossima_azione_il?: string | null
          prossima_azione_nota?: string | null
          prossima_azione_tipo?: string | null
          provincia?: string | null
          ragione_sociale?: string | null
          stato?: Database["public"]["Enums"]["lead_stato"]
          store_id?: string | null
          telefono?: string | null
          tipo_lead?: Database["public"]["Enums"]["lead_tipo"]
          tipo_soggetto?: string | null
          updated_at?: string
        }
        Update: {
          agente_codice?: string | null
          assegnato_a?: string | null
          assegnato_il?: string | null
          cap?: string | null
          cellulare?: string | null
          citta?: string | null
          cliente_id?: string | null
          codice_fiscale?: string | null
          cognome?: string | null
          convertito_da?: string | null
          convertito_il?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          fonte?: Database["public"]["Enums"]["lead_fonte"]
          fonte_dettaglio?: string | null
          hubspot_id?: string | null
          id?: string
          indirizzo?: string | null
          motivo_perdita?: string | null
          nome?: string | null
          note?: string | null
          partita_iva?: string | null
          priorita?: Database["public"]["Enums"]["lead_priorita"]
          prossima_azione_il?: string | null
          prossima_azione_nota?: string | null
          prossima_azione_tipo?: string | null
          provincia?: string | null
          ragione_sociale?: string | null
          stato?: Database["public"]["Enums"]["lead_stato"]
          store_id?: string | null
          telefono?: string | null
          tipo_lead?: Database["public"]["Enums"]["lead_tipo"]
          tipo_soggetto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "lead_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_richieste: {
        Row: {
          assegnato_a: string | null
          created_at: string
          created_by: string | null
          descrizione: string | null
          esito: string | null
          id: string
          importo_stimato: number | null
          lead_id: string
          oggetto: string | null
          stato: Database["public"]["Enums"]["lead_richiesta_stato"]
          tipo: Database["public"]["Enums"]["lead_richiesta_tipo"]
          updated_at: string
        }
        Insert: {
          assegnato_a?: string | null
          created_at?: string
          created_by?: string | null
          descrizione?: string | null
          esito?: string | null
          id?: string
          importo_stimato?: number | null
          lead_id: string
          oggetto?: string | null
          stato?: Database["public"]["Enums"]["lead_richiesta_stato"]
          tipo: Database["public"]["Enums"]["lead_richiesta_tipo"]
          updated_at?: string
        }
        Update: {
          assegnato_a?: string | null
          created_at?: string
          created_by?: string | null
          descrizione?: string | null
          esito?: string | null
          id?: string
          importo_stimato?: number | null
          lead_id?: string
          oggetto?: string | null
          stato?: Database["public"]["Enums"]["lead_richiesta_stato"]
          tipo?: Database["public"]["Enums"]["lead_richiesta_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_richieste_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_storico: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          nota: string | null
          operatore_id: string | null
          stato_a: string | null
          stato_da: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          nota?: string | null
          operatore_id?: string | null
          stato_a?: string | null
          stato_da?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          nota?: string | null
          operatore_id?: string | null
          stato_a?: string | null
          stato_da?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_storico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
        ]
      }
      listini_acquisto: {
        Row: {
          articolo_id: string
          condizioni: string | null
          costo_netto: number | null
          created_at: string
          data_validita: string | null
          id: string
          listino_for: string | null
          note: string | null
          prezzo_scontato: number | null
          sc1: number | null
          sc2: number | null
          sc3: number | null
          sc4: number | null
          sc5: number | null
          trasporto_eur: number | null
          trasporto_perc: number | null
          updated_at: string
        }
        Insert: {
          articolo_id: string
          condizioni?: string | null
          costo_netto?: number | null
          created_at?: string
          data_validita?: string | null
          id?: string
          listino_for?: string | null
          note?: string | null
          prezzo_scontato?: number | null
          sc1?: number | null
          sc2?: number | null
          sc3?: number | null
          sc4?: number | null
          sc5?: number | null
          trasporto_eur?: number | null
          trasporto_perc?: number | null
          updated_at?: string
        }
        Update: {
          articolo_id?: string
          condizioni?: string | null
          costo_netto?: number | null
          created_at?: string
          data_validita?: string | null
          id?: string
          listino_for?: string | null
          note?: string | null
          prezzo_scontato?: number | null
          sc1?: number | null
          sc2?: number | null
          sc3?: number | null
          sc4?: number | null
          sc5?: number | null
          trasporto_eur?: number | null
          trasporto_perc?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listini_acquisto_articolo_id_fkey"
            columns: ["articolo_id"]
            isOneToOne: false
            referencedRelation: "articoli"
            referencedColumns: ["id"]
          },
        ]
      }
      listini_vendita: {
        Row: {
          articolo_id: string
          created_at: string
          fascia: Database["public"]["Enums"]["fascia_listino"]
          id: string
          margine: number | null
          prezzo: number | null
          ricarico: number | null
          updated_at: string
        }
        Insert: {
          articolo_id: string
          created_at?: string
          fascia: Database["public"]["Enums"]["fascia_listino"]
          id?: string
          margine?: number | null
          prezzo?: number | null
          ricarico?: number | null
          updated_at?: string
        }
        Update: {
          articolo_id?: string
          created_at?: string
          fascia?: Database["public"]["Enums"]["fascia_listino"]
          id?: string
          margine?: number | null
          prezzo?: number | null
          ricarico?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listini_vendita_articolo_id_fkey"
            columns: ["articolo_id"]
            isOneToOne: false
            referencedRelation: "articoli"
            referencedColumns: ["id"]
          },
        ]
      }
      macrocategorie: {
        Row: {
          codice: string
          label: string
        }
        Insert: {
          codice: string
          label: string
        }
        Update: {
          codice?: string
          label?: string
        }
        Relationships: []
      }
      matrice_ricarichi: {
        Row: {
          categoria: string
          descrizione_categoria: string | null
          macro_gruppo: string | null
          ricarico_a: number | null
          ricarico_b: number | null
          ricarico_c: number | null
          ricarico_soci: number | null
          updated_at: string
        }
        Insert: {
          categoria: string
          descrizione_categoria?: string | null
          macro_gruppo?: string | null
          ricarico_a?: number | null
          ricarico_b?: number | null
          ricarico_c?: number | null
          ricarico_soci?: number | null
          updated_at?: string
        }
        Update: {
          categoria?: string
          descrizione_categoria?: string | null
          macro_gruppo?: string | null
          ricarico_a?: number | null
          ricarico_b?: number | null
          ricarico_c?: number | null
          ricarico_soci?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      messaggi_whatsapp: {
        Row: {
          campagna_id: string | null
          consegnato_at: string | null
          contatto_id: string
          created_at: string
          errore: string | null
          id: string
          inviato_at: string | null
          letto_at: string | null
          messaggio: string | null
          meta_message_id: string | null
          numero_dest: string
          stato: Database["public"]["Enums"]["stato_messaggio_wa"]
        }
        Insert: {
          campagna_id?: string | null
          consegnato_at?: string | null
          contatto_id: string
          created_at?: string
          errore?: string | null
          id?: string
          inviato_at?: string | null
          letto_at?: string | null
          messaggio?: string | null
          meta_message_id?: string | null
          numero_dest: string
          stato?: Database["public"]["Enums"]["stato_messaggio_wa"]
        }
        Update: {
          campagna_id?: string | null
          consegnato_at?: string | null
          contatto_id?: string
          created_at?: string
          errore?: string | null
          id?: string
          inviato_at?: string | null
          letto_at?: string | null
          messaggio?: string | null
          meta_message_id?: string | null
          numero_dest?: string
          stato?: Database["public"]["Enums"]["stato_messaggio_wa"]
        }
        Relationships: [
          {
            foreignKeyName: "messaggi_whatsapp_campagna_id_fkey"
            columns: ["campagna_id"]
            isOneToOne: false
            referencedRelation: "campagne_whatsapp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaggi_whatsapp_contatto_id_fkey"
            columns: ["contatto_id"]
            isOneToOne: false
            referencedRelation: "contatti"
            referencedColumns: ["id"]
          },
        ]
      }
      migrazione_richieste_utenti: {
        Row: {
          created_at: string
          email: string
          note: string | null
          updated_at: string
          uuid_destinazione: string | null
          uuid_origine: string
        }
        Insert: {
          created_at?: string
          email: string
          note?: string | null
          updated_at?: string
          uuid_destinazione?: string | null
          uuid_origine: string
        }
        Update: {
          created_at?: string
          email?: string
          note?: string | null
          updated_at?: string
          uuid_destinazione?: string | null
          uuid_origine?: string
        }
        Relationships: []
      }
      note_legali_gestionali: {
        Row: {
          categoria: string | null
          cliente_id: string
          created_at: string
          id: string
          importato_da: string | null
          testo: string
          ultima_sincronizzazione: string
        }
        Insert: {
          categoria?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          importato_da?: string | null
          testo: string
          ultima_sincronizzazione?: string
        }
        Update: {
          categoria?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          importato_da?: string | null
          testo?: string
          ultima_sincronizzazione?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_legali_gestionali_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_legali_gestionali_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_legali_gestionali_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "note_legali_gestionali_importato_da_fkey"
            columns: ["importato_da"]
            isOneToOne: false
            referencedRelation: "importazioni"
            referencedColumns: ["id"]
          },
        ]
      }
      notifiche: {
        Row: {
          created_at: string
          id: string
          letta: boolean
          link: string | null
          messaggio: string | null
          metadata: Json | null
          tipo: string
          titolo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          letta?: boolean
          link?: string | null
          messaggio?: string | null
          metadata?: Json | null
          tipo: string
          titolo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          letta?: boolean
          link?: string | null
          messaggio?: string | null
          metadata?: Json | null
          tipo?: string
          titolo?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunita: {
        Row: {
          agente_codice: string | null
          assegnato_a: string | null
          cantiere_id: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          data_chiusura: string | null
          data_prevista_chiusura: string | null
          descrizione: string | null
          id: string
          lead_id: string | null
          motivo_perdita: string | null
          note: string | null
          probabilita: number | null
          stato: Database["public"]["Enums"]["stato_opportunita"]
          store_id: string | null
          tipo: Database["public"]["Enums"]["tipo_opportunita"]
          titolo: string
          updated_at: string
          valore_stimato: number | null
        }
        Insert: {
          agente_codice?: string | null
          assegnato_a?: string | null
          cantiere_id?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_chiusura?: string | null
          data_prevista_chiusura?: string | null
          descrizione?: string | null
          id?: string
          lead_id?: string | null
          motivo_perdita?: string | null
          note?: string | null
          probabilita?: number | null
          stato?: Database["public"]["Enums"]["stato_opportunita"]
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_opportunita"]
          titolo: string
          updated_at?: string
          valore_stimato?: number | null
        }
        Update: {
          agente_codice?: string | null
          assegnato_a?: string | null
          cantiere_id?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_chiusura?: string | null
          data_prevista_chiusura?: string | null
          descrizione?: string | null
          id?: string
          lead_id?: string | null
          motivo_perdita?: string | null
          note?: string | null
          probabilita?: number | null
          stato?: Database["public"]["Enums"]["stato_opportunita"]
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_opportunita"]
          titolo?: string
          updated_at?: string
          valore_stimato?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunita_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunita_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunita_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunita_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "opportunita_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunita_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      piani_rientro: {
        Row: {
          cliente_id: string
          created_at: string
          creato_da: string | null
          id: string
          livello: number
          note: string | null
          stato: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          creato_da?: string | null
          id?: string
          livello: number
          note?: string | null
          stato?: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          creato_da?: string | null
          id?: string
          livello?: number
          note?: string | null
          stato?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piani_rientro_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piani_rientro_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piani_rientro_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      piani_rientro_documenti: {
        Row: {
          created_at: string
          importo_alla_selezione: number | null
          piano_id: string
          scadenza_id: string
        }
        Insert: {
          created_at?: string
          importo_alla_selezione?: number | null
          piano_id: string
          scadenza_id: string
        }
        Update: {
          created_at?: string
          importo_alla_selezione?: number | null
          piano_id?: string
          scadenza_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piani_rientro_documenti_piano_id_fkey"
            columns: ["piano_id"]
            isOneToOne: false
            referencedRelation: "piani_rientro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piani_rientro_documenti_scadenza_id_fkey"
            columns: ["scadenza_id"]
            isOneToOne: false
            referencedRelation: "scadenze"
            referencedColumns: ["id"]
          },
        ]
      }
      piani_rientro_rate: {
        Row: {
          created_at: string
          data_pagamento_confermata: string | null
          data_rata: string
          id: string
          importo: number
          note: string | null
          numero_rata: number
          piano_id: string
          reminder_inviato_il: string | null
          stato: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_pagamento_confermata?: string | null
          data_rata: string
          id?: string
          importo: number
          note?: string | null
          numero_rata: number
          piano_id: string
          reminder_inviato_il?: string | null
          stato?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_pagamento_confermata?: string | null
          data_rata?: string
          id?: string
          importo?: number
          note?: string | null
          numero_rata?: number
          piano_id?: string
          reminder_inviato_il?: string | null
          stato?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piani_rientro_rate_piano_id_fkey"
            columns: ["piano_id"]
            isOneToOne: false
            referencedRelation: "piani_rientro"
            referencedColumns: ["id"]
          },
        ]
      }
      pratiche_legali: {
        Row: {
          cliente_id: string
          created_at: string
          data_apertura: string
          data_chiusura: string | null
          esito: string | null
          gestita_da: string | null
          id: string
          importo_contestato: number | null
          importo_recuperato: number | null
          note: string | null
          numero_fascicolo: string | null
          riferimento_avvocato: string | null
          stato: Database["public"]["Enums"]["stato_pratica_legale"]
          studio_legale: string | null
          tipo: Database["public"]["Enums"]["tipo_pratica_legale"]
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_apertura?: string
          data_chiusura?: string | null
          esito?: string | null
          gestita_da?: string | null
          id?: string
          importo_contestato?: number | null
          importo_recuperato?: number | null
          note?: string | null
          numero_fascicolo?: string | null
          riferimento_avvocato?: string | null
          stato?: Database["public"]["Enums"]["stato_pratica_legale"]
          studio_legale?: string | null
          tipo: Database["public"]["Enums"]["tipo_pratica_legale"]
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_apertura?: string
          data_chiusura?: string | null
          esito?: string | null
          gestita_da?: string | null
          id?: string
          importo_contestato?: number | null
          importo_recuperato?: number | null
          note?: string | null
          numero_fascicolo?: string | null
          riferimento_avvocato?: string | null
          stato?: Database["public"]["Enums"]["stato_pratica_legale"]
          studio_legale?: string | null
          tipo?: Database["public"]["Enums"]["tipo_pratica_legale"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pratiche_legali_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pratiche_legali_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pratiche_legali_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pratiche_legali_gestita_da_fkey"
            columns: ["gestita_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
        ]
      }
      pratiche_legali_allegati: {
        Row: {
          caricato_da: string | null
          created_at: string
          id: string
          mime_type: string | null
          nome_file: string
          pratica_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          caricato_da?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_file: string
          pratica_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          caricato_da?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          nome_file?: string
          pratica_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "pratiche_legali_allegati_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche_legali"
            referencedColumns: ["id"]
          },
        ]
      }
      preferenze_stampa: {
        Row: {
          colonne_righe: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          colonne_righe?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          colonne_righe?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      preventivi: {
        Row: {
          agente_codice: string | null
          cantiere_id: string | null
          cliente_id: string | null
          created_at: string
          data: string
          fascia_listino: Database["public"]["Enums"]["fascia_listino"] | null
          filiale: string | null
          id: string
          iva_importo: number | null
          iva_perc: number | null
          note: string | null
          numero: string | null
          preventivo_origine_id: string | null
          sconto_piede_perc: number
          stato: Database["public"]["Enums"]["stato_preventivo"]
          tipo: Database["public"]["Enums"]["tipo_documento"]
          tipo_doc: Database["public"]["Enums"]["tipo_doc_preventivo"]
          totale: number | null
          totale_imponibile: number | null
          updated_at: string
          validita: string | null
        }
        Insert: {
          agente_codice?: string | null
          cantiere_id?: string | null
          cliente_id?: string | null
          created_at?: string
          data?: string
          fascia_listino?: Database["public"]["Enums"]["fascia_listino"] | null
          filiale?: string | null
          id?: string
          iva_importo?: number | null
          iva_perc?: number | null
          note?: string | null
          numero?: string | null
          preventivo_origine_id?: string | null
          sconto_piede_perc?: number
          stato?: Database["public"]["Enums"]["stato_preventivo"]
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          tipo_doc?: Database["public"]["Enums"]["tipo_doc_preventivo"]
          totale?: number | null
          totale_imponibile?: number | null
          updated_at?: string
          validita?: string | null
        }
        Update: {
          agente_codice?: string | null
          cantiere_id?: string | null
          cliente_id?: string | null
          created_at?: string
          data?: string
          fascia_listino?: Database["public"]["Enums"]["fascia_listino"] | null
          filiale?: string | null
          id?: string
          iva_importo?: number | null
          iva_perc?: number | null
          note?: string | null
          numero?: string | null
          preventivo_origine_id?: string | null
          sconto_piede_perc?: number
          stato?: Database["public"]["Enums"]["stato_preventivo"]
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          tipo_doc?: Database["public"]["Enums"]["tipo_doc_preventivo"]
          totale?: number | null
          totale_imponibile?: number | null
          updated_at?: string
          validita?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preventivi_cantiere_id_fkey"
            columns: ["cantiere_id"]
            isOneToOne: false
            referencedRelation: "cantieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preventivi_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preventivi_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preventivi_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "preventivi_preventivo_origine_id_fkey"
            columns: ["preventivo_origine_id"]
            isOneToOne: false
            referencedRelation: "preventivi"
            referencedColumns: ["id"]
          },
        ]
      }
      profili: {
        Row: {
          attivo: boolean
          codice_agente: string | null
          cognome: string | null
          created_at: string
          deve_cambiare_password: boolean
          email: string | null
          id: string
          nome: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          codice_agente?: string | null
          cognome?: string | null
          created_at?: string
          deve_cambiare_password?: boolean
          email?: string | null
          id: string
          nome?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          codice_agente?: string | null
          cognome?: string | null
          created_at?: string
          deve_cambiare_password?: boolean
          email?: string | null
          id?: string
          nome?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profili_store_fk"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      promemoria_scadenza_log: {
        Row: {
          cliente_id: string
          created_at: string
          data_esecuzione: string
          email_destinatario: string | null
          email_html: string | null
          errore: string | null
          esito: string
          giorni_anticipo: number
          id: string
          importo_totale: number | null
          message_id: string | null
          num_scadenze: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_esecuzione: string
          email_destinatario?: string | null
          email_html?: string | null
          errore?: string | null
          esito: string
          giorni_anticipo: number
          id?: string
          importo_totale?: number | null
          message_id?: string | null
          num_scadenze?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_esecuzione?: string
          email_destinatario?: string | null
          email_html?: string | null
          errore?: string | null
          esito?: string
          giorni_anticipo?: number
          id?: string
          importo_totale?: number | null
          message_id?: string | null
          num_scadenze?: number
        }
        Relationships: [
          {
            foreignKeyName: "promemoria_scadenza_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promemoria_scadenza_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promemoria_scadenza_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      promemoria_scadenza_log_scadenze: {
        Row: {
          log_id: string
          scadenza_id: string
        }
        Insert: {
          log_id: string
          scadenza_id: string
        }
        Update: {
          log_id?: string
          scadenza_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promemoria_scadenza_log_scadenze_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "promemoria_scadenza_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promemoria_scadenza_log_scadenze_scadenza_id_fkey"
            columns: ["scadenza_id"]
            isOneToOne: false
            referencedRelation: "scadenze"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          platform: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          platform?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          platform?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reminder: {
        Row: {
          cliente_id: string | null
          created_at: string
          data_reminder: string
          descrizione: string | null
          id: string
          inviato: boolean | null
          inviato_at: string | null
          letto: boolean | null
          pratica_id: string | null
          scadenza_id: string | null
          sollecito_id: string | null
          tipo: Database["public"]["Enums"]["tipo_reminder"]
          titolo: string
          utente_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          data_reminder: string
          descrizione?: string | null
          id?: string
          inviato?: boolean | null
          inviato_at?: string | null
          letto?: boolean | null
          pratica_id?: string | null
          scadenza_id?: string | null
          sollecito_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_reminder"]
          titolo: string
          utente_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          data_reminder?: string
          descrizione?: string | null
          id?: string
          inviato?: boolean | null
          inviato_at?: string | null
          letto?: boolean | null
          pratica_id?: string | null
          scadenza_id?: string | null
          sollecito_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_reminder"]
          titolo?: string
          utente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "reminder_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche_legali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_scadenza_id_fkey"
            columns: ["scadenza_id"]
            isOneToOne: false
            referencedRelation: "scadenze"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_sollecito_id_fkey"
            columns: ["sollecito_id"]
            isOneToOne: false
            referencedRelation: "solleciti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_utente_id_fkey"
            columns: ["utente_id"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
        ]
      }
      richieste_fido: {
        Row: {
          approvato_da: string | null
          cliente_id: string
          condizione_pagamento_cod: string | null
          created_at: string
          created_by: string | null
          data_approvazione: string | null
          data_chiusura: string | null
          data_export: string | null
          data_invio: string | null
          data_processata: string | null
          data_scadenza: string | null
          durata_mesi: number
          esportata_da: string | null
          id: string
          importo_approvato: number | null
          importo_richiesto: number
          livello_corrente: number
          livello_richiesto: number
          motivazione: string | null
          note: string | null
          note_export: string | null
          processata_da: string | null
          stato: Database["public"]["Enums"]["stato_richiesta"]
          stato_export: string | null
          store_id: string | null
          tipo: Database["public"]["Enums"]["tipo_richiesta"]
          updated_at: string
        }
        Insert: {
          approvato_da?: string | null
          cliente_id: string
          condizione_pagamento_cod?: string | null
          created_at?: string
          created_by?: string | null
          data_approvazione?: string | null
          data_chiusura?: string | null
          data_export?: string | null
          data_invio?: string | null
          data_processata?: string | null
          data_scadenza?: string | null
          durata_mesi?: number
          esportata_da?: string | null
          id?: string
          importo_approvato?: number | null
          importo_richiesto: number
          livello_corrente?: number
          livello_richiesto?: number
          motivazione?: string | null
          note?: string | null
          note_export?: string | null
          processata_da?: string | null
          stato?: Database["public"]["Enums"]["stato_richiesta"]
          stato_export?: string | null
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_richiesta"]
          updated_at?: string
        }
        Update: {
          approvato_da?: string | null
          cliente_id?: string
          condizione_pagamento_cod?: string | null
          created_at?: string
          created_by?: string | null
          data_approvazione?: string | null
          data_chiusura?: string | null
          data_export?: string | null
          data_invio?: string | null
          data_processata?: string | null
          data_scadenza?: string | null
          durata_mesi?: number
          esportata_da?: string | null
          id?: string
          importo_approvato?: number | null
          importo_richiesto?: number
          livello_corrente?: number
          livello_richiesto?: number
          motivazione?: string | null
          note?: string | null
          note_export?: string | null
          processata_da?: string | null
          stato?: Database["public"]["Enums"]["stato_richiesta"]
          stato_export?: string | null
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_richiesta"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "richieste_fido_approvato_da_fkey"
            columns: ["approvato_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_fido_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_fido_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_fido_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "richieste_fido_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_fido_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      richieste_interne: {
        Row: {
          admin_at: string | null
          admin_by_name: string | null
          admin_note: string | null
          admin_status: string | null
          amount: number | null
          archived: boolean
          archived_at: string | null
          archived_by_name: string | null
          created_at: string
          description: string | null
          dir_action: string | null
          dir_approver_id: string | null
          dir_approver_name: string | null
          dir_at: string | null
          dir_note: string | null
          fornitore: string | null
          gestionale_ref: string | null
          gestionale_sent_at: string | null
          id: string
          requester_id: string | null
          requester_name: string
          resp_action: string | null
          resp_approver_id: string | null
          resp_approver_name: string | null
          resp_at: string | null
          resp_note: string | null
          sede_id: string | null
          sede_name: string | null
          sent_to_gestionale: boolean
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          admin_at?: string | null
          admin_by_name?: string | null
          admin_note?: string | null
          admin_status?: string | null
          amount?: number | null
          archived?: boolean
          archived_at?: string | null
          archived_by_name?: string | null
          created_at?: string
          description?: string | null
          dir_action?: string | null
          dir_approver_id?: string | null
          dir_approver_name?: string | null
          dir_at?: string | null
          dir_note?: string | null
          fornitore?: string | null
          gestionale_ref?: string | null
          gestionale_sent_at?: string | null
          id?: string
          requester_id?: string | null
          requester_name: string
          resp_action?: string | null
          resp_approver_id?: string | null
          resp_approver_name?: string | null
          resp_at?: string | null
          resp_note?: string | null
          sede_id?: string | null
          sede_name?: string | null
          sent_to_gestionale?: boolean
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          admin_at?: string | null
          admin_by_name?: string | null
          admin_note?: string | null
          admin_status?: string | null
          amount?: number | null
          archived?: boolean
          archived_at?: string | null
          archived_by_name?: string | null
          created_at?: string
          description?: string | null
          dir_action?: string | null
          dir_approver_id?: string | null
          dir_approver_name?: string | null
          dir_at?: string | null
          dir_note?: string | null
          fornitore?: string | null
          gestionale_ref?: string | null
          gestionale_sent_at?: string | null
          id?: string
          requester_id?: string | null
          requester_name?: string
          resp_action?: string | null
          resp_approver_id?: string | null
          resp_approver_name?: string | null
          resp_at?: string | null
          resp_note?: string | null
          sede_id?: string | null
          sede_name?: string | null
          sent_to_gestionale?: boolean
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "richieste_interne_dir_approver_id_fkey"
            columns: ["dir_approver_id"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_interne_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_interne_resp_approver_id_fkey"
            columns: ["resp_approver_id"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_interne_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      richieste_interne_allegati: {
        Row: {
          caricato_da: string | null
          created_at: string
          dimensione_bytes: number | null
          id: string
          mime_type: string | null
          nome_file: string
          request_id: string
          storage_path: string
        }
        Insert: {
          caricato_da?: string | null
          created_at?: string
          dimensione_bytes?: number | null
          id?: string
          mime_type?: string | null
          nome_file: string
          request_id: string
          storage_path: string
        }
        Update: {
          caricato_da?: string | null
          created_at?: string
          dimensione_bytes?: number | null
          id?: string
          mime_type?: string | null
          nome_file?: string
          request_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "richieste_interne_allegati_caricato_da_fkey"
            columns: ["caricato_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_interne_allegati_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "richieste_interne"
            referencedColumns: ["id"]
          },
        ]
      }
      richieste_interne_messaggi: {
        Row: {
          created_at: string
          destinatario: string
          id: string
          letto_da: string[]
          mittente_id: string | null
          mittente_name: string
          mittente_ruolo: string
          request_id: string
          testo: string
          tipo: string
        }
        Insert: {
          created_at?: string
          destinatario: string
          id?: string
          letto_da?: string[]
          mittente_id?: string | null
          mittente_name: string
          mittente_ruolo: string
          request_id: string
          testo: string
          tipo?: string
        }
        Update: {
          created_at?: string
          destinatario?: string
          id?: string
          letto_da?: string[]
          mittente_id?: string | null
          mittente_name?: string
          mittente_ruolo?: string
          request_id?: string
          testo?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "richieste_interne_messaggi_mittente_id_fkey"
            columns: ["mittente_id"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "richieste_interne_messaggi_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "richieste_interne"
            referencedColumns: ["id"]
          },
        ]
      }
      righe_preventivo: {
        Row: {
          articolo_id: string | null
          blocco_id: string
          costo: number | null
          created_at: string
          descrizione: string | null
          id: string
          importo: number | null
          incidenza: number | null
          margine: number | null
          ordine: number
          peso: number | null
          prezzo_unit: number | null
          qta_ordinata: number
          quantita: number | null
          ricarico: number | null
          riga_origine_id: string | null
          sconto_perc: number | null
          segno: number
          tipo_riga: Database["public"]["Enums"]["tipo_riga_preventivo"]
          um: string | null
          updated_at: string
          vendita: number | null
        }
        Insert: {
          articolo_id?: string | null
          blocco_id: string
          costo?: number | null
          created_at?: string
          descrizione?: string | null
          id?: string
          importo?: number | null
          incidenza?: number | null
          margine?: number | null
          ordine?: number
          peso?: number | null
          prezzo_unit?: number | null
          qta_ordinata?: number
          quantita?: number | null
          ricarico?: number | null
          riga_origine_id?: string | null
          sconto_perc?: number | null
          segno?: number
          tipo_riga?: Database["public"]["Enums"]["tipo_riga_preventivo"]
          um?: string | null
          updated_at?: string
          vendita?: number | null
        }
        Update: {
          articolo_id?: string | null
          blocco_id?: string
          costo?: number | null
          created_at?: string
          descrizione?: string | null
          id?: string
          importo?: number | null
          incidenza?: number | null
          margine?: number | null
          ordine?: number
          peso?: number | null
          prezzo_unit?: number | null
          qta_ordinata?: number
          quantita?: number | null
          ricarico?: number | null
          riga_origine_id?: string | null
          sconto_perc?: number | null
          segno?: number
          tipo_riga?: Database["public"]["Enums"]["tipo_riga_preventivo"]
          um?: string | null
          updated_at?: string
          vendita?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "righe_preventivo_articolo_id_fkey"
            columns: ["articolo_id"]
            isOneToOne: false
            referencedRelation: "articoli"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "righe_preventivo_blocco_id_fkey"
            columns: ["blocco_id"]
            isOneToOne: false
            referencedRelation: "blocchi_preventivo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "righe_preventivo_riga_origine_id_fkey"
            columns: ["riga_origine_id"]
            isOneToOne: false
            referencedRelation: "righe_preventivo"
            referencedColumns: ["id"]
          },
        ]
      }
      scadenze: {
        Row: {
          anno_partita: number | null
          assicurazione: number | null
          cliente_id: string
          cod_blocco: string | null
          codice_pagamento: string | null
          created_at: string
          data_documento: string | null
          data_pagamento: string | null
          data_pagamento_effettiva: string | null
          data_scadenza: string | null
          descrizione_pagamento: string | null
          dilazione_effettiva: number | null
          dilazione_teorica: number | null
          fido_euro: number | null
          giorni_ritardo: number | null
          id: string
          importato_da: string | null
          importo_documento: number | null
          importo_effetto_orig: number | null
          importo_netto_prev: number | null
          importo_originario: number | null
          importo_pagato: number | null
          importo_residuo: number | null
          importo_ritardo: number | null
          importo_scadenza: number | null
          in_legale: boolean | null
          key_documento: string | null
          key_tipo_effetto: number | null
          numero_documento: string | null
          promemoria_scadenza_inviato_il: string | null
          sede: number | null
          sollecitato: boolean | null
          stato_contabile: string | null
          tempi_scadenza: string | null
          tempi_scadenza_key: string | null
          tipologia_scadenza: string | null
          ultima_sincronizzazione: string | null
          updated_at: string
        }
        Insert: {
          anno_partita?: number | null
          assicurazione?: number | null
          cliente_id: string
          cod_blocco?: string | null
          codice_pagamento?: string | null
          created_at?: string
          data_documento?: string | null
          data_pagamento?: string | null
          data_pagamento_effettiva?: string | null
          data_scadenza?: string | null
          descrizione_pagamento?: string | null
          dilazione_effettiva?: number | null
          dilazione_teorica?: number | null
          fido_euro?: number | null
          giorni_ritardo?: number | null
          id?: string
          importato_da?: string | null
          importo_documento?: number | null
          importo_effetto_orig?: number | null
          importo_netto_prev?: number | null
          importo_originario?: number | null
          importo_pagato?: number | null
          importo_residuo?: number | null
          importo_ritardo?: number | null
          importo_scadenza?: number | null
          in_legale?: boolean | null
          key_documento?: string | null
          key_tipo_effetto?: number | null
          numero_documento?: string | null
          promemoria_scadenza_inviato_il?: string | null
          sede?: number | null
          sollecitato?: boolean | null
          stato_contabile?: string | null
          tempi_scadenza?: string | null
          tempi_scadenza_key?: string | null
          tipologia_scadenza?: string | null
          ultima_sincronizzazione?: string | null
          updated_at?: string
        }
        Update: {
          anno_partita?: number | null
          assicurazione?: number | null
          cliente_id?: string
          cod_blocco?: string | null
          codice_pagamento?: string | null
          created_at?: string
          data_documento?: string | null
          data_pagamento?: string | null
          data_pagamento_effettiva?: string | null
          data_scadenza?: string | null
          descrizione_pagamento?: string | null
          dilazione_effettiva?: number | null
          dilazione_teorica?: number | null
          fido_euro?: number | null
          giorni_ritardo?: number | null
          id?: string
          importato_da?: string | null
          importo_documento?: number | null
          importo_effetto_orig?: number | null
          importo_netto_prev?: number | null
          importo_originario?: number | null
          importo_pagato?: number | null
          importo_residuo?: number | null
          importo_ritardo?: number | null
          importo_scadenza?: number | null
          in_legale?: boolean | null
          key_documento?: string | null
          key_tipo_effetto?: number | null
          numero_documento?: string | null
          promemoria_scadenza_inviato_il?: string | null
          sede?: number | null
          sollecitato?: boolean | null
          stato_contabile?: string | null
          tempi_scadenza?: string | null
          tempi_scadenza_key?: string | null
          tipologia_scadenza?: string | null
          ultima_sincronizzazione?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "scadenze_importato_da_fkey"
            columns: ["importato_da"]
            isOneToOne: false
            referencedRelation: "importazioni"
            referencedColumns: ["id"]
          },
        ]
      }
      segmenti_marketing: {
        Row: {
          created_at: string
          created_by: string | null
          descrizione: string | null
          filtri: Json
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descrizione?: string | null
          filtri: Json
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descrizione?: string | null
          filtri?: Json
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      segmenti_marketing_clienti: {
        Row: {
          cliente_id: string
          created_at: string
          segmento_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          segmento_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          segmento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segmenti_marketing_clienti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmenti_marketing_clienti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segmenti_marketing_clienti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "segmenti_marketing_clienti_segmento_id_fkey"
            columns: ["segmento_id"]
            isOneToOne: false
            referencedRelation: "segmenti_marketing"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshot_scaduto: {
        Row: {
          created_at: string
          data_snapshot: string
          id: string
          n_azioni_aperte: number
          n_azioni_in_ritardo: number
          n_clienti_con_scaduto: number
          n_clienti_stadio_0: number
          n_clienti_stadio_1: number
          n_clienti_stadio_2: number
          n_clienti_stadio_mora: number
          n_fatture_scadute: number
          n_promesse_pagamento: number
          ritardo_mediano_mobile: number | null
          ritardo_mediano_solare: number | null
          ritardo_mediano_tot: number | null
          ritardo_medio_mobile: number | null
          ritardo_medio_solare: number | null
          ritardo_medio_tot: number | null
          ritardo_ponderato_mobile: number | null
          ritardo_ponderato_solare: number | null
          ritardo_ponderato_tot: number | null
          scaduto_1_30: number
          scaduto_31_60: number
          scaduto_mobile: number
          scaduto_oltre_60: number
          scaduto_solare: number
          totale_a_scadere: number
          totale_scaduto: number
        }
        Insert: {
          created_at?: string
          data_snapshot: string
          id?: string
          n_azioni_aperte?: number
          n_azioni_in_ritardo?: number
          n_clienti_con_scaduto?: number
          n_clienti_stadio_0?: number
          n_clienti_stadio_1?: number
          n_clienti_stadio_2?: number
          n_clienti_stadio_mora?: number
          n_fatture_scadute?: number
          n_promesse_pagamento?: number
          ritardo_mediano_mobile?: number | null
          ritardo_mediano_solare?: number | null
          ritardo_mediano_tot?: number | null
          ritardo_medio_mobile?: number | null
          ritardo_medio_solare?: number | null
          ritardo_medio_tot?: number | null
          ritardo_ponderato_mobile?: number | null
          ritardo_ponderato_solare?: number | null
          ritardo_ponderato_tot?: number | null
          scaduto_1_30?: number
          scaduto_31_60?: number
          scaduto_mobile?: number
          scaduto_oltre_60?: number
          scaduto_solare?: number
          totale_a_scadere?: number
          totale_scaduto?: number
        }
        Update: {
          created_at?: string
          data_snapshot?: string
          id?: string
          n_azioni_aperte?: number
          n_azioni_in_ritardo?: number
          n_clienti_con_scaduto?: number
          n_clienti_stadio_0?: number
          n_clienti_stadio_1?: number
          n_clienti_stadio_2?: number
          n_clienti_stadio_mora?: number
          n_fatture_scadute?: number
          n_promesse_pagamento?: number
          ritardo_mediano_mobile?: number | null
          ritardo_mediano_solare?: number | null
          ritardo_mediano_tot?: number | null
          ritardo_medio_mobile?: number | null
          ritardo_medio_solare?: number | null
          ritardo_medio_tot?: number | null
          ritardo_ponderato_mobile?: number | null
          ritardo_ponderato_solare?: number | null
          ritardo_ponderato_tot?: number | null
          scaduto_1_30?: number
          scaduto_31_60?: number
          scaduto_mobile?: number
          scaduto_oltre_60?: number
          scaduto_solare?: number
          totale_a_scadere?: number
          totale_scaduto?: number
        }
        Relationships: []
      }
      snapshot_scaduto_cliente: {
        Row: {
          cliente_id: string
          created_at: string
          data_snapshot: string
          id: string
          n_fatture_scadute: number
          ritardo_medio_tot: number | null
          totale_a_scadere: number
          totale_scaduto: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_snapshot: string
          id?: string
          n_fatture_scadute?: number
          ritardo_medio_tot?: number | null
          totale_a_scadere?: number
          totale_scaduto?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_snapshot?: string
          id?: string
          n_fatture_scadute?: number
          ritardo_medio_tot?: number | null
          totale_a_scadere?: number
          totale_scaduto?: number
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_scaduto_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snapshot_scaduto_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snapshot_scaduto_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      snapshot_scaduto_store: {
        Row: {
          created_at: string
          data_snapshot: string
          id: string
          n_fatture_scadute: number
          ritardo_medio_tot: number | null
          store_id: string | null
          totale_a_scadere: number
          totale_scaduto: number
        }
        Insert: {
          created_at?: string
          data_snapshot: string
          id?: string
          n_fatture_scadute?: number
          ritardo_medio_tot?: number | null
          store_id?: string | null
          totale_a_scadere?: number
          totale_scaduto?: number
        }
        Update: {
          created_at?: string
          data_snapshot?: string
          id?: string
          n_fatture_scadute?: number
          ritardo_medio_tot?: number | null
          store_id?: string | null
          totale_a_scadere?: number
          totale_scaduto?: number
        }
        Relationships: [
          {
            foreignKeyName: "snapshot_scaduto_store_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      solleciti: {
        Row: {
          cliente_id: string
          created_at: string
          data_risposta: string | null
          data_sollecito: string
          id: string
          importo_ref: number | null
          inserito_da: string | null
          nota: string
          reminder_attivo: boolean | null
          reminder_data: string | null
          reminder_inviato: boolean | null
          risposta: string | null
          scadenza_id: string | null
          stato: Database["public"]["Enums"]["stato_sollecito"]
          tipo: Database["public"]["Enums"]["tipo_sollecito"]
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_risposta?: string | null
          data_sollecito?: string
          id?: string
          importo_ref?: number | null
          inserito_da?: string | null
          nota: string
          reminder_attivo?: boolean | null
          reminder_data?: string | null
          reminder_inviato?: boolean | null
          risposta?: string | null
          scadenza_id?: string | null
          stato?: Database["public"]["Enums"]["stato_sollecito"]
          tipo?: Database["public"]["Enums"]["tipo_sollecito"]
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_risposta?: string | null
          data_sollecito?: string
          id?: string
          importo_ref?: number | null
          inserito_da?: string | null
          nota?: string
          reminder_attivo?: boolean | null
          reminder_data?: string | null
          reminder_inviato?: boolean | null
          risposta?: string | null
          scadenza_id?: string | null
          stato?: Database["public"]["Enums"]["stato_sollecito"]
          tipo?: Database["public"]["Enums"]["tipo_sollecito"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solleciti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solleciti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solleciti_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "solleciti_inserito_da_fkey"
            columns: ["inserito_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solleciti_scadenza_id_fkey"
            columns: ["scadenza_id"]
            isOneToOne: false
            referencedRelation: "scadenze"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          attivo: boolean
          cap: string | null
          citta: string | null
          codice: string
          created_at: string
          email_sede: string | null
          geocodifica_stato: string | null
          geocodificato_il: string | null
          id: string
          indirizzo: string | null
          insegna: string | null
          lat: number | null
          lng: number | null
          nome: string
          pec_sede: string | null
          piva: string | null
          provincia: string | null
          ragione_sociale_sede: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          codice: string
          created_at?: string
          email_sede?: string | null
          geocodifica_stato?: string | null
          geocodificato_il?: string | null
          id?: string
          indirizzo?: string | null
          insegna?: string | null
          lat?: number | null
          lng?: number | null
          nome: string
          pec_sede?: string | null
          piva?: string | null
          provincia?: string | null
          ragione_sociale_sede?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          codice?: string
          created_at?: string
          email_sede?: string | null
          geocodifica_stato?: string | null
          geocodificato_il?: string | null
          id?: string
          indirizzo?: string | null
          insegna?: string | null
          lat?: number | null
          lng?: number | null
          nome?: string
          pec_sede?: string | null
          piva?: string | null
          provincia?: string | null
          ragione_sociale_sede?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      storico_fido: {
        Row: {
          cliente_id: string
          created_at: string
          data_inizio_fido: string | null
          data_scadenza_fido: string | null
          eseguito_da: string | null
          id: string
          importo_nuovo: number
          importo_precedente: number | null
          note: string | null
          richiesta_id: string | null
          tipo_variazione: Database["public"]["Enums"]["tipo_variazione_fido"]
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_inizio_fido?: string | null
          data_scadenza_fido?: string | null
          eseguito_da?: string | null
          id?: string
          importo_nuovo: number
          importo_precedente?: number | null
          note?: string | null
          richiesta_id?: string | null
          tipo_variazione: Database["public"]["Enums"]["tipo_variazione_fido"]
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_inizio_fido?: string | null
          data_scadenza_fido?: string | null
          eseguito_da?: string | null
          id?: string
          importo_nuovo?: number
          importo_precedente?: number | null
          note?: string | null
          richiesta_id?: string | null
          tipo_variazione?: Database["public"]["Enums"]["tipo_variazione_fido"]
        }
        Relationships: [
          {
            foreignKeyName: "storico_fido_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storico_fido_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storico_fido_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "storico_fido_richiesta_id_fkey"
            columns: ["richiesta_id"]
            isOneToOne: false
            referencedRelation: "richieste_fido"
            referencedColumns: ["id"]
          },
        ]
      }
      storico_pratiche_legali: {
        Row: {
          created_at: string
          id: string
          modificato_da: string | null
          nota: string | null
          pratica_id: string
          stato_nuovo: Database["public"]["Enums"]["stato_pratica_legale"]
          stato_precedente:
            | Database["public"]["Enums"]["stato_pratica_legale"]
            | null
        }
        Insert: {
          created_at?: string
          id?: string
          modificato_da?: string | null
          nota?: string | null
          pratica_id: string
          stato_nuovo: Database["public"]["Enums"]["stato_pratica_legale"]
          stato_precedente?:
            | Database["public"]["Enums"]["stato_pratica_legale"]
            | null
        }
        Update: {
          created_at?: string
          id?: string
          modificato_da?: string | null
          nota?: string | null
          pratica_id?: string
          stato_nuovo?: Database["public"]["Enums"]["stato_pratica_legale"]
          stato_precedente?:
            | Database["public"]["Enums"]["stato_pratica_legale"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "storico_pratiche_legali_modificato_da_fkey"
            columns: ["modificato_da"]
            isOneToOne: false
            referencedRelation: "profili"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storico_pratiche_legali_pratica_id_fkey"
            columns: ["pratica_id"]
            isOneToOne: false
            referencedRelation: "pratiche_legali"
            referencedColumns: ["id"]
          },
        ]
      }
      template_email: {
        Row: {
          attivo: boolean
          corpo: string
          created_at: string
          id: string
          nome: string
          oggetto: string
          tipo: string
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          corpo: string
          created_at?: string
          id?: string
          nome: string
          oggetto: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          corpo?: string
          created_at?: string
          id?: string
          nome?: string
          oggetto?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_lettera: {
        Row: {
          attivo: boolean
          corpo: string
          created_at: string
          id: string
          nome: string
          oggetto: string | null
          tipo: string
          updated_at: string
          usa_dati_automatici: boolean
        }
        Insert: {
          attivo?: boolean
          corpo: string
          created_at?: string
          id?: string
          nome: string
          oggetto?: string | null
          tipo?: string
          updated_at?: string
          usa_dati_automatici?: boolean
        }
        Update: {
          attivo?: boolean
          corpo?: string
          created_at?: string
          id?: string
          nome?: string
          oggetto?: string | null
          tipo?: string
          updated_at?: string
          usa_dati_automatici?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      clienti_con_rischio: {
        Row: {
          a_scadere: number | null
          abi: string | null
          agenzia: string | null
          attivo: boolean | null
          banca: string | null
          cab: string | null
          cap: string | null
          citta: string | null
          codice_fiscale: string | null
          codice_gestionale: string | null
          codice_sdi: string | null
          condizione_pagamento_cod: string | null
          condizione_pagamento_desc: string | null
          condizioni_pagamento: string | null
          created_at: string | null
          created_by: string | null
          data_firma: string | null
          dichiarante_cognome: string | null
          dichiarante_nome: string | null
          dilazione_concordata: number | null
          dilazione_effettiva: number | null
          doc_da_evadere: number | null
          doc_da_fatturare: number | null
          effetti_a_rischio: number | null
          email: string | null
          fido: number | null
          fido_gestionale: number | null
          fido_residuo: number | null
          firma_url: string | null
          id: string | null
          indirizzo: string | null
          note: string | null
          num_insoluti: number | null
          partita_iva: string | null
          pec: string | null
          percentuale_utilizzo_fido: number | null
          privacy_firmata: boolean | null
          privacy_pdf_url: string | null
          privacy_token: string | null
          privacy_token_expires_at: string | null
          provincia: string | null
          ragione_sociale: string | null
          saldo_contabile: number | null
          scaduto: number | null
          scheda_pdf_url: string | null
          semaforo_rischio: string | null
          store_id: string | null
          telefono: string | null
          tipo_soggetto: string | null
          totale_rischio: number | null
          ultima_sincronizzazione: string | null
          updated_at: string | null
        }
        Insert: {
          a_scadere?: number | null
          abi?: string | null
          agenzia?: string | null
          attivo?: boolean | null
          banca?: string | null
          cab?: string | null
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          codice_gestionale?: string | null
          codice_sdi?: string | null
          condizione_pagamento_cod?: string | null
          condizione_pagamento_desc?: string | null
          condizioni_pagamento?: string | null
          created_at?: string | null
          created_by?: string | null
          data_firma?: string | null
          dichiarante_cognome?: string | null
          dichiarante_nome?: string | null
          dilazione_concordata?: number | null
          dilazione_effettiva?: number | null
          doc_da_evadere?: number | null
          doc_da_fatturare?: number | null
          effetti_a_rischio?: number | null
          email?: string | null
          fido?: number | null
          fido_gestionale?: number | null
          fido_residuo?: number | null
          firma_url?: string | null
          id?: string | null
          indirizzo?: string | null
          note?: string | null
          num_insoluti?: number | null
          partita_iva?: string | null
          pec?: string | null
          percentuale_utilizzo_fido?: never
          privacy_firmata?: boolean | null
          privacy_pdf_url?: string | null
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          provincia?: string | null
          ragione_sociale?: string | null
          saldo_contabile?: number | null
          scaduto?: number | null
          scheda_pdf_url?: string | null
          semaforo_rischio?: never
          store_id?: string | null
          telefono?: string | null
          tipo_soggetto?: string | null
          totale_rischio?: number | null
          ultima_sincronizzazione?: string | null
          updated_at?: string | null
        }
        Update: {
          a_scadere?: number | null
          abi?: string | null
          agenzia?: string | null
          attivo?: boolean | null
          banca?: string | null
          cab?: string | null
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          codice_gestionale?: string | null
          codice_sdi?: string | null
          condizione_pagamento_cod?: string | null
          condizione_pagamento_desc?: string | null
          condizioni_pagamento?: string | null
          created_at?: string | null
          created_by?: string | null
          data_firma?: string | null
          dichiarante_cognome?: string | null
          dichiarante_nome?: string | null
          dilazione_concordata?: number | null
          dilazione_effettiva?: number | null
          doc_da_evadere?: number | null
          doc_da_fatturare?: number | null
          effetti_a_rischio?: number | null
          email?: string | null
          fido?: number | null
          fido_gestionale?: number | null
          fido_residuo?: number | null
          firma_url?: string | null
          id?: string | null
          indirizzo?: string | null
          note?: string | null
          num_insoluti?: number | null
          partita_iva?: string | null
          pec?: string | null
          percentuale_utilizzo_fido?: never
          privacy_firmata?: boolean | null
          privacy_pdf_url?: string | null
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          provincia?: string | null
          ragione_sociale?: string | null
          saldo_contabile?: number | null
          scaduto?: number | null
          scheda_pdf_url?: string | null
          semaforo_rischio?: never
          store_id?: string | null
          telefono?: string | null
          tipo_soggetto?: string | null
          totale_rischio?: number | null
          ultima_sincronizzazione?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clienti_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fatturato_annuale_globale: {
        Row: {
          anno: number | null
          fatturato_totale: number | null
          num_clienti: number | null
          num_fatture_totali: number | null
        }
        Relationships: []
      }
      fatturato_clienti: {
        Row: {
          anno: number | null
          cliente_id: string | null
          fatturato: number | null
          num_fatture: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      fatturato_mensile_cliente: {
        Row: {
          cliente_id: string | null
          importo_lordo: number | null
          mese: string | null
          n_documenti: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      fatturato_rolling_cliente: {
        Row: {
          anno_corrente: number | null
          anno_precedente: number | null
          cliente_id: string | null
          rolling_12m: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti_con_rischio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "riepilogo_insoluti"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      fatturato_ytd_globale: {
        Row: {
          anno: number | null
          fatturato: number | null
          num_clienti: number | null
          num_fatture: number | null
          ytd_alla_data: string | null
        }
        Relationships: []
      }
      riepilogo_insoluti: {
        Row: {
          assicurazione_attiva: boolean | null
          bloccato: boolean | null
          cliente_id: string | null
          codice_gestionale: string | null
          in_gestione_legale: boolean | null
          max_giorni_ritardo: number | null
          media_giorni_ritardo: number | null
          num_scadenze_aperte: number | null
          num_solleciti: number | null
          polizze_attive: number | null
          pratiche_legali_aperte: number | null
          ragione_sociale: string | null
          scaduto_0_30: number | null
          scaduto_30_60: number | null
          scaduto_oltre_60: number | null
          store_id: string | null
          totale_scaduto: number | null
          ultimo_sollecito: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clienti_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      allegato_storage_path_cliente_id: {
        Args: { _name: string }
        Returns: string
      }
      annulla_conversione_lead: {
        Args: { _lead_id: string }
        Returns: undefined
      }
      anteprima_numero_ordine: { Args: { p_anno: number }; Returns: number }
      anteprima_numero_preventivo: { Args: { p_anno: number }; Returns: number }
      arrotonda_fido_proposto: { Args: { _fido_base: number }; Returns: number }
      bulk_update_clienti_bfa: { Args: { _payloads: Json }; Returns: number }
      calcola_fido_base: {
        Args: { _fatturato_lordo: number; _giorni: number }
        Returns: number
      }
      calcola_livello_fido: { Args: { _importo: number }; Returns: number }
      calcola_scaduto: { Args: { _ant: number; _ssa: number }; Returns: number }
      calcola_semaforo_affidabilita_batch: {
        Args: { _ids: string[] }
        Returns: {
          cliente_id: string
          motivo: string
          numero: number
          stadio: string
        }[]
      }
      can_manage_email_assets: { Args: never; Returns: boolean }
      coefficiente_comportamento: {
        Args: {
          _giorni_oltre: number
          _num_insoluti: number
          _patologico: boolean
        }
        Returns: number
      }
      collega_righe_import: {
        Args: { _riga_ids: string[] }
        Returns: {
          collegate: number
          saltate: number
        }[]
      }
      converti_lead_in_cliente: {
        Args: { _forza_duplicato?: boolean; _lead_id: string }
        Returns: {
          cliente_id: string
          duplicati: Json
        }[]
      }
      crea_lead_da_righe_import: {
        Args: { _riga_ids: string[] }
        Returns: {
          creati: number
          saltate: number
        }[]
      }
      crea_partecipante_da_nuovo_soggetto: {
        Args: {
          _cap?: string
          _cellulare?: string
          _citta?: string
          _codice_fiscale?: string
          _cognome?: string
          _crea_contatto?: boolean
          _email?: string
          _evento_id: string
          _fonte_dettaglio?: string
          _indirizzo?: string
          _nome?: string
          _note?: string
          _partita_iva?: string
          _provincia?: string
          _ragione_sociale?: string
          _stato: Database["public"]["Enums"]["eventi_partecipante_stato"]
          _telefono?: string
          _tipo_soggetto: string
        }
        Returns: {
          contatto_id: string
          lead_id: string
          partecipante_id: string
        }[]
      }
      effective_store_filter: { Args: { _requested: string }; Returns: string }
      elimina_lead: { Args: { _lead_id: string }; Returns: undefined }
      fn_email_valida: { Args: { _raw: string }; Returns: boolean }
      fn_telefono_valido: { Args: { _raw: string }; Returns: boolean }
      genera_snapshot: { Args: { _data: string }; Returns: string }
      get_clienti_avvisati: {
        Args: never
        Returns: {
          cliente_id: string
          ha_email: boolean
          n_azioni: number
          ultima_data: string
          ultima_tipo: string
        }[]
      }
      get_clienti_scadenziario: {
        Args: never
        Returns: {
          cliente_id: string
          ha_a_scadere: boolean
          ha_scaduto: boolean
          totale_a_scadere: number
          totale_scaduto: number
        }[]
      }
      get_clienti_senza_email_con_scadenze: {
        Args: never
        Returns: {
          cliente_id: string
          codice_gestionale: string
          email: string
          n_scadenze_aperte: number
          pec: string
          ragione_sociale: string
          stato_email: string
          store_nome: string
          totale_a_scadere: number
          totale_scaduto: number
        }[]
      }
      get_coerenza_escalation: {
        Args: { _cliente_ids: string[]; _livello_precedente: number }
        Returns: {
          cliente_id: string
          data_azione_precedente: string
          ha_azione_precedente: boolean
          scadenze_aperte_correnti: string[]
          scadenze_precedente: string[]
          scaduto_cambiato: boolean
        }[]
      }
      get_cruscotto_incassi_mensile: {
        Args: { _anno: number; _store_id?: string }
        Returns: {
          a_scadere: number
          a_scadere_riba: number
          da_incassare: number
          dovuto: number
          eccedenza: number
          incassato: number
          mese: number
          n_pagate: number
          n_scadenze: number
          pct: number
          scaduto: number
          scaduto_riba: number
        }[]
      }
      get_cruscotto_incassi_mese_dettaglio: {
        Args: { _anno: number; _mese: number; _store_id?: string }
        Returns: {
          a_scadere_mese: number
          bloccato: boolean
          cliente_id: string
          codice_gestionale: string
          dovuto_mese: number
          eccedenza_mese: number
          email: string
          esposizione_scaduta_totale: number
          in_gestione_legale: boolean
          incassato_mese: number
          insoluto_mese: number
          metodo_prevalente: string
          n_scadenze_mese: number
          n_scadenze_pagate_mese: number
          pec: string
          ragione_sociale: string
          scaduto_mese: number
          store_id: string
          store_nome: string
        }[]
      }
      get_cruscotto_incassi_mese_scadenze: {
        Args: { _anno: number; _mese: number; _store_id?: string }
        Returns: {
          bloccato: boolean
          cliente_id: string
          codice_gestionale: string
          codice_pagamento: string
          data_scadenza: string
          eccedenza: number
          email: string
          importo_pagato: number
          importo_scadenza: number
          in_gestione_legale: boolean
          metodo_descrizione: string
          numero_documento: string
          pec: string
          quota_incassata: number
          ragione_sociale: string
          residuo: number
          scadenza_id: string
          scaduta: boolean
          store_id: string
          store_nome: string
        }[]
      }
      get_dashboard_commerciale: {
        Args: { _agente_codice?: string; _data_a?: string; _data_da?: string }
        Returns: {
          aperte_n: number
          aperte_val: number
          attivita_arretrate_n: number
          attivita_da_fare_n: number
          in_lavorazione_n: number
          in_lavorazione_val: number
          perse_n: number
          perse_val: number
          pipeline_aperta_val: number
          preventivo_n: number
          preventivo_val: number
          tasso_conversione: number
          valore_medio_vinta: number
          vinte_n: number
          vinte_val: number
        }[]
      }
      get_dashboard_commerciale_per_agente: {
        Args: { _data_a?: string; _data_da?: string }
        Returns: {
          agente_codice: string
          agente_nome: string
          aperte_n: number
          perse_n: number
          pipeline_val: number
          tasso_conversione: number
          vinte_n: number
          vinte_val: number
        }[]
      }
      get_dashboard_fidi: {
        Args: never
        Returns: {
          aggiornato_al: string
          da_verificare_n: number
          fermi_n: number
          fermi_scaduto_eur: number
          fido_concesso_clienti: number
          fido_concesso_eur: number
          fido_concesso_piccoli_eur: number
          fido_concesso_piccoli_n: number
          fido_proposto_clienti: number
          fido_proposto_eur: number
          fido_proposto_piccoli_eur: number
          fido_proposto_piccoli_n: number
          insoluti_eur: number
          insoluti_n: number
          insoluti_non_bloccati_n: number
          oltre_fido_eur: number
          oltre_fido_n: number
          scaduto_eur: number
          scaduto_over60_eur: number
        }[]
      }
      get_dashboard_fidi_aggregati: {
        Args: never
        Returns: {
          chiave: string
          etichetta: string
          fido_concesso_eur: number
          fido_proposto_eur: number
          n_clienti: number
          n_clienti_con_fido: number
          ordine: number
          tipo: string
        }[]
      }
      get_dso_aggregato: {
        Args: {
          _cliente_id?: string
          _data_a?: string
          _data_da?: string
          _store_id?: string
        }
        Returns: {
          all_importo: number
          all_n: number
          all_reale_medio: number
          all_reale_pond: number
          all_scollamento_medio: number
          all_scollamento_pond: number
          all_teorico_medio: number
          all_teorico_pond: number
          cred_importo: number
          cred_n: number
          cred_reale_medio: number
          cred_reale_pond: number
          cred_scollamento_medio: number
          cred_scollamento_pond: number
          cred_teorico_medio: number
          cred_teorico_pond: number
          importo_anticipo: number
          importo_puntuali: number
          importo_ritardo: number
          n_anticipo: number
          n_puntuali: number
          n_ritardo: number
        }[]
      }
      get_dso_serie_mensile: {
        Args: {
          _cliente_id?: string
          _mesi_indietro?: number
          _store_id?: string
        }
        Returns: {
          all_reale: number
          all_teorico: number
          cred_reale: number
          cred_teorico: number
          mese: string
          n_scadenze: number
        }[]
      }
      get_esperienza_pagamento_cliente: {
        Args: { p_cliente_id: string }
        Returns: {
          max_ritardo_gg: number
          n_in_ritardo: number
          n_pagate: number
          perc_in_ritardo: number
          ritardo_medio_gg: number
        }[]
      }
      get_fatturato_clienti_scadenziario: {
        Args: { _anno_corrente: number; _anno_prec: number }
        Returns: {
          cliente_id: string
          fatturato_anno_corrente: number
          fatturato_anno_prec: number
        }[]
      }
      get_fido_teorico: {
        Args: { _cliente_ids?: string[]; _solo_condizione_mancante?: boolean }
        Returns: {
          cliente_id: string
          coefficiente: number
          ddt_da_fatturare: number
          esposizione_corrente: number
          fatturato_rolling: number
          fido_attuale: number
          fido_base: number
          fido_base_lordo: number
          fido_proposto: number
          fido_proposto_senza_coefficiente: number
          fido_teorico_puro: number
          giorni: number
          giorni_mancanti: boolean
          giorni_oltre_accordo: number
          nota_proposta: string
          pavimento_applicato: boolean
          profilo_pagamento: string
          regola_applicata: string
          richiede_verifica: boolean
          ritmo_mensile: number
          scostamento: number
          sede_cinisello: boolean
        }[]
      }
      get_incassi_periodo: {
        Args: {
          _al: string
          _cliente_search?: string
          _dal: string
          _metodi?: string[]
          _store_id?: string
        }
        Returns: {
          cliente_id: string
          codice_gestionale: string
          metodo_prevalente: string
          n_incassi: number
          n_parziali: number
          n_saldi: number
          ragione_sociale: string
          store_id: string
          store_nome: string
          tipo_prevalente: string
          totale_incassato: number
          ultimo_incasso: string
        }[]
      }
      get_incassi_periodo_dettaglio: {
        Args: {
          _al: string
          _cliente_id: string
          _dal: string
          _metodi?: string[]
          _store_id?: string
        }
        Returns: {
          codice_pagamento: string
          data_pagamento_effettiva: string
          data_scadenza: string
          importo_pagato: number
          importo_scadenza: number
          metodo_descrizione: string
          numero_documento: string
          scadenza_id: string
        }[]
      }
      get_promemoria_clienti_aggregato:
        | {
            Args: {
              _escludi_bloccati?: boolean
              _escludi_legale?: boolean
              _importo_min?: number
              _mesi: string[]
              _search?: string
              _store_id?: string
            }
            Returns: {
              bloccato: boolean
              cliente_id: string
              email: string
              n_scadenze: number
              pec: string
              prima_scadenza: string
              ragione_sociale: string
              store_id: string
              store_nome: string
              totale_a_scadere: number
            }[]
          }
        | {
            Args: {
              _escludi_bloccati?: boolean
              _escludi_bos?: boolean
              _escludi_legale?: boolean
              _importo_min?: number
              _mesi: string[]
              _search?: string
              _store_id?: string
            }
            Returns: {
              bloccato: boolean
              cliente_id: string
              email: string
              n_scadenze: number
              pec: string
              prima_scadenza: string
              ragione_sociale: string
              store_id: string
              store_nome: string
              totale_a_scadere: number
            }[]
          }
      get_promemoria_scadenze_dettaglio: {
        Args: {
          _data: string
          _escludi_bloccati?: boolean
          _escludi_bos?: boolean
          _escludi_legale?: boolean
          _includi_bonifici?: boolean
          _includi_riba?: boolean
        }
        Returns: {
          cliente_id: string
          codice_pagamento: string
          data_documento: string
          data_scadenza: string
          email: string
          importo_scadenza: number
          numero_documento: string
          pec: string
          ragione_sociale: string
          scadenza_id: string
          store_cap: string
          store_citta: string
          store_id: string
          store_indirizzo: string
          store_insegna: string
          store_nome: string
          store_provincia: string
          store_telefono: string
        }[]
      }
      get_recupero_clienti_aggregato: {
        Args: {
          _data_a?: string
          _data_da?: string
          _esiti?: string[]
          _operatore_id?: string
          _search?: string
          _stadi?: number[]
          _store_id?: string
          _tipi?: string[]
        }
        Returns: {
          azioni_aperte: number
          azioni_totali: number
          cliente_id: string
          data_promessa: string
          ha_promessa: boolean
          in_ritardo: boolean
          prossima_data: string
          prossima_tipo: string
          ragione_sociale: string
          stadio_data: string
          stadio_giorni: number
          stadio_sollecito: number
          store_id: string
          store_nome: string
          totale_scaduto: number
          ultima_fatta_data: string
          ultima_fatta_tipo: string
        }[]
      }
      get_richieste_con_messaggi_non_letti: { Args: never; Returns: string[] }
      get_scadenziario_ids:
        | {
            Args: {
              p_avvisato?: string
              p_escludi_bonifici?: boolean
              p_escludi_legale?: boolean
              p_fascia?: string
              p_importo_min?: number
              p_mostra_a_credito?: boolean
              p_search?: string
              p_stato_blocco?: string
              p_stato_legale?: string
              p_store_id?: string
            }
            Returns: {
              cliente_id: string
            }[]
          }
        | {
            Args: {
              p_agente?: string
              p_avvisato?: string
              p_escludi_bonifici?: boolean
              p_escludi_legale?: boolean
              p_fascia?: string
              p_importo_min?: number
              p_mostra_a_credito?: boolean
              p_search?: string
              p_stato_blocco?: string
              p_stato_legale?: string
              p_store_id?: string
            }
            Returns: {
              cliente_id: string
            }[]
          }
      get_scadenziario_lista_paginata:
        | {
            Args: {
              p_anno_corrente?: number
              p_anno_prec?: number
              p_avvisato?: string
              p_escludi_bonifici?: boolean
              p_escludi_legale?: boolean
              p_fascia?: string
              p_importo_min?: number
              p_mostra_a_credito?: boolean
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_sort_by?: string
              p_sort_dir?: string
              p_stato_blocco?: string
              p_stato_legale?: string
              p_store_id?: string
            }
            Returns: {
              avvisato_ha_email: boolean
              avvisato_n: number
              avvisato_ultima_data: string
              avvisato_ultima_tipo: string
              bloccato: boolean
              cliente_id: string
              codice_gestionale: string
              data_promessa: string
              fascia: string
              fatturato_cur: number
              fatturato_prec: number
              ha_piano_rientro: boolean
              ha_promessa: boolean
              in_gestione_legale: boolean
              ind_blocco: number
              max_gg_ritardo: number
              n_a_scadere: number
              n_scadute: number
              piano_prossima_rata_data: string
              piano_prossima_rata_importo: number
              piano_rate_pagate: number
              piano_rate_totali: number
              piano_rientro_id: string
              prossima_scadenza: string
              ragione_sociale: string
              scadute_ids: string[]
              store_id: string
              store_nome: string
              tot_a_scadere: number
              tot_scaduto: number
              total_count: number
            }[]
          }
        | {
            Args: {
              p_agente?: string
              p_anno_corrente?: number
              p_anno_prec?: number
              p_avvisato?: string
              p_escludi_bonifici?: boolean
              p_escludi_legale?: boolean
              p_fascia?: string
              p_importo_min?: number
              p_mostra_a_credito?: boolean
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_sort_by?: string
              p_sort_dir?: string
              p_stato_blocco?: string
              p_stato_legale?: string
              p_store_id?: string
            }
            Returns: {
              avvisato_ha_email: boolean
              avvisato_n: number
              avvisato_ultima_data: string
              avvisato_ultima_tipo: string
              bloccato: boolean
              cliente_id: string
              codice_gestionale: string
              data_promessa: string
              fascia: string
              fatturato_cur: number
              fatturato_prec: number
              ha_piano_rientro: boolean
              ha_promessa: boolean
              in_gestione_legale: boolean
              ind_blocco: number
              max_gg_ritardo: number
              n_a_scadere: number
              n_scadute: number
              piano_prossima_rata_data: string
              piano_prossima_rata_importo: number
              piano_rate_pagate: number
              piano_rate_totali: number
              piano_rientro_id: string
              prossima_scadenza: string
              ragione_sociale: string
              scadute_ids: string[]
              store_id: string
              store_nome: string
              tot_a_scadere: number
              tot_scaduto: number
              total_count: number
            }[]
          }
      get_scadenziario_totali:
        | {
            Args: {
              p_avvisato?: string
              p_escludi_bonifici?: boolean
              p_escludi_legale?: boolean
              p_fascia?: string
              p_importo_min?: number
              p_mostra_a_credito?: boolean
              p_search?: string
              p_stato_blocco?: string
              p_stato_legale?: string
              p_store_id?: string
            }
            Returns: {
              n_bonifici_esclusi: number
              n_clienti_bloccati: number
              n_clienti_crediti: number
              n_clienti_in_legale: number
              n_clienti_scaduti: number
              n_clienti_totali: number
              n_legale_esclusi: number
              tot_a_scadere: number
              tot_crediti: number
              tot_scaduto: number
            }[]
          }
        | {
            Args: {
              p_agente?: string
              p_avvisato?: string
              p_escludi_bonifici?: boolean
              p_escludi_legale?: boolean
              p_fascia?: string
              p_importo_min?: number
              p_mostra_a_credito?: boolean
              p_search?: string
              p_stato_blocco?: string
              p_stato_legale?: string
              p_store_id?: string
            }
            Returns: {
              n_bonifici_esclusi: number
              n_clienti_bloccati: number
              n_clienti_crediti: number
              n_clienti_in_legale: number
              n_clienti_scaduti: number
              n_clienti_totali: number
              n_legale_esclusi: number
              tot_a_scadere: number
              tot_crediti: number
              tot_scaduto: number
            }[]
          }
      get_semaforo_affidabilita_cliente: {
        Args: { p_cliente_id: string }
        Returns: {
          eur_scaduto_grave: number
          motivo: string
          n_scaduto_grave: number
          num_insoluti: number
          ritardo_medio_ritardi: number
          stadio: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_utenti_assegnabili: {
        Args: never
        Returns: {
          cognome: string
          id: string
          nome: string
        }[]
      }
      has_lead_module_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_importazione_counters:
        | {
            Args: {
              _create: number
              _elaborate: number
              _error: number
              _id: string
              _update: number
            }
            Returns: {
              chunks_completati: number
              chunks_totali: number
            }[]
          }
        | {
            Args: {
              _create: number
              _elaborate: number
              _error: number
              _id: string
              _skipped?: number
              _update: number
            }
            Returns: {
              chunks_completati: number
              chunks_totali: number
            }[]
          }
      invia_comunicazione_richiesta: {
        Args: { _destinatario: string; _richiesta_id: string; _testo: string }
        Returns: Json
      }
      is_anticipo: { Args: { _numero_documento: string }; Returns: boolean }
      is_canale_membro: {
        Args: { _canale_id: string; _user_id: string }
        Returns: boolean
      }
      livello_approvatore: { Args: { _user_id: string }; Returns: number }
      marca_comunicazioni_lette: {
        Args: { _richiesta_id: string }
        Returns: undefined
      }
      marca_messaggi_letti: { Args: { _richiesta_id: string }; Returns: number }
      peso_mese_fido: { Args: { _eta: number }; Returns: number }
      processa_richiesta_fido: {
        Args: {
          _esito: string
          _importo_approvato?: number
          _note?: string
          _richiesta_id: string
        }
        Returns: {
          approvato_da: string | null
          cliente_id: string
          condizione_pagamento_cod: string | null
          created_at: string
          created_by: string | null
          data_approvazione: string | null
          data_chiusura: string | null
          data_export: string | null
          data_invio: string | null
          data_processata: string | null
          data_scadenza: string | null
          durata_mesi: number
          esportata_da: string | null
          id: string
          importo_approvato: number | null
          importo_richiesto: number
          livello_corrente: number
          livello_richiesto: number
          motivazione: string | null
          note: string | null
          note_export: string | null
          processata_da: string | null
          stato: Database["public"]["Enums"]["stato_richiesta"]
          stato_export: string | null
          store_id: string | null
          tipo: Database["public"]["Enums"]["tipo_richiesta"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "richieste_fido"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prossimo_numero_ordine: { Args: { p_anno: number }; Returns: number }
      prossimo_numero_preventivo: { Args: { p_anno: number }; Returns: number }
      refresh_fatturato_mensile: { Args: never; Returns: string }
      registra_clic_campagna: {
        Args: { _ip?: string; _token: string; _ua?: string; _url: string }
        Returns: boolean
      }
      registra_consensi_batch: {
        Args: {
          _contatto_id: string
          _informativa_hash?: string
          _informativa_versione?: string
          _ip?: string
          _marketing_diretto: boolean
          _marketing_media: boolean
          _note?: string
          _operatore_id?: string
          _origine: string
          _profilazione: boolean
          _prova_path?: string
          _secondi_permanenza?: number
          _user_agent?: string
        }
        Returns: undefined
      }
      registra_consenso: {
        Args: {
          _contatto_id: string
          _ip?: string
          _note?: string
          _operatore_id?: string
          _origine: string
          _prova_path?: string
          _tipo_consenso: string
          _valore: boolean
        }
        Returns: string
      }
      revoca_consensi_batch: {
        Args: {
          _contatto_id: string
          _ip?: string
          _marketing_diretto?: boolean
          _marketing_media?: boolean
          _note?: string
          _origine?: string
          _profilazione?: boolean
        }
        Returns: number
      }
      ricalcola_fido_teorico: { Args: never; Returns: string }
      ricalcola_fido_teorico_avvia: { Args: never; Returns: undefined }
      ricalcola_fido_teorico_blocco: {
        Args: { _dimensione?: number; _dopo_id: string }
        Returns: string
      }
      ricalcola_fido_teorico_finalizza: { Args: never; Returns: string }
      ricalcola_in_gestione_legale: {
        Args: { _cliente_id: string }
        Returns: undefined
      }
      rimuovi_orfani_scadenze: {
        Args: { _importazione_id: string }
        Returns: number
      }
      scarta_righe_import: {
        Args: { _riga_ids: string[] }
        Returns: {
          scartate: number
        }[]
      }
      storage_path_cliente_id: { Args: { _name: string }; Returns: string }
      store_id_effettivo: { Args: { _store_id: string }; Returns: string }
      trasforma_preventivo_in_ordine: {
        Args: { p_preventivo_id: string; p_selezione: Json }
        Returns: string
      }
      trova_corrispondenze_soggetto: {
        Args: {
          _codice_fiscale?: string
          _cognome?: string
          _email?: string
          _nome?: string
          _partita_iva?: string
          _ragione_sociale?: string
        }
        Returns: {
          contatto_id: string
          criterio: string
          etichetta: string
          id: string
          priorita: number
          privacy_firmata: boolean
          tipo: string
        }[]
      }
      user_can_access_cliente: {
        Args: { _cliente_id: string }
        Returns: boolean
      }
      user_can_access_richiesta_fido: {
        Args: { _id: string }
        Returns: boolean
      }
      user_can_access_richiesta_interna: {
        Args: { _richiesta_id: string }
        Returns: boolean
      }
      user_can_write_cliente: {
        Args: { _cliente_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "store_manager"
        | "approvatore_liv1"
        | "approvatore_liv2"
        | "approvatore_liv3"
        | "amministratore"
        | "amministrazione"
        | "direzione"
        | "agente"
        | "richiedente"
        | "approvatore_richieste_liv1"
        | "approvatore_richieste_liv2"
        | "gestore_richieste"
        | "esecutore_richieste"
        | "marketing"
      categoria_allegato:
        | "capitolato"
        | "disegni"
        | "scheda_tecnica"
        | "certificazioni"
        | "foto_cantiere"
        | "documenti_commerciali"
        | "altro"
      categoria_allegato_articolo:
        | "scheda_tecnica"
        | "scheda_sicurezza"
        | "certificazione_ce_dop"
        | "certificazione_antincendio"
        | "certificazione_acustica"
        | "dichiarazione_conformita"
        | "voce_capitolato"
        | "manuale_posa"
        | "certificato_ambientale"
        | "immagine_prodotto"
        | "disegno_tecnico"
        | "altro"
      esito_approvazione: "approvata" | "rifiutata"
      eventi_partecipante_stato:
        | "atteso"
        | "confermato"
        | "presentato"
        | "no_show"
      fascia_listino: "A" | "B" | "C" | "SOCI"
      kit_famiglia:
        | "PARETE"
        | "CONTROPARETE"
        | "CTS_CARTONGESSO"
        | "CTS_MODULARE"
        | "VELETTA"
        | "ALTRO"
      lead_fonte: "web" | "hubspot" | "manuale" | "fiera" | "evento" | "altro"
      lead_priorita: "alta" | "media" | "bassa"
      lead_richiesta_stato: "aperta" | "in_lavorazione" | "evasa" | "respinta"
      lead_richiesta_tipo:
        | "preventivo"
        | "ristrutturazione"
        | "info_tecnica"
        | "info_commerciale"
      lead_stato:
        | "nuovo"
        | "assegnato"
        | "in_lavorazione"
        | "qualificato"
        | "convertito"
        | "perso"
      lead_tipo: "potenziale_cliente" | "richiesta_specifica"
      stato_articolo: "attivo" | "potenziale"
      stato_importazione:
        | "in_elaborazione"
        | "completata"
        | "completata_con_errori"
        | "fallita"
      stato_messaggio_wa:
        | "in_coda"
        | "inviato"
        | "consegnato"
        | "letto"
        | "fallito"
      stato_opportunita:
        | "aperta"
        | "in_lavorazione"
        | "preventivo"
        | "vinta"
        | "persa"
      stato_polizza:
        | "attiva"
        | "sospesa"
        | "scaduta"
        | "sinistro_aperto"
        | "sinistro_chiuso"
      stato_pratica_legale:
        | "aperta"
        | "in_corso"
        | "decreto_ottenuto"
        | "pignoramento_eseguito"
        | "pignoramento_negativo"
        | "chiusa_pagamento"
        | "chiusa_perdita"
        | "sospesa"
      stato_preventivo: "bozza" | "inviato" | "confermato"
      stato_richiesta:
        | "bozza"
        | "in_approvazione"
        | "approvata"
        | "rifiutata"
        | "annullata"
        | "in_attesa_liv1"
        | "in_attesa_liv2"
        | "in_attesa_liv3"
        | "integrazioni_richieste"
      stato_sollecito:
        | "inviato"
        | "in_attesa_risposta"
        | "risposto"
        | "ignorato"
        | "risolto"
      tipo_area:
        | "recupero_crediti"
        | "commerciale"
        | "amministrazione"
        | "magazzino"
      tipo_attivita_commerciale:
        | "appuntamento"
        | "visita"
        | "chiamata"
        | "email"
        | "preventivo_inviato"
        | "nota"
        | "altro"
      tipo_canale: "area" | "store" | "diretto"
      tipo_doc_preventivo:
        | "PREVENTIVO"
        | "PROPOSTA_RAPIDA"
        | "LISTA_MATERIALI"
        | "LISTA_MAT_FORNITORE"
      tipo_documento: "preventivo" | "ordine"
      tipo_driver: "CONSUMO" | "PASSO" | "LATI" | "INCIDENZA_FISSA"
      tipo_opportunita: "vendita" | "fornitura" | "preventivo" | "altro"
      tipo_pratica_legale:
        | "decreto_ingiuntivo"
        | "pignoramento"
        | "precetto"
        | "azione_legale_generica"
        | "messa_a_perdita"
        | "concordato"
        | "fallimento"
        | "altro"
      tipo_reminder:
        | "scadenza_insoluto"
        | "sollecito_programmato"
        | "revisione_pratica_legale"
        | "rinnovo_assicurazione"
        | "custom"
      tipo_richiesta:
        | "nuovo"
        | "aumento"
        | "diminuzione"
        | "rinnovo"
        | "nuovo_fido"
      tipo_riga_preventivo:
        | "da_kit"
        | "articolo_singolo"
        | "manuale"
        | "sotto_totale"
        | "nota"
        | "separatore"
      tipo_sollecito:
        | "interno"
        | "email"
        | "telefono"
        | "raccomandata"
        | "avvocato"
        | "legale"
        | "altro"
      tipo_variazione_fido:
        | "nuovo"
        | "aumento"
        | "diminuzione"
        | "rinnovo"
        | "sospensione"
        | "revoca"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "store_manager",
        "approvatore_liv1",
        "approvatore_liv2",
        "approvatore_liv3",
        "amministratore",
        "amministrazione",
        "direzione",
        "agente",
        "richiedente",
        "approvatore_richieste_liv1",
        "approvatore_richieste_liv2",
        "gestore_richieste",
        "esecutore_richieste",
        "marketing",
      ],
      categoria_allegato: [
        "capitolato",
        "disegni",
        "scheda_tecnica",
        "certificazioni",
        "foto_cantiere",
        "documenti_commerciali",
        "altro",
      ],
      categoria_allegato_articolo: [
        "scheda_tecnica",
        "scheda_sicurezza",
        "certificazione_ce_dop",
        "certificazione_antincendio",
        "certificazione_acustica",
        "dichiarazione_conformita",
        "voce_capitolato",
        "manuale_posa",
        "certificato_ambientale",
        "immagine_prodotto",
        "disegno_tecnico",
        "altro",
      ],
      esito_approvazione: ["approvata", "rifiutata"],
      eventi_partecipante_stato: [
        "atteso",
        "confermato",
        "presentato",
        "no_show",
      ],
      fascia_listino: ["A", "B", "C", "SOCI"],
      kit_famiglia: [
        "PARETE",
        "CONTROPARETE",
        "CTS_CARTONGESSO",
        "CTS_MODULARE",
        "VELETTA",
        "ALTRO",
      ],
      lead_fonte: ["web", "hubspot", "manuale", "fiera", "evento", "altro"],
      lead_priorita: ["alta", "media", "bassa"],
      lead_richiesta_stato: ["aperta", "in_lavorazione", "evasa", "respinta"],
      lead_richiesta_tipo: [
        "preventivo",
        "ristrutturazione",
        "info_tecnica",
        "info_commerciale",
      ],
      lead_stato: [
        "nuovo",
        "assegnato",
        "in_lavorazione",
        "qualificato",
        "convertito",
        "perso",
      ],
      lead_tipo: ["potenziale_cliente", "richiesta_specifica"],
      stato_articolo: ["attivo", "potenziale"],
      stato_importazione: [
        "in_elaborazione",
        "completata",
        "completata_con_errori",
        "fallita",
      ],
      stato_messaggio_wa: [
        "in_coda",
        "inviato",
        "consegnato",
        "letto",
        "fallito",
      ],
      stato_opportunita: [
        "aperta",
        "in_lavorazione",
        "preventivo",
        "vinta",
        "persa",
      ],
      stato_polizza: [
        "attiva",
        "sospesa",
        "scaduta",
        "sinistro_aperto",
        "sinistro_chiuso",
      ],
      stato_pratica_legale: [
        "aperta",
        "in_corso",
        "decreto_ottenuto",
        "pignoramento_eseguito",
        "pignoramento_negativo",
        "chiusa_pagamento",
        "chiusa_perdita",
        "sospesa",
      ],
      stato_preventivo: ["bozza", "inviato", "confermato"],
      stato_richiesta: [
        "bozza",
        "in_approvazione",
        "approvata",
        "rifiutata",
        "annullata",
        "in_attesa_liv1",
        "in_attesa_liv2",
        "in_attesa_liv3",
        "integrazioni_richieste",
      ],
      stato_sollecito: [
        "inviato",
        "in_attesa_risposta",
        "risposto",
        "ignorato",
        "risolto",
      ],
      tipo_area: [
        "recupero_crediti",
        "commerciale",
        "amministrazione",
        "magazzino",
      ],
      tipo_attivita_commerciale: [
        "appuntamento",
        "visita",
        "chiamata",
        "email",
        "preventivo_inviato",
        "nota",
        "altro",
      ],
      tipo_canale: ["area", "store", "diretto"],
      tipo_doc_preventivo: [
        "PREVENTIVO",
        "PROPOSTA_RAPIDA",
        "LISTA_MATERIALI",
        "LISTA_MAT_FORNITORE",
      ],
      tipo_documento: ["preventivo", "ordine"],
      tipo_driver: ["CONSUMO", "PASSO", "LATI", "INCIDENZA_FISSA"],
      tipo_opportunita: ["vendita", "fornitura", "preventivo", "altro"],
      tipo_pratica_legale: [
        "decreto_ingiuntivo",
        "pignoramento",
        "precetto",
        "azione_legale_generica",
        "messa_a_perdita",
        "concordato",
        "fallimento",
        "altro",
      ],
      tipo_reminder: [
        "scadenza_insoluto",
        "sollecito_programmato",
        "revisione_pratica_legale",
        "rinnovo_assicurazione",
        "custom",
      ],
      tipo_richiesta: [
        "nuovo",
        "aumento",
        "diminuzione",
        "rinnovo",
        "nuovo_fido",
      ],
      tipo_riga_preventivo: [
        "da_kit",
        "articolo_singolo",
        "manuale",
        "sotto_totale",
        "nota",
        "separatore",
      ],
      tipo_sollecito: [
        "interno",
        "email",
        "telefono",
        "raccomandata",
        "avvocato",
        "legale",
        "altro",
      ],
      tipo_variazione_fido: [
        "nuovo",
        "aumento",
        "diminuzione",
        "rinnovo",
        "sospensione",
        "revoca",
      ],
    },
  },
} as const
