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
          citta: string | null
          codice_assegnato: string | null
          codice_fiscale: string | null
          codice_gestionale: string | null
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
          indirizzo: string | null
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
          tipo_soggetto: string | null
          totale_rischio: number | null
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
          citta?: string | null
          codice_assegnato?: string | null
          codice_fiscale?: string | null
          codice_gestionale?: string | null
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
          indirizzo?: string | null
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
          tipo_soggetto?: string | null
          totale_rischio?: number | null
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
          citta?: string | null
          codice_assegnato?: string | null
          codice_fiscale?: string | null
          codice_gestionale?: string | null
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
          indirizzo?: string | null
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
          tipo_soggetto?: string | null
          totale_rischio?: number | null
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
          cognome: string | null
          created_at: string
          data_firma: string | null
          email: string | null
          firma_url: string | null
          id: string
          nome: string
          pdf_privacy_path: string | null
          pdf_privacy_url: string | null
          principale: boolean
          privacy_firmata: boolean
          privacy_token: string | null
          privacy_token_expires_at: string | null
          ruolo: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          cellulare?: string | null
          cliente_id: string
          cognome?: string | null
          created_at?: string
          data_firma?: string | null
          email?: string | null
          firma_url?: string | null
          id?: string
          nome: string
          pdf_privacy_path?: string | null
          pdf_privacy_url?: string | null
          principale?: boolean
          privacy_firmata?: boolean
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          ruolo?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          cellulare?: string | null
          cliente_id?: string
          cognome?: string | null
          created_at?: string
          data_firma?: string | null
          email?: string | null
          firma_url?: string | null
          id?: string
          nome?: string
          pdf_privacy_path?: string | null
          pdf_privacy_url?: string | null
          principale?: boolean
          privacy_firmata?: boolean
          privacy_token?: string | null
          privacy_token_expires_at?: string | null
          ruolo?: string | null
          telefono?: string | null
          updated_at?: string
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
          completata_at: string | null
          created_at: string
          dimensione_bytes: number | null
          eseguita_da: string | null
          file_path: string | null
          fonte: string | null
          id: string
          log_errori: Json | null
          nome_file: string
          righe_aggiornate: number | null
          righe_create: number | null
          righe_elaborate: number | null
          righe_errore: number | null
          righe_totali: number | null
          stato: Database["public"]["Enums"]["stato_importazione"]
        }
        Insert: {
          completata_at?: string | null
          created_at?: string
          dimensione_bytes?: number | null
          eseguita_da?: string | null
          file_path?: string | null
          fonte?: string | null
          id?: string
          log_errori?: Json | null
          nome_file: string
          righe_aggiornate?: number | null
          righe_create?: number | null
          righe_elaborate?: number | null
          righe_errore?: number | null
          righe_totali?: number | null
          stato?: Database["public"]["Enums"]["stato_importazione"]
        }
        Update: {
          completata_at?: string | null
          created_at?: string
          dimensione_bytes?: number | null
          eseguita_da?: string | null
          file_path?: string | null
          fonte?: string | null
          id?: string
          log_errori?: Json | null
          nome_file?: string
          righe_aggiornate?: number | null
          righe_create?: number | null
          righe_elaborate?: number | null
          righe_errore?: number | null
          righe_totali?: number | null
          stato?: Database["public"]["Enums"]["stato_importazione"]
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
          data_invio: string | null
          data_scadenza: string | null
          durata_mesi: number
          id: string
          importo_approvato: number | null
          importo_richiesto: number
          livello_corrente: number
          livello_richiesto: number
          motivazione: string | null
          note: string | null
          stato: Database["public"]["Enums"]["stato_richiesta"]
          store_id: string | null
          tipo: Database["public"]["Enums"]["tipo_richiesta"]
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data_chiusura?: string | null
          data_invio?: string | null
          data_scadenza?: string | null
          durata_mesi?: number
          id?: string
          importo_approvato?: number | null
          importo_richiesto: number
          livello_corrente?: number
          livello_richiesto?: number
          motivazione?: string | null
          note?: string | null
          stato?: Database["public"]["Enums"]["stato_richiesta"]
          store_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_richiesta"]
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data_chiusura?: string | null
          data_invio?: string | null
          data_scadenza?: string | null
          durata_mesi?: number
          id?: string
          importo_approvato?: number | null
          importo_richiesto?: number
          livello_corrente?: number
          livello_richiesto?: number
          motivazione?: string | null
          note?: string | null
          stato?: Database["public"]["Enums"]["stato_richiesta"]
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
          citta: string | null
          codice: string
          created_at: string
          id: string
          indirizzo: string | null
          nome: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          citta?: string | null
          codice: string
          created_at?: string
          id?: string
          indirizzo?: string | null
          nome: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          citta?: string | null
          codice?: string
          created_at?: string
          id?: string
          indirizzo?: string | null
          nome?: string
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
    }
    Enums: {
      app_role:
        | "store_manager"
        | "approvatore_liv1"
        | "approvatore_liv2"
        | "approvatore_liv3"
        | "amministratore"
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
      tipo_richiesta: "nuovo" | "aumento" | "diminuzione" | "rinnovo"
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
      tipo_richiesta: ["nuovo", "aumento", "diminuzione", "rinnovo"],
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
