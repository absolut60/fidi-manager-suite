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
      assicurazioni_credito: {
        Row: {
          assicuratore: string
          cliente_id: string
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
      cantieri: {
        Row: {
          attivo: boolean
          cap: string | null
          citta: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          data_fine_prevista: string | null
          data_inizio: string | null
          descrizione: string | null
          id: string
          indirizzo: string | null
          nome: string
          note: string | null
          provincia: string | null
          referente: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data_fine_prevista?: string | null
          data_inizio?: string | null
          descrizione?: string | null
          id?: string
          indirizzo?: string | null
          nome: string
          note?: string | null
          provincia?: string | null
          referente?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data_fine_prevista?: string | null
          data_inizio?: string | null
          descrizione?: string | null
          id?: string
          indirizzo?: string | null
          nome?: string
          note?: string | null
          provincia?: string | null
          referente?: string | null
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
      contatti: {
        Row: {
          cellulare: string | null
          cliente_id: string
          codice_fiscale: string | null
          cognome: string | null
          consenso_marketing_diretto: boolean
          consenso_marketing_media: boolean
          consenso_profilazione: boolean
          created_at: string
          data_firma: string | null
          data_nascita: string | null
          email: string | null
          firma_url: string | null
          id: string
          luogo_nascita: string | null
          nome: string
          pdf_privacy_path: string | null
          pdf_privacy_url: string | null
          principale: boolean
          privacy_firmata: boolean
          privacy_token: string | null
          privacy_token_expires_at: string | null
          residenza: string | null
          ruolo: string | null
          telefono: string | null
          updated_at: string
          whatsapp: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          cellulare?: string | null
          cliente_id: string
          codice_fiscale?: string | null
          cognome?: string | null
          consenso_marketing_diretto?: boolean
          consenso_marketing_media?: boolean
          consenso_profilazione?: boolean
          created_at?: string
          data_firma?: string | null
          data_nascita?: string | null
          email?: string | null
          firma_url?: string | null
          id?: string
          luogo_nascita?: string | null
          nome: string
          pdf_privacy_path?: string | null
          pdf_privacy_url?: string | null
          principale?: boolean
          privacy_firmata?: boolean
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          residenza?: string | null
          ruolo?: string | null
          telefono?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          cellulare?: string | null
          cliente_id?: string
          codice_fiscale?: string | null
          cognome?: string | null
          consenso_marketing_diretto?: boolean
          consenso_marketing_media?: boolean
          consenso_profilazione?: boolean
          created_at?: string
          data_firma?: string | null
          data_nascita?: string | null
          email?: string | null
          firma_url?: string | null
          id?: string
          luogo_nascita?: string | null
          nome?: string
          pdf_privacy_path?: string | null
          pdf_privacy_url?: string | null
          principale?: boolean
          privacy_firmata?: boolean
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          residenza?: string | null
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
      importazioni: {
        Row: {
          chunks_completati: number | null
          chunks_totali: number | null
          codici_mancanti: Json | null
          completata_at: string | null
          created_at: string
          dimensione_bytes: number | null
          eseguita_da: string | null
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
        Relationships: []
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
      profili: {
        Row: {
          attivo: boolean
          cognome: string | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          cognome?: string | null
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          cognome?: string | null
          created_at?: string
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
          id: string
          indirizzo: string | null
          insegna: string | null
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
          id?: string
          indirizzo?: string | null
          insegna?: string | null
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
          id?: string
          indirizzo?: string | null
          insegna?: string | null
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
      bulk_update_clienti_bfa: { Args: { _payloads: Json }; Returns: number }
      calcola_livello_fido: { Args: { _importo: number }; Returns: number }
      calcola_scaduto: { Args: { _ant: number; _ssa: number }; Returns: number }
      effective_store_filter: { Args: { _requested: string }; Returns: string }
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
      get_scadenziario_ids: {
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
      get_scadenziario_lista_paginata: {
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
      get_scadenziario_totali: {
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
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
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
      livello_approvatore: { Args: { _user_id: string }; Returns: number }
      marca_comunicazioni_lette: {
        Args: { _richiesta_id: string }
        Returns: undefined
      }
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
      rimuovi_orfani_scadenze: {
        Args: { _importazione_id: string }
        Returns: number
      }
      storage_path_cliente_id: { Args: { _name: string }; Returns: string }
      user_can_access_cliente: {
        Args: { _cliente_id: string }
        Returns: boolean
      }
      user_can_access_richiesta_fido: {
        Args: { _id: string }
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
      esito_approvazione: "approvata" | "rifiutata"
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
      ],
      esito_approvazione: ["approvata", "rifiutata"],
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
