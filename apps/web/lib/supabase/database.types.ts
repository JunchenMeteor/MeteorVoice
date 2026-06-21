/**
 * Supabase database types generated from committed migrations.
 * 从已提交迁移生成的 Supabase 数据库类型。
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accent_profiles: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          name: string
          region: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          name: string
          region?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          name?: string
          region?: string | null
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          bucket_key: string
          request_count: number
          reset_at: string
          updated_at: string
        }
        Insert: {
          bucket_key: string
          request_count: number
          reset_at: string
          updated_at?: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      audio_clips: {
        Row: {
          created_at: string
          duration: number | null
          id: string
          owner_id: string
          owner_type: string
          url: string | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          id?: string
          owner_id: string
          owner_type: string
          url?: string | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          id?: string
          owner_id?: string
          owner_type?: string
          url?: string | null
        }
        Relationships: []
      }
      correction_items: {
        Row: {
          audio_url: string | null
          correction_type: string
          created_at: string
          explanation: string | null
          id: string
          original_text: string
          severity: string
          suggested_text: string | null
          turn_id: string
        }
        Insert: {
          audio_url?: string | null
          correction_type: string
          created_at?: string
          explanation?: string | null
          id?: string
          original_text: string
          severity?: string
          suggested_text?: string | null
          turn_id: string
        }
        Update: {
          audio_url?: string | null
          correction_type?: string
          created_at?: string
          explanation?: string | null
          id?: string
          original_text?: string
          severity?: string
          suggested_text?: string | null
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'correction_items_turn_id_fkey'
            columns: ['turn_id']
            isOneToOne: false
            referencedRelation: 'turns'
            referencedColumns: ['id']
          },
        ]
      }
      learning_history: {
        Row: {
          created_at: string
          id: string
          session_id: string | null
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id?: string | null
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'learning_history_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
        ]
      }
      scenarios: {
        Row: {
          created_at: string
          description: string | null
          description_zh: string | null
          difficulty: string
          enabled: boolean
          icon: string | null
          id: string
          key: string
          name: string
          name_zh: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_zh?: string | null
          difficulty?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          key: string
          name: string
          name_zh?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          description_zh?: string | null
          difficulty?: string
          enabled?: boolean
          icon?: string | null
          id?: string
          key?: string
          name?: string
          name_zh?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          accent_profile_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          scenario_id: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          accent_profile_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          scenario_id?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          accent_profile_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          scenario_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sessions_accent_profile_id_fkey'
            columns: ['accent_profile_id']
            isOneToOne: false
            referencedRelation: 'accent_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sessions_scenario_id_fkey'
            columns: ['scenario_id']
            isOneToOne: false
            referencedRelation: 'scenarios'
            referencedColumns: ['id']
          },
        ]
      }
      theme_preferences: {
        Row: {
          default_scenario_key: string
          locale: string
          selected_voice_profile_id: string | null
          subtitle_mode: string
          theme_key: string
          tts_provider: string
          tts_speed: number
          tts_voice_id: string | null
          ui_mode: string
          ui_theme: string
          ui_theme_updated_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          default_scenario_key?: string
          locale?: string
          selected_voice_profile_id?: string | null
          subtitle_mode?: string
          theme_key?: string
          tts_provider?: string
          tts_speed?: number
          tts_voice_id?: string | null
          ui_mode?: string
          ui_theme?: string
          ui_theme_updated_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          default_scenario_key?: string
          locale?: string
          selected_voice_profile_id?: string | null
          subtitle_mode?: string
          theme_key?: string
          tts_provider?: string
          tts_speed?: number
          tts_voice_id?: string | null
          ui_mode?: string
          ui_theme?: string
          ui_theme_updated_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tts_voice_profiles: {
        Row: {
          accent_key: string
          accent_label: string | null
          accent_region: string | null
          created_at: string
          description: string | null
          description_zh: string | null
          display_name: string
          display_name_zh: string | null
          expires_at: string | null
          gender: string | null
          id: string
          locale: string
          provider: string
          provider_voice_id: string | null
          quality_tier: string | null
          sort_order: number
          status: string
          style: string | null
          updated_at: string
        }
        Insert: {
          accent_key?: string
          accent_label?: string | null
          accent_region?: string | null
          created_at?: string
          description?: string | null
          description_zh?: string | null
          display_name: string
          display_name_zh?: string | null
          expires_at?: string | null
          gender?: string | null
          id: string
          locale?: string
          provider: string
          provider_voice_id?: string | null
          quality_tier?: string | null
          sort_order?: number
          status?: string
          style?: string | null
          updated_at?: string
        }
        Update: {
          accent_key?: string
          accent_label?: string | null
          accent_region?: string | null
          created_at?: string
          description?: string | null
          description_zh?: string | null
          display_name?: string
          display_name_zh?: string | null
          expires_at?: string | null
          gender?: string | null
          id?: string
          locale?: string
          provider?: string
          provider_voice_id?: string | null
          quality_tier?: string | null
          sort_order?: number
          status?: string
          style?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      turns: {
        Row: {
          audio_url: string | null
          created_at: string
          id: string
          session_id: string
          speaker: string
          transcript: string
          translated_text: string | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          id?: string
          session_id: string
          speaker: string
          transcript: string
          translated_text?: string | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          id?: string
          session_id?: string
          speaker?: string
          transcript?: string
          translated_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'turns_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'sessions'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      check_api_rate_limit: {
        Args: {
          p_bucket_key: string
          p_window_ms: number
          p_max_requests: number
        }
        Returns: {
          allowed: boolean
          request_count: number
          reset_at: string
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
