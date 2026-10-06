// Generated from the database (`supabase gen types typescript --linked --schema public`).
// Regenerate after every migration.

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
      activities: {
        Row: {
          actor_id: string | null
          at: string
          id: string
          organization_id: string
          text: string
        }
        Insert: {
          actor_id?: string | null
          at?: string
          id?: string
          organization_id: string
          text: string
        }
        Update: {
          actor_id?: string | null
          at?: string
          id?: string
          organization_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_financials: {
        Row: {
          appointment_id: string
          completed_at: string
          completed_by: string | null
          discount: number
          gross_margin: number | null
          gross_profit: number
          list_price: number
          organization_id: string
          price_charged: number
          total_cost: number
        }
        Insert: {
          appointment_id: string
          completed_at?: string
          completed_by?: string | null
          discount?: number
          gross_margin?: number | null
          gross_profit: number
          list_price: number
          organization_id: string
          price_charged: number
          total_cost: number
        }
        Update: {
          appointment_id?: string
          completed_at?: string
          completed_by?: string | null
          discount?: number
          gross_margin?: number | null
          gross_profit?: number
          list_price?: number
          organization_id?: string
          price_charged?: number
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointment_financials_organization_id_appointment_id_fkey"
            columns: ["organization_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "appointment_financials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_supplies: {
        Row: {
          appointment_id: string
          id: string
          organization_id: string
          product_id: string | null
          product_name: string
          quantity_used: number
          stock_drawn: number
          total_cost_snapshot: number
          unit: string
          unit_cost_snapshot: number
        }
        Insert: {
          appointment_id: string
          id?: string
          organization_id: string
          product_id?: string | null
          product_name: string
          quantity_used: number
          stock_drawn?: number
          total_cost_snapshot: number
          unit: string
          unit_cost_snapshot: number
        }
        Update: {
          appointment_id?: string
          id?: string
          organization_id?: string
          product_id?: string | null
          product_name?: string
          quantity_used?: number
          stock_drawn?: number
          total_cost_snapshot?: number
          unit?: string
          unit_cost_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointment_supplies_organization_id_appointment_id_fkey"
            columns: ["organization_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "appointment_supplies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_supplies_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      appointments: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          deposit_cents: number | null
          deposit_due: string | null
          deposit_paid_at: string | null
          deposit_payment_id: string | null
          deposit_percent: number | null
          deposit_provider: string | null
          discount: number | null
          duration_min: number
          id: string
          organization_id: string
          patient_id: string
          price_charged: number | null
          procedure_id: string
          professional_id: string | null
          starts_at: string
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deposit_cents?: number | null
          deposit_due?: string | null
          deposit_paid_at?: string | null
          deposit_payment_id?: string | null
          deposit_percent?: number | null
          deposit_provider?: string | null
          discount?: number | null
          duration_min: number
          id?: string
          organization_id: string
          patient_id: string
          price_charged?: number | null
          procedure_id: string
          professional_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deposit_cents?: number | null
          deposit_due?: string | null
          deposit_paid_at?: string | null
          deposit_payment_id?: string | null
          deposit_percent?: number | null
          deposit_provider?: string | null
          discount?: number | null
          duration_min?: number
          id?: string
          organization_id?: string
          patient_id?: string
          price_charged?: number | null
          procedure_id?: string
          professional_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "appointments_organization_id_procedure_id_fkey"
            columns: ["organization_id", "procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "appointments_organization_id_professional_id_fkey"
            columns: ["organization_id", "professional_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: string[]
          active: boolean
          conditions: string[]
          id: string
          kind: string
          name: string
          organization_id: string
          when: string
        }
        Insert: {
          actions?: string[]
          active?: boolean
          conditions?: string[]
          id?: string
          kind: string
          name: string
          organization_id: string
          when: string
        }
        Update: {
          actions?: string[]
          active?: boolean
          conditions?: string[]
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          when?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          converted: number
          id: string
          organization_id: string
          ran_at: string
          recovered: number
          rule_id: string
          summary: string
        }
        Insert: {
          converted?: number
          id?: string
          organization_id: string
          ran_at?: string
          recovered?: number
          rule_id: string
          summary: string
        }
        Update: {
          converted?: number
          id?: string
          organization_id?: string
          ran_at?: string
          recovered?: number
          rule_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_rule_id_fkey"
            columns: ["organization_id", "rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      clinical_records: {
        Row: {
          author_id: string | null
          chief_complaint: string | null
          id: string
          notes: string | null
          organization_id: string
          patient_id: string
          recorded_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          author_id?: string | null
          chief_complaint?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          patient_id: string
          recorded_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          author_id?: string | null
          chief_complaint?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          patient_id?: string
          recorded_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_records_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "pulse_leads"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinical_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          author_id: string | null
          body: string
          channel: string
          conversation_id: string
          created_at: string
          delivery_status: string | null
          direction: string
          id: string
          occurred_at: string
          organization_id: string
          provider: string | null
          provider_message_id: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          channel: string
          conversation_id: string
          created_at?: string
          delivery_status?: string | null
          direction: string
          id?: string
          occurred_at?: string
          organization_id: string
          provider?: string | null
          provider_message_id?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          channel?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: string | null
          direction?: string
          id?: string
          occurred_at?: string
          organization_id?: string
          provider?: string | null
          provider_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_organization_id_conversation_id_fkey"
            columns: ["organization_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversation_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          created_by: string | null
          follow_up_at: string | null
          id: string
          last_direction: string | null
          last_message_at: string | null
          last_message_preview: string | null
          lead_id: string | null
          organization_id: string
          patient_id: string | null
          status: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_at?: string | null
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          organization_id: string
          patient_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_at?: string | null
          id?: string
          last_direction?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_id?: string | null
          organization_id?: string
          patient_id?: string | null
          status?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "conversations_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          lot_code: string
          organization_id: string
          product_id: string
          quantity: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          lot_code: string
          organization_id: string
          product_id: string
          quantity: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          lot_code?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_contact_at: string
          name: string
          next_action: string | null
          organization_id: string
          patient_id: string | null
          phone: string | null
          potential_value: number
          procedure_id: string | null
          quote_sent_at: string | null
          source: string
          stage: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_contact_at?: string
          name: string
          next_action?: string | null
          organization_id: string
          patient_id?: string | null
          phone?: string | null
          potential_value?: number
          procedure_id?: string | null
          quote_sent_at?: string | null
          source: string
          stage?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_contact_at?: string
          name?: string
          next_action?: string | null
          organization_id?: string
          patient_id?: string | null
          phone?: string | null
          potential_value?: number
          procedure_id?: string | null
          quote_sent_at?: string | null
          source?: string
          stage?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_procedure_id_fkey"
            columns: ["organization_id", "procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string | null
          disabled_at: string | null
          email: string | null
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          name: string
          organization_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          disabled_at?: string | null
          email?: string | null
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          name: string
          organization_id: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          disabled_at?: string | null
          email?: string | null
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          name?: string
          organization_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "pulse_leads"
            referencedColumns: ["user_id"]
          },
        ]
      }
      opportunities: {
        Row: {
          created_at: string
          id: string
          kind: string
          organization_id: string
          refs: string[]
          status: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          organization_id: string
          refs?: string[]
          status?: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
          refs?: string[]
          status?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          closing_time: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          opening_time: string | null
          segment: string
          team_size: string | null
          whatsapp: string | null
          work_days: number[]
        }
        Insert: {
          address?: string | null
          city?: string | null
          closing_time?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          opening_time?: string | null
          segment?: string
          team_size?: string | null
          whatsapp?: string | null
          work_days?: number[]
        }
        Update: {
          address?: string | null
          city?: string | null
          closing_time?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          opening_time?: string | null
          segment?: string
          team_size?: string | null
          whatsapp?: string | null
          work_days?: number[]
        }
        Relationships: []
      }
      patients: {
        Row: {
          created_at: string | null
          created_by: string | null
          first_visit_at: string | null
          id: string
          last_visit_at: string | null
          name: string
          next_return_at: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          total_spent: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          first_visit_at?: string | null
          id?: string
          last_visit_at?: string | null
          name: string
          next_return_at?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          total_spent?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          first_visit_at?: string | null
          id?: string
          last_visit_at?: string | null
          name?: string
          next_return_at?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          total_spent?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_products: {
        Row: {
          organization_id: string
          procedure_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          organization_id: string
          procedure_id: string
          product_id: string
          quantity: number
        }
        Update: {
          organization_id?: string
          procedure_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedure_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_products_organization_id_procedure_id_fkey"
            columns: ["organization_id", "procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "procedure_products_organization_id_product_id_fkey"
            columns: ["organization_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      procedures: {
        Row: {
          category: string
          duration_min: number
          id: string
          name: string
          organization_id: string
          price: number
          return_days: number
        }
        Insert: {
          category: string
          duration_min: number
          id?: string
          name: string
          organization_id: string
          price: number
          return_days: number
        }
        Update: {
          category?: string
          duration_min?: number
          id?: string
          name?: string
          organization_id?: string
          price?: number
          return_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          min_quantity: number | null
          name: string
          organization_id: string
          supplier: string | null
          unit: string
          unit_cost: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          min_quantity?: number | null
          name: string
          organization_id: string
          supplier?: string | null
          unit: string
          unit_cost: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          min_quantity?: number | null
          name?: string
          organization_id?: string
          supplier?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          checkout_started_at: string | null
          created_at: string
          demo_first_at: string | null
          demo_last_at: string | null
          name: string | null
          source: string
          subscribe_clicked_at: string | null
          user_id: string
        }
        Insert: {
          checkout_started_at?: string | null
          created_at?: string
          demo_first_at?: string | null
          demo_last_at?: string | null
          name?: string | null
          source?: string
          subscribe_clicked_at?: string | null
          user_id: string
        }
        Update: {
          checkout_started_at?: string | null
          created_at?: string
          demo_first_at?: string | null
          demo_last_at?: string | null
          name?: string | null
          source?: string
          subscribe_clicked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "pulse_leads"
            referencedColumns: ["user_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          organization_id: string | null
          provider: string
          provider_subscription_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id?: string | null
          provider?: string
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id?: string | null
          provider?: string
          provider_subscription_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "pulse_leads"
            referencedColumns: ["user_id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          patient_id: string
          period: string
          procedure_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          patient_id: string
          period: string
          procedure_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          patient_id?: string
          period?: string
          procedure_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_organization_id_patient_id_fkey"
            columns: ["organization_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "waitlist_entries_organization_id_procedure_id_fkey"
            columns: ["organization_id", "procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Views: {
      pulse_leads: {
        Row: {
          checkout_started_at: string | null
          demo_first_at: string | null
          demo_last_at: string | null
          email: string | null
          name: string | null
          onboarded_at: string | null
          onboarding_done: boolean | null
          signed_up_at: string | null
          source: string | null
          stage: string | null
          subscribe_clicked_at: string | null
          subscribed_at: string | null
          subscription_provider: string | null
          subscription_status: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_record: { Args: { org: string }; Returns: boolean }
      is_member: { Args: { org: string }; Returns: boolean }
      is_owner: { Args: { org: string }; Returns: boolean }
      is_staff: { Args: { org: string }; Returns: boolean }
      pulse_accept_invite: {
        Args: { display_name?: string; org: string }
        Returns: undefined
      }
      pulse_complete_appointment: {
        Args: {
          a: Database["public"]["Tables"]["appointments"]["Row"]
          charged: number
          supplies: Json
        }
        Returns: undefined
      }
      pulse_conversation_touch: {
        Args: { conversation: string }
        Returns: undefined
      }
      pulse_delete_appointment: {
        Args: { appointment: string }
        Returns: undefined
      }
      pulse_draw_stock: {
        Args: { amount: number; org: string; product: string }
        Returns: number
      }
      pulse_mark: { Args: { step: string }; Returns: undefined }
      pulse_my_memberships: {
        Args: never
        Returns: {
          clinic: string
          invited_by_name: string
          name: string
          organization_id: string
          role: string
          status: string
        }[]
      }
      pulse_now: { Args: never; Returns: string }
      pulse_product_costs: {
        Args: { org: string }
        Returns: {
          product_id: string
          unit_cost: number
        }[]
      }
      pulse_refresh_patient: { Args: { patient: string }; Returns: undefined }
      pulse_return_supplies: {
        Args: { appointment: string; org: string }
        Returns: undefined
      }
      pulse_role: { Args: { org: string }; Returns: string }
      pulse_set_appointment_status: {
        Args: {
          appointment: string
          charged?: number
          next_status: string
          supplies?: Json
        }
        Returns: undefined
      }
      pulse_sync_patient: {
        Args: { org: string; patient: string }
        Returns: undefined
      }
      pulse_team_update: {
        Args: {
          member: string
          new_name?: string
          new_role?: string
          new_status?: string
          org: string
        }
        Returns: undefined
      }
      pulse_today: { Args: never; Returns: string }
      pulse_user_by_email: {
        Args: { lookup: string }
        Returns: {
          id: string
          last_sign_in_at: string
        }[]
      }
      sees_patient: { Args: { org: string; patient: string }; Returns: boolean }
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
