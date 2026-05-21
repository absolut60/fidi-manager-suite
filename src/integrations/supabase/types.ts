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
      clienti: {
        Row: {
          attivo: boolean
          cap: string | null
          citta: string | null
          codice_fiscale: string | null
          created_at: string
          created_by: string | null
          data_firma: string | null
          email: string | null
          firma_url: string | null
          id: string
          indirizzo: string | null
          note: string | null
          partita_iva: string | null
          privacy_firmata: boolean
          provincia: string | null
          ragione_sociale: string
          store_id: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          created_by?: string | null
          data_firma?: string | null
          email?: string | null
          firma_url?: string | null
          id?: string
          indirizzo?: string | null
          note?: string | null
          partita_iva?: string | null
          privacy_firmata?: boolean
          provincia?: string | null
          ragione_sociale: string
          store_id?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          created_by?: string | null
          data_firma?: string | null
          email?: string | null
          firma_url?: string | null
          id?: string
          indirizzo?: string | null
          note?: string | null
          partita_iva?: string | null
          privacy_firmata?: boolean
          provincia?: string | null
          ragione_sociale?: string
          store_id?: string | null
          telefono?: string | null
          updated_at?: string
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
      contatti: {
        Row: {
          cellulare: string | null
          cliente_id: string
          cognome: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          principale: boolean
          ruolo: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          cellulare?: string | null
          cliente_id: string
          cognome?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          principale?: boolean
          ruolo?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          cellulare?: string | null
          cliente_id?: string
          cognome?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          principale?: boolean
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
      [_ in never]: never
    }
    Functions: {
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
    },
  },
} as const
