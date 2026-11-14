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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_collection_items: {
        Row: {
          collection_id: string
          group_id: string
          item_id: string
        }
        Insert: {
          collection_id: string
          group_id: string
          item_id: string
        }
        Update: {
          collection_id?: string
          group_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_collection_items_group_id_collection_id_fkey"
            columns: ["group_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "activity_collections"
            referencedColumns: ["id", "collection_id"]
          },
          {
            foreignKeyName: "activity_collection_items_item_id_collection_id_fkey"
            columns: ["item_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "activity_items"
            referencedColumns: ["id", "collection_id"]
          },
        ]
      }
      activity_collections: {
        Row: {
          archived_at: string | null
          collection_id: string
          color: string
          created_at: string
          id: string
          name: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          collection_id: string
          color?: string
          created_at?: string
          id: string
          name: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          collection_id?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_items: {
        Row: {
          collection_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          external_id: string | null
          external_source: string | null
          id: string
          image_url: string | null
          meta: Json
          notes: string | null
          status: string
          subtitle: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          meta?: Json
          notes?: string | null
          status?: string
          subtitle?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          external_id?: string | null
          external_source?: string | null
          id?: string
          image_url?: string | null
          meta?: Json
          notes?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_config: {
        Row: {
          id: boolean
          recording_started_at: string
        }
        Insert: {
          id?: boolean
          recording_started_at?: string
        }
        Update: {
          id?: boolean
          recording_started_at?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          actor_id: string | null
          carry_count: number
          collection_id: string
          completed: boolean
          id: number
          is_import_baseline: boolean
          item_created_at: string
          kind: string
          module: string
          occurred_at: string
          period: string | null
          record_id: string
        }
        Insert: {
          actor_id?: string | null
          carry_count?: number
          collection_id: string
          completed: boolean
          id?: never
          is_import_baseline?: boolean
          item_created_at: string
          kind: string
          module: string
          occurred_at?: string
          period?: string | null
          record_id: string
        }
        Update: {
          actor_id?: string | null
          carry_count?: number
          collection_id?: string
          completed?: boolean
          id?: never
          is_import_baseline?: boolean
          item_created_at?: string
          kind?: string
          module?: string
          occurred_at?: string
          period?: string | null
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_focus_sessions: {
        Row: {
          association: string
          collection_id: string | null
          credited_completed: boolean
          credited_segments: Json | null
          estimated_sessions: number | null
          goal_seconds: number | null
          id: string
          planned_seconds: number
          revision: number
          segments: Json
          started_at: string
          status: string
          task_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
          writer_client: string | null
          writer_lease: string | null
        }
        Insert: {
          association?: string
          collection_id?: string | null
          credited_completed?: boolean
          credited_segments?: Json | null
          estimated_sessions?: number | null
          goal_seconds?: number | null
          id: string
          planned_seconds: number
          revision: number
          segments?: Json
          started_at: string
          status: string
          task_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
          writer_client?: string | null
          writer_lease?: string | null
        }
        Update: {
          association?: string
          collection_id?: string | null
          credited_completed?: boolean
          credited_segments?: Json | null
          estimated_sessions?: number | null
          goal_seconds?: number | null
          id?: string
          planned_seconds?: number
          revision?: number
          segments?: Json
          started_at?: string
          status?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
          writer_client?: string | null
          writer_lease?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_focus_sessions_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_focus_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pomo_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_focus_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      background_run_status: {
        Row: {
          cleanup_succeeded: boolean
          created_at: string
          emails_failed: number
          emails_sent: number
          id: number
          mail_configured: boolean
          succeeded: boolean
        }
        Insert: {
          cleanup_succeeded: boolean
          created_at?: string
          emails_failed: number
          emails_sent: number
          id?: never
          mail_configured: boolean
          succeeded: boolean
        }
        Update: {
          cleanup_succeeded?: boolean
          created_at?: string
          emails_failed?: number
          emails_sent?: number
          id?: never
          mail_configured?: boolean
          succeeded?: boolean
        }
        Relationships: []
      }
      categories: {
        Row: {
          collection_id: string
          color: string | null
          created_at: string | null
          created_by: string | null
          icon: string | null
          id: string
          name: string
          updated_at: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          icon?: string | null
          id?: string
          name: string
          updated_at?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      code_snippets: {
        Row: {
          code: string
          collection_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          language: string
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          code: string
          collection_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          language?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          code?: string
          collection_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          language?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_snippets_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_activity: {
        Row: {
          actor_id: string | null
          collection_id: string
          created_at: string
          id: number
          operation: string
          record_id: string | null
        }
        Insert: {
          actor_id?: string | null
          collection_id: string
          created_at?: string
          id?: never
          operation: string
          record_id?: string | null
        }
        Update: {
          actor_id?: string | null
          collection_id?: string
          created_at?: string
          id?: never
          operation?: string
          record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_activity_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_invites: {
        Row: {
          collection_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          invite_role: string
          revoked_at: string | null
          token_hash: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          collection_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          invite_role?: string
          revoked_at?: string | null
          token_hash: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          collection_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invite_role?: string
          revoked_at?: string | null
          token_hash?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_invites_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_members: {
        Row: {
          collection_id: string
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_members_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      external_calendar_budgets: {
        Row: {
          action: string
          requests: number
          started_at: string
          user_id: string
        }
        Insert: {
          action: string
          requests?: number
          started_at?: string
          user_id: string
        }
        Update: {
          action?: string
          requests?: number
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      external_calendar_connections: {
        Row: {
          account_key: string
          id: string
          label: string
          provider: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_key: string
          id?: string
          label: string
          provider: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_key?: string
          id?: string
          label?: string
          provider?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      external_calendar_oauth: {
        Row: {
          expires_at: string
          provider: string
          return_url: string
          state_hash: string
          user_id: string
          verifier_cipher: string
        }
        Insert: {
          expires_at?: string
          provider?: string
          return_url: string
          state_hash: string
          user_id: string
          verifier_cipher: string
        }
        Update: {
          expires_at?: string
          provider?: string
          return_url?: string
          state_hash?: string
          user_id?: string
          verifier_cipher?: string
        }
        Relationships: []
      }
      external_calendar_sources: {
        Row: {
          color: string
          connection_id: string
          id: string
          name: string
          remote_id: string
          selected: boolean
        }
        Insert: {
          color?: string
          connection_id: string
          id?: string
          name: string
          remote_id: string
          selected?: boolean
        }
        Update: {
          color?: string
          connection_id?: string
          id?: string
          name?: string
          remote_id?: string
          selected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "external_calendar_sources_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "external_calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      external_calendar_tokens: {
        Row: {
          access_cipher: string
          connection_id: string
          expires_at: string
          locked_until: string | null
          refresh_cipher: string
          version: number
        }
        Insert: {
          access_cipher: string
          connection_id: string
          expires_at: string
          locked_until?: string | null
          refresh_cipher: string
          version?: number
        }
        Update: {
          access_cipher?: string
          connection_id?: string
          expires_at?: string
          locked_until?: string | null
          refresh_cipher?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "external_calendar_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "external_calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_budget_limits: {
        Row: {
          amount: number | null
          category_id: string
          month: string
          scope: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          amount?: number | null
          category_id: string
          month: string
          scope: string
          user_id: string
          workspace_id: string
        }
        Update: {
          amount?: number | null
          category_id?: string
          month?: string
          scope?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_budget_limits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_budget_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          archived: boolean
          budget_version: number
          created_at: string
          id: string
          name: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          budget_version?: number
          created_at?: string
          id?: string
          name: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          archived?: boolean
          budget_version?: number
          created_at?: string
          id?: string
          name?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_market_quotes: {
        Row: {
          currency: string
          fetched_at: string
          instrument: string
          metadata: Json
          price: number
          price_at: string
          provider: string
        }
        Insert: {
          currency: string
          fetched_at?: string
          instrument: string
          metadata?: Json
          price: number
          price_at: string
          provider: string
        }
        Update: {
          currency?: string
          fetched_at?: string
          instrument?: string
          metadata?: Json
          price?: number
          price_at?: string
          provider?: string
        }
        Relationships: []
      }
      finance_positions: {
        Row: {
          buy_price: number
          created_at: string
          id: string
          instrument: string
          kind: string
          manual_price: number | null
          manual_updated_at: string | null
          price_source: string
          purchased_on: string
          quantity: number
          title: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          buy_price: number
          created_at?: string
          id?: string
          instrument?: string
          kind: string
          manual_price?: number | null
          manual_updated_at?: string | null
          price_source: string
          purchased_on: string
          quantity: number
          title: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          buy_price?: number
          created_at?: string
          id?: string
          instrument?: string
          kind?: string
          manual_price?: number | null
          manual_updated_at?: string | null
          price_source?: string
          purchased_on?: string
          quantity?: number
          title?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_positions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_recurring: {
        Row: {
          active: boolean
          amount: number
          cadence: string
          category_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          kind: string
          next_index: number
          starts_on: string
          timezone: string
          title: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          cadence: string
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: string
          next_index?: number
          starts_on: string
          timezone?: string
          title: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          cadence?: string
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: string
          next_index?: number
          starts_on?: string
          timezone?: string
          title?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_recurring_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_recurring_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_settings: {
        Row: {
          currency: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          currency?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          currency?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transactions: {
        Row: {
          amount: number
          category: string
          category_id: string | null
          created_at: string
          id: string
          kind: string
          occurred_on: string
          recurring_id: string | null
          title: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          amount: number
          category: string
          category_id?: string | null
          created_at?: string
          id?: string
          kind: string
          occurred_on: string
          recurring_id?: string | null
          title: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          amount?: number
          category?: string
          category_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          occurred_on?: string
          recurring_id?: string | null
          title?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "finance_recurring"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_decks: {
        Row: {
          cards: Json
          collection_id: string
          color: string
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          title: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          cards?: Json
          collection_id: string
          color: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          title: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          cards?: Json
          collection_id?: string
          color?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          title?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_decks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_decks_items: {
        Row: {
          collection_id: string
          data: Json
          id: string
          parent_id: string
          position: number
          version: number
        }
        Insert: {
          collection_id: string
          data?: Json
          id: string
          parent_id: string
          position: number
          version?: number
        }
        Update: {
          collection_id?: string
          data?: Json
          id?: string
          parent_id?: string
          position?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_decks_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_items_parent_id_collection_id_fkey"
            columns: ["parent_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id", "collection_id"]
          },
        ]
      }
      focus_ownership: {
        Row: {
          client_id: string
          expires_at: string
          lease: string
          segment_started_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          client_id: string
          expires_at?: string
          lease?: string
          segment_started_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          client_id?: string
          expires_at?: string
          lease?: string
          segment_started_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_ownership_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analytics_focus_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_mistakes: {
        Row: {
          attempts: number
          created_at: string
          deleted_at: string | null
          id: string
          image_path: string | null
          prompt: string
          reason: string
          resolved: boolean
          review_on: string | null
          solution: string
          source: string
          subject_id: string
          topic_id: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          deleted_at?: string | null
          id: string
          image_path?: string | null
          prompt?: string
          reason?: string
          resolved?: boolean
          review_on?: string | null
          solution?: string
          source?: string
          subject_id: string
          topic_id: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_path?: string | null
          prompt?: string
          reason?: string
          resolved?: boolean
          review_on?: string | null
          solution?: string
          source?: string
          subject_id?: string
          topic_id?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_mistakes_subject_id_topic_id_fkey"
            columns: ["subject_id", "topic_id"]
            isOneToOne: false
            referencedRelation: "learning_subjects_items"
            referencedColumns: ["parent_id", "id"]
          },
          {
            foreignKeyName: "learning_mistakes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_progress: {
        Row: {
          deck_id: string | null
          last_reviewed_at: string | null
          note_id: string | null
          pomo_task_id: string | null
          review_on: string | null
          status: string
          streak: number
          subject_id: string
          topic_id: string
          user_id: string
          version: number
        }
        Insert: {
          deck_id?: string | null
          last_reviewed_at?: string | null
          note_id?: string | null
          pomo_task_id?: string | null
          review_on?: string | null
          status?: string
          streak?: number
          subject_id: string
          topic_id: string
          user_id: string
          version?: number
        }
        Update: {
          deck_id?: string | null
          last_reviewed_at?: string | null
          note_id?: string | null
          pomo_task_id?: string | null
          review_on?: string | null
          status?: string
          streak?: number
          subject_id?: string
          topic_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_progress_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_pomo_task_id_fkey"
            columns: ["pomo_task_id"]
            isOneToOne: false
            referencedRelation: "pomo_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "learning_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_subject_id_topic_id_fkey"
            columns: ["subject_id", "topic_id"]
            isOneToOne: false
            referencedRelation: "learning_subjects_items"
            referencedColumns: ["parent_id", "id"]
          },
        ]
      }
      learning_reviews: {
        Row: {
          correct: boolean
          created_at: string
          id: string
          mistake_id: string | null
          subject_id: string
          topic_id: string
          user_id: string
        }
        Insert: {
          correct: boolean
          created_at?: string
          id: string
          mistake_id?: string | null
          subject_id: string
          topic_id: string
          user_id: string
        }
        Update: {
          correct?: boolean
          created_at?: string
          id?: string
          mistake_id?: string | null
          subject_id?: string
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_reviews_mistake_id_fkey"
            columns: ["mistake_id"]
            isOneToOne: false
            referencedRelation: "learning_mistakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_reviews_subject_id_topic_id_fkey"
            columns: ["subject_id", "topic_id"]
            isOneToOne: false
            referencedRelation: "learning_subjects_items"
            referencedColumns: ["parent_id", "id"]
          },
        ]
      }
      learning_subjects: {
        Row: {
          collection_id: string
          color: string
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          position: number
          template_key: string | null
          template_revision: string | null
          title: string
          topics: Json
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          color: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          position?: number
          template_key?: string | null
          template_revision?: string | null
          title: string
          topics?: Json
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          color?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          position?: number
          template_key?: string | null
          template_revision?: string | null
          title?: string
          topics?: Json
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_subjects_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_subjects_items: {
        Row: {
          collection_id: string
          data: Json
          id: string
          parent_id: string
          position: number
          version: number
        }
        Insert: {
          collection_id: string
          data?: Json
          id: string
          parent_id: string
          position: number
          version?: number
        }
        Update: {
          collection_id?: string
          data?: Json
          id?: string
          parent_id?: string
          position?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_subjects_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_subjects_items_parent_id_collection_id_fkey"
            columns: ["parent_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "learning_subjects"
            referencedColumns: ["id", "collection_id"]
          },
        ]
      }
      module_collections: {
        Row: {
          created_at: string
          epoch: number
          id: string
          module: string
          origin_workspace_id: string
          owner_id: string
          shared: boolean
          timezone: string
        }
        Insert: {
          created_at?: string
          epoch?: number
          id?: string
          module: string
          origin_workspace_id: string
          owner_id: string
          shared?: boolean
          timezone?: string
        }
        Update: {
          created_at?: string
          epoch?: number
          id?: string
          module?: string
          origin_workspace_id?: string
          owner_id?: string
          shared?: boolean
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_collections_origin_workspace_id_fkey"
            columns: ["origin_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      password_sessions: {
        Row: {
          collection_id: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          password_hash: string
          updated_at: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          password_hash: string
          updated_at?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          password_hash?: string
          updated_at?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_sessions_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      periodic_email_deliveries: {
        Row: {
          attempts: number
          claimed_at: string
          delivered_at: string | null
          delivery_day: string
          id: string
          lease: string
          payload: Json | null
          task_id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string
          delivered_at?: string | null
          delivery_day: string
          id?: string
          lease?: string
          payload?: Json | null
          task_id: string
          user_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string
          delivered_at?: string | null
          delivery_day?: string
          id?: string
          lease?: string
          payload?: Json | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periodic_email_deliveries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "periodic_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      periodic_member_preferences: {
        Row: {
          last_notified_at: string | null
          notify_browser: boolean
          notify_email: boolean
          reminder_time: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          last_notified_at?: string | null
          notify_browser?: boolean
          notify_email?: boolean
          reminder_time?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          last_notified_at?: string | null
          notify_browser?: boolean
          notify_email?: boolean
          reminder_time?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periodic_member_preferences_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "periodic_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      periodic_tasks: {
        Row: {
          anchor_date: string | null
          category: string
          collection_id: string
          completed_date: string | null
          created_at: string
          day_of_month: number | null
          days_of_week: number[] | null
          deleted_at: string | null
          deleted_by: string | null
          frequency: string
          id: string
          interval_days: number | null
          last_notified_at: string | null
          member_notify_browser: boolean | null
          member_notify_email: boolean | null
          member_reminder_time: string | null
          month_of_year: number | null
          notes: string | null
          notify_browser: boolean
          notify_email: boolean
          reminder_time: string | null
          title: string
          updated_at: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          anchor_date?: string | null
          category?: string
          collection_id: string
          completed_date?: string | null
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          deleted_at?: string | null
          deleted_by?: string | null
          frequency?: string
          id?: string
          interval_days?: number | null
          last_notified_at?: string | null
          member_notify_browser?: boolean | null
          member_notify_email?: boolean | null
          member_reminder_time?: string | null
          month_of_year?: number | null
          notes?: string | null
          notify_browser?: boolean
          notify_email?: boolean
          reminder_time?: string | null
          title: string
          updated_at?: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          anchor_date?: string | null
          category?: string
          collection_id?: string
          completed_date?: string | null
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          deleted_at?: string | null
          deleted_by?: string | null
          frequency?: string
          id?: string
          interval_days?: number | null
          last_notified_at?: string | null
          member_notify_browser?: boolean | null
          member_notify_email?: boolean | null
          member_reminder_time?: string | null
          month_of_year?: number | null
          notes?: string | null
          notify_browser?: boolean
          notify_email?: boolean
          reminder_time?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periodic_tasks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_focus_links: {
        Row: {
          source_id: string
          source_module: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          source_id: string
          source_module: string
          task_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          source_id?: string
          source_module?: string
          task_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_focus_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pomo_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_focus_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          collection_id: string
          completed: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          history: Json
          id: string
          period: string
          period_date: string
          reason: string
          title: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          completed?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          history?: Json
          id?: string
          period: string
          period_date: string
          reason?: string
          title: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          completed?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          history?: Json
          id?: string
          period?: string
          period_date?: string
          reason?: string
          title?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      pomo_task_member_preferences: {
        Row: {
          estimated_sessions: number
          first_estimate_seconds: number | null
          focus_seconds: number
          task_id: string
          user_id: string
        }
        Insert: {
          estimated_sessions: number
          first_estimate_seconds?: number | null
          focus_seconds: number
          task_id: string
          user_id: string
        }
        Update: {
          estimated_sessions?: number
          first_estimate_seconds?: number | null
          focus_seconds?: number
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pomo_task_member_preferences_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pomo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pomo_tasks: {
        Row: {
          collection_id: string
          completed: boolean
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          completed?: boolean
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          completed?: boolean
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pomo_tasks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pomo_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pomodoro_history: {
        Row: {
          completed: boolean | null
          created_at: string | null
          created_by: string | null
          duration_seconds: number
          ended_at: string | null
          id: string
          mode: string
          started_at: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds: number
          ended_at?: string | null
          id?: string
          mode: string
          started_at?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number
          ended_at?: string | null
          id?: string
          mode?: string
          started_at?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pomodoro_history_workspace_owner_fk"
            columns: ["workspace_id", "created_by"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      quick_notes: {
        Row: {
          collection_id: string
          completed: boolean | null
          content: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          updated_at: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          completed?: boolean | null
          content: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          updated_at?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          completed?: boolean | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          updated_at?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_notes_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      rutin_members: {
        Row: {
          access_token: string
          avatar_key: string
          calendar_token: string
          color_key: string
          created_at: string
          id: string
          name: string
          pin: string | null
          role: Database["public"]["Enums"]["rutin_member_role"]
          workspace_id: string
        }
        Insert: {
          access_token: string
          avatar_key?: string
          calendar_token: string
          color_key?: string
          created_at?: string
          id?: string
          name: string
          pin?: string | null
          role?: Database["public"]["Enums"]["rutin_member_role"]
          workspace_id: string
        }
        Update: {
          access_token?: string
          avatar_key?: string
          calendar_token?: string
          color_key?: string
          created_at?: string
          id?: string
          name?: string
          pin?: string | null
          role?: Database["public"]["Enums"]["rutin_member_role"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutin_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "rutin_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rutin_occurrences: {
        Row: {
          completed_at: string | null
          completed_by_member_id: string | null
          created_at: string
          due_at: string | null
          id: string
          member_id: string | null
          note: string | null
          period_end: string
          period_start: string
          routine_id: string
          slot_index: number
          status: Database["public"]["Enums"]["rutin_occurrence_status"]
        }
        Insert: {
          completed_at?: string | null
          completed_by_member_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          member_id?: string | null
          note?: string | null
          period_end: string
          period_start: string
          routine_id: string
          slot_index?: number
          status?: Database["public"]["Enums"]["rutin_occurrence_status"]
        }
        Update: {
          completed_at?: string | null
          completed_by_member_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          member_id?: string | null
          note?: string | null
          period_end?: string
          period_start?: string
          routine_id?: string
          slot_index?: number
          status?: Database["public"]["Enums"]["rutin_occurrence_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rutin_occurrences_completed_by_member_id_fkey"
            columns: ["completed_by_member_id"]
            isOneToOne: false
            referencedRelation: "rutin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutin_occurrences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "rutin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutin_occurrences_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "rutin_routines"
            referencedColumns: ["id"]
          },
        ]
      }
      rutin_recurrences: {
        Row: {
          by_month_day: number[]
          by_weekday: number[]
          count_per_period: number | null
          ends_on: string | null
          id: string
          interval: number
          interval_unit: string
          kind: Database["public"]["Enums"]["rutin_recurrence_kind"]
          routine_id: string
          starts_on: string
          times_of_day: string[]
        }
        Insert: {
          by_month_day?: number[]
          by_weekday?: number[]
          count_per_period?: number | null
          ends_on?: string | null
          id?: string
          interval?: number
          interval_unit?: string
          kind?: Database["public"]["Enums"]["rutin_recurrence_kind"]
          routine_id: string
          starts_on: string
          times_of_day?: string[]
        }
        Update: {
          by_month_day?: number[]
          by_weekday?: number[]
          count_per_period?: number | null
          ends_on?: string | null
          id?: string
          interval?: number
          interval_unit?: string
          kind?: Database["public"]["Enums"]["rutin_recurrence_kind"]
          routine_id?: string
          starts_on?: string
          times_of_day?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "rutin_recurrences_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: true
            referencedRelation: "rutin_routines"
            referencedColumns: ["id"]
          },
        ]
      }
      rutin_routine_assignees: {
        Row: {
          id: string
          member_id: string
          rotation_order: number
          routine_id: string
        }
        Insert: {
          id?: string
          member_id: string
          rotation_order?: number
          routine_id: string
        }
        Update: {
          id?: string
          member_id?: string
          rotation_order?: number
          routine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutin_routine_assignees_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "rutin_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutin_routine_assignees_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "rutin_routines"
            referencedColumns: ["id"]
          },
        ]
      }
      rutin_routines: {
        Row: {
          area: string
          assignment_strategy: Database["public"]["Enums"]["rutin_assignment_strategy"]
          created_at: string
          emoji: string
          estimated_minutes: number | null
          id: string
          is_active: boolean
          overdue_policy: Database["public"]["Enums"]["rutin_overdue_policy"]
          sort_order: number
          title: string
          workspace_id: string
        }
        Insert: {
          area?: string
          assignment_strategy?: Database["public"]["Enums"]["rutin_assignment_strategy"]
          created_at?: string
          emoji?: string
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          overdue_policy?: Database["public"]["Enums"]["rutin_overdue_policy"]
          sort_order?: number
          title: string
          workspace_id: string
        }
        Update: {
          area?: string
          assignment_strategy?: Database["public"]["Enums"]["rutin_assignment_strategy"]
          created_at?: string
          emoji?: string
          estimated_minutes?: number | null
          id?: string
          is_active?: boolean
          overdue_policy?: Database["public"]["Enums"]["rutin_overdue_policy"]
          sort_order?: number
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutin_routines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "rutin_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rutin_workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string | null
          timezone: string
          workspace_type: Database["public"]["Enums"]["rutin_workspace_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          timezone?: string
          workspace_type?: Database["public"]["Enums"]["rutin_workspace_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          timezone?: string
          workspace_type?: Database["public"]["Enums"]["rutin_workspace_type"]
        }
        Relationships: []
      }
      secure_notes: {
        Row: {
          collection_id: string
          content: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          encrypted_payload: Json
          id: string
          password_encrypted: string | null
          session_id: string
          title: string
          type: Database["public"]["Enums"]["secure_note_type"]
          updated_at: string | null
          url: string | null
          username: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          encrypted_payload: Json
          id?: string
          password_encrypted?: string | null
          session_id: string
          title: string
          type: Database["public"]["Enums"]["secure_note_type"]
          updated_at?: string | null
          url?: string | null
          username?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          encrypted_payload?: Json
          id?: string
          password_encrypted?: string | null
          session_id?: string
          title?: string
          type?: Database["public"]["Enums"]["secure_note_type"]
          updated_at?: string | null
          url?: string | null
          username?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "secure_notes_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secure_notes_session_collection_fk"
            columns: ["session_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "password_sessions"
            referencedColumns: ["id", "collection_id"]
          },
          {
            foreignKeyName: "secure_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "password_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          category_id: string | null
          collection_id: string
          completed: boolean | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["todo_priority"] | null
          title: string
          updated_at: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          category_id?: string | null
          collection_id: string
          completed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["todo_priority"] | null
          title: string
          updated_at?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          category_id?: string | null
          collection_id?: string
          completed?: boolean | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["todo_priority"] | null
          title?: string
          updated_at?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_category_collection_fk"
            columns: ["category_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "collection_id"]
          },
          {
            foreignKeyName: "todos_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      trash_image_cleanup: {
        Row: {
          path: string
          queued_at: string
        }
        Insert: {
          path: string
          queued_at?: string
        }
        Update: {
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          preferences: Json
          schema_version: number
          updated_at: string
          user_id: string
        }
        Insert: {
          preferences?: Json
          schema_version?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          preferences?: Json
          schema_version?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          active_modules: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_modules?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_modules?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vault_acknowledgements: {
        Row: {
          accepted_at: string
          notice_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          notice_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          notice_version?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_note_history: {
        Row: {
          collection_id: string
          encrypted_payload: Json
          id: string
          note_id: string
          saved_at: string
        }
        Insert: {
          collection_id: string
          encrypted_payload: Json
          id?: string
          note_id: string
          saved_at?: string
        }
        Update: {
          collection_id?: string
          encrypted_payload?: Json
          id?: string
          note_id?: string
          saved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_note_history_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_note_history_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "secure_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_security_budgets: {
        Row: {
          requests: number
          started_at: string
          user_id: string
        }
        Insert: {
          requests?: number
          started_at?: string
          user_id: string
        }
        Update: {
          requests?: number
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_security_challenges: {
        Row: {
          action: string
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email_hash: string
          expected_version: number
          expires_at: string
          id: string
          payload: Json
          session_id: string
          user_id: string
          vault_id: string
        }
        Insert: {
          action: string
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email_hash: string
          expected_version: number
          expires_at?: string
          id: string
          payload: Json
          session_id: string
          user_id: string
          vault_id: string
        }
        Update: {
          action?: string
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email_hash?: string
          expected_version?: number
          expires_at?: string
          id?: string
          payload?: Json
          session_id?: string
          user_id?: string
          vault_id?: string
        }
        Relationships: []
      }
      vault_security_events: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
          vault_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
          vault_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
          vault_id?: string
        }
        Relationships: []
      }
      work_blocks: {
        Row: {
          created_at: string
          deleted_at: string | null
          ends_at: string
          id: string
          starts_at: string
          subtask_ids: string[]
          task_id: string | null
          timezone: string
          title: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          ends_at: string
          id?: string
          starts_at: string
          subtask_ids?: string[]
          task_id?: string | null
          timezone?: string
          title?: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          ends_at?: string
          id?: string
          starts_at?: string
          subtask_ids?: string[]
          task_id?: string | null
          timezone?: string
          title?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_blocks_task_id_workspace_id_fkey"
            columns: ["task_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "work_tasks"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_blocks_workspace_id_user_id_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      work_module_setup: {
        Row: {
          workspace_id: string
        }
        Insert: {
          workspace_id: string
        }
        Update: {
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_module_setup_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      work_projects: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_projects_workspace_id_user_id_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      work_tasks: {
        Row: {
          checklist: Json
          created_at: string
          deleted_at: string | null
          description: string
          due_on: string | null
          estimate_minutes: number
          id: string
          priority: string
          project_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string
          due_on?: string | null
          estimate_minutes?: number
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string
          due_on?: string | null
          estimate_minutes?: number
          id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_tasks_project_id_workspace_id_fkey"
            columns: ["project_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "work_projects"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "work_tasks_workspace_id_user_id_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      workout_library_exercises: {
        Row: {
          collection_id: string
          created_at: string
          created_by: string
          equipment: string
          id: string
          image_url: string
          muscle_group: string
          name: string
          removed_at: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          created_by: string
          equipment: string
          id: string
          image_url: string
          muscle_group: string
          name: string
          removed_at?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          created_by?: string
          equipment?: string
          id?: string
          image_url?: string
          muscle_group?: string
          name?: string
          removed_at?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_library_exercises_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_library_exercises_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_routines: {
        Row: {
          collection_id: string
          created_at: string | null
          day_of_week: string | null
          deleted_at: string | null
          deleted_by: string | null
          exercises: Json
          id: string
          title: string
          user_id: string
          version: number
          workspace_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string | null
          day_of_week?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exercises?: Json
          id?: string
          title: string
          user_id: string
          version?: number
          workspace_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string | null
          day_of_week?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          exercises?: Json
          id?: string
          title?: string
          user_id?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_routines_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_routines_items: {
        Row: {
          collection_id: string
          data: Json
          id: string
          parent_id: string
          position: number
          version: number
        }
        Insert: {
          collection_id: string
          data?: Json
          id: string
          parent_id: string
          position: number
          version?: number
        }
        Update: {
          collection_id?: string
          data?: Json
          id?: string
          parent_id?: string
          position?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_routines_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_routines_items_parent_id_collection_id_fkey"
            columns: ["parent_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "workout_routines"
            referencedColumns: ["id", "collection_id"]
          },
        ]
      }
      workspace_module_bindings: {
        Row: {
          collection_id: string
          module: string
          personal_collection_id: string
          workspace_id: string
        }
        Insert: {
          collection_id: string
          module: string
          personal_collection_id: string
          workspace_id: string
        }
        Update: {
          collection_id?: string
          module?: string
          personal_collection_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_module_bindings_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_module_bindings_personal_collection_id_fkey"
            columns: ["personal_collection_id"]
            isOneToOne: false
            referencedRelation: "module_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_module_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          active_modules: string[]
          archived_at: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          user_id: string
        }
        Insert: {
          active_modules?: string[]
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          user_id: string
        }
        Update: {
          active_modules?: string[]
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_collection_invite: {
        Args: { invite_token: string; wid: string }
        Returns: Json
      }
      activity_library_context: { Args: { wid: string }; Returns: string }
      activity_library_load: { Args: { wid: string }; Returns: Json }
      activity_library_mutate: {
        Args: {
          expected_version?: number
          operation: string
          payload?: Json
          rid: string
          wid: string
        }
        Returns: Json
      }
      analytics_report: {
        Args: {
          date_from: string
          date_to: string
          personal?: boolean
          report_timezone: string
          wid: string
        }
        Returns: Json
      }
      analytics_report_v2: {
        Args: {
          date_from: string
          date_to: string
          include_items: boolean
          personal: boolean
          report_timezone: string
          wid: string
        }
        Returns: Json
      }
      analytics_summary: {
        Args: {
          date_from: string
          date_to: string
          personal?: boolean
          report_timezone: string
          wid: string
        }
        Returns: Json
      }
      application_release_ready: {
        Args: { required_rpc: string[] }
        Returns: boolean
      }
      application_security_ready: { Args: never; Returns: boolean }
      check_api_budget: { Args: never; Returns: undefined }
      claim_due_periodic_emails: {
        Args: { batch_size?: number; recipient_filter?: string }
        Returns: Json[]
      }
      claim_focus_session: {
        Args: { client_id: string; payload: Json; takeover?: boolean }
        Returns: Json
      }
      claim_periodic_email: {
        Args: { tid: string; tz: string; uid: string; wid: string }
        Returns: Json
      }
      cleanup_operational_metrics: { Args: never; Returns: undefined }
      collection_access: { Args: { cid: string }; Returns: boolean }
      collection_details: { Args: { cid: string }; Returns: Json }
      collection_member: { Args: { cid: string }; Returns: boolean }
      collection_owner: { Args: { cid: string }; Returns: boolean }
      collection_write: { Args: { cid: string }; Returns: boolean }
      consume_edge_budget: {
        Args: { operation: string; uid: string }
        Returns: boolean
      }
      consume_maintenance_ticket: {
        Args: { issued_at: number; ticket: string }
        Returns: boolean
      }
      create_collection_invite: {
        Args: { invite_role?: string; module_id: string; wid: string }
        Returns: Json
      }
      delete_note_category: {
        Args: { category_id: string; expected_version: number; wid: string }
        Returns: Json
      }
      delete_workspace: {
        Args: { expected_name: string; wid: string }
        Returns: Json
      }
      detach_collection: {
        Args: { module_id: string; wid: string }
        Returns: Json
      }
      end_focus_session: { Args: { session_id: string }; Returns: Json }
      enqueue_scheduled_maintenance: { Args: never; Returns: number }
      ensure_default_workspace: { Args: never; Returns: string }
      ensure_module_bindings: { Args: { wid: string }; Returns: undefined }
      external_calendar_service: {
        Args: {
          operation: string
          payload?: Json
          record_id?: string
          uid: string
        }
        Returns: Json
      }
      finance_budget_set: {
        Args: {
          apply_scope: string
          cid: string
          expected_version: number
          limit_amount: number
          month_start: string
          wid: string
        }
        Returns: Json
      }
      finance_budget_state: {
        Args: { month_start: string; wid: string }
        Returns: Json
      }
      finance_cache_quotes: { Args: { items: Json }; Returns: undefined }
      finance_category_mutate: {
        Args: {
          expected_version?: number
          operation: string
          payload: Json
          rid: string
          wid: string
        }
        Returns: Json
      }
      finance_load: {
        Args: { month_start: string; wid: string }
        Returns: Json
      }
      finance_materialize: {
        Args: { cutoff?: string; uid: string; wid: string }
        Returns: undefined
      }
      finance_mutate: {
        Args: {
          entity: string
          expected_version?: number
          operation: string
          payload: Json
          rid: string
          wid: string
        }
        Returns: Json
      }
      finance_occurrence: {
        Args: { anchor: string; cadence: string; n: number }
        Returns: string
      }
      finance_page: {
        Args: {
          after_date?: string
          after_id?: string
          entity: string
          month_start: string
          wid: string
        }
        Returns: Json
      }
      finance_position_values: {
        Args: { wid: string }
        Returns: {
          buy_price: number
          cost: number
          current_value: number
          gain: number
          gain_percent: number
          id: string
          instrument: string
          kind: string
          manual_price: number
          price: number
          price_at: string
          price_source: string
          purchased_on: string
          quantity: number
          stale: boolean
          title: string
          version: number
        }[]
      }
      finance_query: {
        Args: {
          after_date?: string
          after_id?: string
          filters?: Json
          month_start: string
          wid: string
        }
        Returns: Json
      }
      finance_rollover_recurring: { Args: never; Returns: undefined }
      finance_schedule_mutate: {
        Args: {
          expected_version?: number
          operation: string
          payload: Json
          rid: string
          wid: string
        }
        Returns: Json
      }
      finance_summary: {
        Args: { month_start: string; wid: string }
        Returns: Json
      }
      finance_summary_before_budgets: {
        Args: { month_start: string; wid: string }
        Returns: Json
      }
      finish_periodic_email: {
        Args: { did: string; success: boolean; token: string }
        Returns: boolean
      }
      focus_context: { Args: { client_id: string }; Returns: Json }
      learning_context: { Args: { wid: string }; Returns: string }
      learning_load: { Args: { wid: string }; Returns: Json }
      learning_mistakes_page: {
        Args: {
          after_id?: string
          after_time?: string
          filter?: string
          wid: string
        }
        Returns: Json
      }
      learning_mutate: {
        Args: {
          expected_version?: number
          operation: string
          payload?: Json
          sid?: string
          tid?: string
          wid: string
        }
        Returns: Json
      }
      learning_reorder: {
        Args: {
          expected_versions: Json
          ordered_ids: string[]
          sid: string
          wid: string
        }
        Returns: Json
      }
      manage_collection: {
        Args: { action: string; cid: string; target_id?: string }
        Returns: undefined
      }
      mark_member_reminder: { Args: { task_id: string }; Returns: undefined }
      mutate_collection_item: {
        Args: {
          cid: string
          expected_version?: number
          item: Json
          module_id: string
          operation: string
          pid: string
        }
        Returns: Json
      }
      note_image_access: {
        Args: { object_name: string; writing?: boolean }
        Returns: boolean
      }
      personal_workspace_reminders: { Args: never; Returns: Json }
      plan_entries_load: { Args: { wid: string }; Returns: Json }
      plan_entry_source: {
        Args: { rid: string; source: string; wid: string }
        Returns: Json
      }
      plan_focus_prepare: {
        Args: {
          estimate?: number
          rid: string
          seconds?: number
          source: string
          wid: string
        }
        Returns: Json
      }
      plan_focus_remove: {
        Args: { rid: string; source: string; wid: string }
        Returns: Json
      }
      plan_focus_source_available: {
        Args: { tid: string; wid: string }
        Returns: boolean
      }
      plan_focus_target: { Args: { tid: string; wid: string }; Returns: Json }
      pomonotes_history: {
        Args: {
          before_id?: string
          before_time?: string
          tid: string
          wid: string
        }
        Returns: Json
      }
      pomonotes_mutate: {
        Args: {
          estimate?: number
          expected_version?: number
          focus_seconds?: number
          operation: string
          tid?: string
          title?: string
          wid: string
        }
        Returns: Json
      }
      pomonotes_page: {
        Args: {
          after_item?: Json
          page_size?: number
          search_text?: string
          status_filter?: string
          wid: string
        }
        Returns: Json
      }
      pomonotes_search_target: {
        Args: { tid: string; wid: string }
        Returns: Json
      }
      preview_collection_invite: {
        Args: { invite_token: string }
        Returns: Json
      }
      purge_expired_trash: { Args: { batch_size?: number }; Returns: number }
      record_focus_session: { Args: { payload: Json }; Returns: boolean }
      record_focus_session_v1: { Args: { payload: Json }; Returns: boolean }
      reorder_workout_exercises: {
        Args: {
          cid: string
          expected_version: number
          ordered_ids: string[]
          pid: string
        }
        Returns: Json
      }
      report_client_error: {
        Args: { code: string; release: string; screen: string }
        Returns: boolean
      }
      rollover_collection_plans: { Args: { cid: string }; Returns: undefined }
      save_user_preferences: {
        Args: { expected_user_id: string; patch: Json }
        Returns: Json
      }
      seal_vault: {
        Args: {
          expected_version: number
          metadata: string
          new_name: string
          notes: Json
          previous_hash: string
          sid: string
        }
        Returns: Json
      }
      search_workspace: {
        Args: {
          only_module?: string
          page_offset?: number
          page_size?: number
          query_text: string
          wid: string
        }
        Returns: Json
      }
      sharing_context: { Args: { wid: string }; Returns: Json }
      sharing_notify: {
        Args: { payload: Json; topic: string }
        Returns: undefined
      }
      sharing_topic_access: { Args: { topic: string }; Returns: boolean }
      trash_change: {
        Args: {
          action: string
          expected_version: number
          module_id: string
          rid: string
          wid: string
        }
        Returns: Json
      }
      trash_cleanup_images: { Args: { ack?: string[] }; Returns: Json }
      trash_empty: {
        Args: { cutoff?: string; only_module?: string; wid: string }
        Returns: Json
      }
      trash_page: {
        Args: {
          after_key?: string
          after_time?: string
          only_module?: string
          page_size?: number
          query_text?: string
          wid: string
        }
        Returns: Json
      }
      trash_parent_active: {
        Args: { module_id: string; rid: string }
        Returns: boolean
      }
      trash_purge_record: {
        Args: { module_id: string; rid: string }
        Returns: undefined
      }
      trash_table: { Args: { module_id: string }; Returns: string }
      valid_user_preferences: { Args: { value: Json }; Returns: boolean }
      vault_acknowledge: { Args: never; Returns: undefined }
      vault_acknowledged: { Args: { uid: string }; Returns: boolean }
      vault_challenge_cancel: {
        Args: { challenge: string; uid: string }
        Returns: undefined
      }
      vault_challenge_finish: {
        Args: {
          challenge: string
          jwt_session: string
          mail_hash: string
          otp_hash: string
          uid: string
        }
        Returns: Json
      }
      vault_challenge_start: {
        Args: {
          challenge: string
          expected_version: number
          jwt_session: string
          mail_hash: string
          operation: string
          otp_hash: string
          prepared: Json
          sid: string
          uid: string
        }
        Returns: undefined
      }
      vault_ciphertext_storage_valid: {
        Args: { value: Json }
        Returns: boolean
      }
      vault_cleanup: { Args: { batch_size?: number }; Returns: number }
      vault_collection_ready: { Args: { cid: string }; Returns: boolean }
      vault_envelope_valid: { Args: { e: Json }; Returns: boolean }
      vault_import: {
        Args: { metadata: string; new_name: string; notes: Json; wid: string }
        Returns: string
      }
      vault_metadata_valid: { Args: { value: string }; Returns: boolean }
      vault_record_action: {
        Args: {
          expected_version: number
          hid?: string
          nid: string
          operation: string
        }
        Returns: undefined
      }
      vault_security_budget: { Args: { uid: string }; Returns: boolean }
      vault_v2_storage_valid: { Args: { value: string }; Returns: boolean }
      work_block_data: {
        Args: { b: Database["public"]["Tables"]["work_blocks"]["Row"] }
        Returns: Json
      }
      work_calendar: {
        Args: {
          range_end: string
          range_start: string
          selected_project?: string
          wid: string
        }
        Returns: Json
      }
      work_load: {
        Args: {
          after_created?: string
          after_id?: string
          selected_project?: string
          wid: string
        }
        Returns: Json
      }
      work_mutate: {
        Args: {
          entity: string
          expected_version?: number
          operation: string
          payload: Json
          rid: string
          wid: string
        }
        Returns: Json
      }
      work_project_delete: {
        Args: { expected_version: number; pid: string; wid: string }
        Returns: boolean
      }
      work_save_details: {
        Args: {
          task_payload: Json
          task_version: number
          tid: string
          time_changes: Json
          time_removals: Json
          wid: string
        }
        Returns: Json
      }
      work_task: { Args: { tid: string; wid: string }; Returns: Json }
      workout_library_catalog_item: {
        Args: {
          item: Database["public"]["Tables"]["workout_library_exercises"]["Row"]
        }
        Returns: Json
      }
      workout_library_collection: {
        Args: { wid: string; writing?: boolean }
        Returns: string
      }
      workout_library_load: { Args: { wid: string }; Returns: Json }
      workout_library_remove: {
        Args: { rid: string; wid: string }
        Returns: Json
      }
      workout_library_save: {
        Args: { input: Json; request_id: string; wid: string }
        Returns: Json
      }
      workspace_search_context: {
        Args: { counts_only?: boolean; query_text?: string; wid: string }
        Returns: Json
      }
      workspace_search_documents: {
        Args: { wid: string }
        Returns: {
          body: string
          child_id: string
          created_at: string
          meta: Json
          module: string
          record_id: string
          title: string
        }[]
      }
      workspace_search_normalize: { Args: { value: string }; Returns: string }
      workspace_search_text: { Args: { value: string }; Returns: string }
    }
    Enums: {
      rutin_assignment_strategy: "fixed" | "rotate" | "everyone" | "anyone"
      rutin_member_role: "owner" | "member"
      rutin_occurrence_status: "pending" | "done" | "skipped" | "missed"
      rutin_overdue_policy: "carry_over" | "expire"
      rutin_recurrence_kind: "fixed" | "quota" | "since_last_done" | "once"
      rutin_workspace_type: "home" | "cafe" | "office" | "airbnb" | "personal"
      secure_note_type: "password" | "note" | "secret"
      todo_priority: "low" | "medium" | "high"
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
      rutin_assignment_strategy: ["fixed", "rotate", "everyone", "anyone"],
      rutin_member_role: ["owner", "member"],
      rutin_occurrence_status: ["pending", "done", "skipped", "missed"],
      rutin_overdue_policy: ["carry_over", "expire"],
      rutin_recurrence_kind: ["fixed", "quota", "since_last_done", "once"],
      rutin_workspace_type: ["home", "cafe", "office", "airbnb", "personal"],
      secure_note_type: ["password", "note", "secret"],
      todo_priority: ["low", "medium", "high"],
    },
  },
} as const
