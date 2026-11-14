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
      access_codes: {
        Row: {
          code: string
          created_at: string
        }
        Insert: {
          code: string
          created_at?: string
        }
        Update: {
          code?: string
          created_at?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          at: string
          attempted_input: string | null
          detail: string
          device: string | null
          device_id: string | null
          id: string
          kind: string
        }
        Insert: {
          at?: string
          attempted_input?: string | null
          detail?: string
          device?: string | null
          device_id?: string | null
          id?: string
          kind: string
        }
        Update: {
          at?: string
          attempted_input?: string | null
          detail?: string
          device?: string | null
          device_id?: string | null
          id?: string
          kind?: string
        }
        Relationships: []
      }
      banned_devices: {
        Row: {
          created_at: string
          device_id: string
          note: string
        }
        Insert: {
          created_at?: string
          device_id: string
          note?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          note?: string
        }
        Relationships: []
      }
      banned_ips: {
        Row: {
          created_at: string
          ip: string
          note: string
        }
        Insert: {
          created_at?: string
          ip: string
          note?: string
        }
        Update: {
          created_at?: string
          ip?: string
          note?: string
        }
        Relationships: []
      }
      device_failures: {
        Row: {
          at: string
          device_id: string
          id: number
        }
        Insert: {
          at?: string
          device_id: string
          id?: never
        }
        Update: {
          at?: string
          device_id?: string
          id?: never
        }
        Relationships: []
      }
      friend_passwords: {
        Row: {
          active_session: string | null
          admin_note: string
          browser_version: string | null
          cpu_cores: number | null
          created_at: string
          current_game: string | null
          device: string | null
          device_id: string | null
          expires_at: string | null
          game_started_at: string | null
          id: string
          ip: string | null
          last_login: string | null
          last_seen: string | null
          location: string | null
          memory_gb: number | null
          message: string | null
          name: string
          password: string
          paused: boolean
          play_seconds: Json
          screen: string | null
          total_play_seconds: number
          user_agent: string | null
        }
        Insert: {
          active_session?: string | null
          admin_note?: string
          browser_version?: string | null
          cpu_cores?: number | null
          created_at?: string
          current_game?: string | null
          device?: string | null
          device_id?: string | null
          expires_at?: string | null
          game_started_at?: string | null
          id?: string
          ip?: string | null
          last_login?: string | null
          last_seen?: string | null
          location?: string | null
          memory_gb?: number | null
          message?: string | null
          name?: string
          password: string
          paused?: boolean
          play_seconds?: Json
          screen?: string | null
          total_play_seconds?: number
          user_agent?: string | null
        }
        Update: {
          active_session?: string | null
          admin_note?: string
          browser_version?: string | null
          cpu_cores?: number | null
          created_at?: string
          current_game?: string | null
          device?: string | null
          device_id?: string | null
          expires_at?: string | null
          game_started_at?: string | null
          id?: string
          ip?: string | null
          last_login?: string | null
          last_seen?: string | null
          location?: string | null
          memory_gb?: number | null
          message?: string | null
          name?: string
          password?: string
          paused?: boolean
          play_seconds?: Json
          screen?: string | null
          total_play_seconds?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      player_moderation: {
        Row: { id: string; friend_id: string | null; device_id: string | null; reason: string; expires_at: string | null; lifted_at: string | null; actor_role: string; created_at: string }
        Insert: { id?: string; friend_id?: string | null; device_id?: string | null; reason?: string; expires_at?: string | null; lifted_at?: string | null; actor_role?: string; created_at?: string }
        Update: { id?: string; friend_id?: string | null; device_id?: string | null; reason?: string; expires_at?: string | null; lifted_at?: string | null; actor_role?: string; created_at?: string }
        Relationships: []
      }
      player_appeals: {
        Row: { id: string; friend_id: string | null; device_id: string | null; player_name: string; reason: string; status: string; admin_response: string | null; created_at: string; reviewed_at: string | null; reviewed_by: string | null }
        Insert: { id?: string; friend_id?: string | null; device_id?: string | null; player_name?: string; reason: string; status?: string; admin_response?: string | null; created_at?: string; reviewed_at?: string | null; reviewed_by?: string | null }
        Update: { id?: string; friend_id?: string | null; device_id?: string | null; player_name?: string; reason?: string; status?: string; admin_response?: string | null; created_at?: string; reviewed_at?: string | null; reviewed_by?: string | null }
        Relationships: []
      }
      player_message_history: {
        Row: { id: string; target_type: string; target_id: string | null; target_label: string; message: string; recipient_count: number; actor_role: string; created_at: string }
        Insert: { id?: string; target_type: string; target_id?: string | null; target_label?: string; message: string; recipient_count?: number; actor_role?: string; created_at?: string }
        Update: { id?: string; target_type?: string; target_id?: string | null; target_label?: string; message?: string; recipient_count?: number; actor_role?: string; created_at?: string }
        Relationships: []
      }
      site_settings: {
        Row: {
          emergency_level: number
          emergency_notice: string
          emergency_updated_at: string
          hidden_games: string[]
          id: number
          kick_all_at: string | null
          lockdown: boolean
        }
        Insert: {
          emergency_level?: number
          emergency_notice?: string
          emergency_updated_at?: string
          hidden_games?: string[]
          id?: number
          kick_all_at?: string | null
          lockdown?: boolean
        }
        Update: {
          emergency_level?: number
          emergency_notice?: string
          emergency_updated_at?: string
          hidden_games?: string[]
          id?: number
          kick_all_at?: string | null
          lockdown?: boolean
        }
        Relationships: []
      }
      admin_security: {
        Row: { id: number; totp_secret_ciphertext: string | null; totp_enabled: boolean; recovery_code_hashes: string[]; updated_at: string }
        Insert: { id: number; totp_secret_ciphertext?: string | null; totp_enabled?: boolean; recovery_code_hashes?: string[]; updated_at?: string }
        Update: { id?: number; totp_secret_ciphertext?: string | null; totp_enabled?: boolean; recovery_code_hashes?: string[]; updated_at?: string }
        Relationships: []
      }
      admin_sessions: {
        Row: { id: string; session_token_hash: string; role: string; device_id: string | null; device: string | null; ip: string | null; created_at: string; last_seen_at: string; expires_at: string; revoked_at: string | null }
        Insert: { id?: string; session_token_hash: string; role?: string; device_id?: string | null; device?: string | null; ip?: string | null; created_at?: string; last_seen_at?: string; expires_at: string; revoked_at?: string | null }
        Update: { id?: string; session_token_hash?: string; role?: string; device_id?: string | null; device?: string | null; ip?: string | null; created_at?: string; last_seen_at?: string; expires_at?: string; revoked_at?: string | null }
        Relationships: []
      }
      admin_audit_log: {
        Row: { id: number; actor_session_id: string | null; actor_role: string; action: string; detail: string; device: string | null; ip: string | null; created_at: string }
        Insert: { id?: number; actor_session_id?: string | null; actor_role?: string; action: string; detail?: string; device?: string | null; ip?: string | null; created_at?: string }
        Update: { id?: number; actor_session_id?: string | null; actor_role?: string; action?: string; detail?: string; device?: string | null; ip?: string | null; created_at?: string }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      evict_gate_users: { Args: { p_lockdown?: boolean }; Returns: undefined }
      record_device_failure: { Args: { p_device_id: string }; Returns: boolean }
      consume_admin_recovery_code: { Args: { p_code_hash: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
