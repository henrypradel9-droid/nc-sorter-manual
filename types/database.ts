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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          approved_role: Database["public"]["Enums"]["app_role"] | null
          auth_user_id: string
          created_at: string
          email: string
          id: string
          name: string
          rejected_at: string | null
          rejected_by_user_id: string | null
          rejection_reason: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          approved_role?: Database["public"]["Enums"]["app_role"] | null
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          rejection_reason?: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          approved_role?: Database["public"]["Enums"]["app_role"] | null
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          rejected_at?: string | null
          rejected_by_user_id?: string | null
          rejection_reason?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_requests_rejected_by_user_id_fkey"
            columns: ["rejected_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_follow_ups: {
        Row: {
          alert_id: string
          created_at: string
          id: string
          note: string
          responsible_user_id: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          id?: string
          note: string
          responsible_user_id?: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          id?: string
          note?: string
          responsible_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_follow_ups_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_follow_ups_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_occurrence: string | null
          most_frequent_error: string | null
          occurrence_count: number
          occurrence_user: string
          period_end: string
          period_start: string
          shifts: string[]
          status: Database["public"]["Enums"]["alert_status"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_occurrence?: string | null
          most_frequent_error?: string | null
          occurrence_count: number
          occurrence_user: string
          period_end: string
          period_start: string
          shifts?: string[]
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_occurrence?: string | null
          most_frequent_error?: string | null
          occurrence_count?: number
          occurrence_user?: string
          period_end?: string
          period_start?: string
          shifts?: string[]
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canalizacoes: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          normalized_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          normalized_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          normalized_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      error_types: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          name: string
          normalized_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name: string
          normalized_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          normalized_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      occurrences: {
        Row: {
          canalizacao_id: string
          created_at: string
          error_type_id: string
          hu: string
          id: string
          observations: string
          occurred_at: string
          occurrence_user: string
          occurrence_user_normalized: string | null
          package_id: string
          package_quantity: number
          registered_by_user_id: string
          shift_id: string
          status: Database["public"]["Enums"]["occurrence_status"]
          tt: string
          updated_at: string
          version: number
        }
        Insert: {
          canalizacao_id: string
          created_at?: string
          error_type_id: string
          hu?: string
          id: string
          observations?: string
          occurred_at: string
          occurrence_user: string
          occurrence_user_normalized?: string | null
          package_id?: string
          package_quantity: number
          registered_by_user_id?: string
          shift_id: string
          status: Database["public"]["Enums"]["occurrence_status"]
          tt?: string
          updated_at?: string
          version?: number
        }
        Update: {
          canalizacao_id?: string
          created_at?: string
          error_type_id?: string
          hu?: string
          id?: string
          observations?: string
          occurred_at?: string
          occurrence_user?: string
          occurrence_user_normalized?: string | null
          package_id?: string
          package_quantity?: number
          registered_by_user_id?: string
          shift_id?: string
          status?: Database["public"]["Enums"]["occurrence_status"]
          tt?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_canalizacao_id_fkey"
            columns: ["canalizacao_id"]
            isOneToOne: false
            referencedRelation: "canalizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_error_type_id_fkey"
            columns: ["error_type_id"]
            isOneToOne: false
            referencedRelation: "error_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_registered_by_user_id_fkey"
            columns: ["registered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          active: boolean
          created_at: string
          description: string
          end_time: string | null
          id: string
          name: string
          normalized_name: string | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          end_time?: string | null
          id?: string
          name: string
          normalized_name?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          end_time?: string | null
          id?: string
          name?: string
          normalized_name?: string | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: boolean
          operational_start_hour: number
          recurrence_limit: number
          timezone: string
          updated_at: string
        }
        Insert: {
          id?: boolean
          operational_start_hour?: number
          recurrence_limit?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          id?: boolean
          operational_start_hour?: number
          recurrence_limit?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard: { Args: { filters?: Json }; Returns: Json }
      dashboard_v2: {
        Args: { bucket_by?: string; filters?: Json }
        Returns: Json
      }
      decide_access_request: {
        Args: {
          approved_role?: Database["public"]["Enums"]["app_role"]
          decision: string
          reason?: string
          request_id: string
        }
        Returns: Json
      }
      export_occurrences: { Args: { filters?: Json }; Returns: Json }
      filtered_occurrences: {
        Args: { filters?: Json }
        Returns: {
          canalizacao_id: string
          created_at: string
          error_type_id: string
          hu: string
          id: string
          observations: string
          occurred_at: string
          occurrence_user: string
          occurrence_user_normalized: string | null
          package_id: string
          package_quantity: number
          registered_by_user_id: string
          shift_id: string
          status: Database["public"]["Enums"]["occurrence_status"]
          tt: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "occurrences"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      normalize_user: { Args: { value: string }; Returns: string }
      suggest_users: {
        Args: { prefix: string }
        Returns: {
          name: string
        }[]
      }
    }
    Enums: {
      alert_status: "NOVO" | "VISUALIZADO" | "ACOMPANHAMENTO_REALIZADO"
      app_role: "ADMIN" | "LIDER" | "OPERADOR"
      occurrence_status: "PENDENTE" | "EM_ANDAMENTO" | "RESOLVIDO"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      alert_status: ["NOVO", "VISUALIZADO", "ACOMPANHAMENTO_REALIZADO"],
      app_role: ["ADMIN", "LIDER", "OPERADOR"],
      occurrence_status: ["PENDENTE", "EM_ANDAMENTO", "RESOLVIDO"],
    },
  },
} as const

