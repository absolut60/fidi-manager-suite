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
      anomalie_import: {
        Row: {
          campo: string
          cliente_id: string | null
          codice_gestionale: string
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
          codice_gestionale: string
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
          codice_gestionale?: string
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
          note: string | null
          operatore_id: string | null
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
          note?: string | null
          operatore_id?: string | null
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
          note?: string | null
          operatore_id?: string | null
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
          note: string | null
          operatore_id: string | null
          preferenza_indirizzo: string
          saltati: number
          stato: string
          template_id: string | null
          totale_destinatari: number
          updated_at: string
        }
        Insert: {
          completata_at?: string | null
          created_at?: string
          falliti?: number
          id?: string
          inviati?: number
          note?: string | null
          operatore_id?: string | null
          preferenza_indirizzo?: string
          saltati?: number
          stato?: string
          template_id?: string | null
          totale_destinatari?: number
          updated_at?: string
        }
        Update: {
          completata_at?: string | null
          created_at?: string
          falliti?: number
          id?: string
          inviati?: number
          note?: string | null
          operatore_id?: string | null
          preferenza_indirizzo?: string
          saltati?: number
          stato?: string
          template_id?: string | null
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
          richiesta_id: string
          testo: string
        }
        Insert: {
          autore_id: string
          created_at?: string
          destinatario: string
          id?: string
          letto?: boolean
          richiesta_id: string
          testo: string
        }
        Update: {
          autore_id?: string
          created_at?: string
          destinatario?: string
          id?: string
          letto?: boolean
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
          cliente_id: string
          created_at: string
          created_by: string | null
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
          cliente_id: string
          created_at?: string
          created_by?: string | null
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
          cliente_id?: string
          created_at?: string
          created_by?: string | null
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
          data_scadenza: string | null
          descrizione_pagamento: string | null
          dilazione_effettiva: number | null
          dilazione_teorica: number | null
          fido_euro: number | null
          giorni_ritardo: number | null
          id: string
          importato_da: string | null
          importo_documento: number | null
          importo_netto_prev: number | null
          importo_originario: number | null
          importo_ritardo: number | null
          importo_scadenza: number | null
          in_legale: boolean | null
          numero_documento: string | null
          sede: number | null
          sezionale: string | null
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
          data_scadenza?: string | null
          descrizione_pagamento?: string | null
          dilazione_effettiva?: number | null
          dilazione_teorica?: number | null
          fido_euro?: number | null
          giorni_ritardo?: number | null
          id?: string
          importato_da?: string | null
          importo_documento?: number | null
          importo_netto_prev?: number | null
          importo_originario?: number | null
          importo_ritardo?: number | null
          importo_scadenza?: number | null
          in_legale?: boolean | null
          numero_documento?: string | null
          sede?: number | null
          sezionale?: string | null
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
          data_scadenza?: string | null
          descrizione_pagamento?: string | null
          dilazione_effettiva?: number | null
          dilazione_teorica?: number | null
          fido_euro?: number | null
          giorni_ritardo?: number | null
          id?: string
          importato_da?: string | null
          importo_documento?: number | null
          importo_netto_prev?: number | null
          importo_originario?: number | null
          importo_ritardo?: number | null
          importo_scadenza?: number | null
          in_legale?: boolean | null
          numero_documento?: string | null
          sede?: number | null
          sezionale?: string | null
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
      calcola_livello_fido: { Args: { _importo: number }; Returns: number }
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
      get_promemoria_clienti_aggregato: {
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
      get_recupero_clienti_aggregato: {
        Args: {
          _data_a?: string
          _data_da?: string
          _esiti?: string[]
          _operatore_id?: string
          _search?: string
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
          store_id: string
          store_nome: string
          totale_scaduto: number
          ultima_fatta_data: string
          ultima_fatta_tipo: string
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
      storage_path_cliente_id: { Args: { _name: string }; Returns: string }
      user_can_access_cliente: {
        Args: { _cliente_id: string }
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
