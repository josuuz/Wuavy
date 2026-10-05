// Generated from the database (Supabase MCP `generate_typescript_types`, same
// output as `supabase gen types typescript`). Regenerate after every migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      activities: {
        Row: { at: string; id: string; organization_id: string; text: string };
        Insert: { at?: string; id?: string; organization_id: string; text: string };
        Update: { at?: string; id?: string; organization_id?: string; text?: string };
        Relationships: [
          {
            foreignKeyName: "activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: {
          duration_min: number;
          id: string;
          organization_id: string;
          patient_id: string;
          procedure_id: string;
          professional_id: string | null;
          starts_at: string;
          status: string;
        };
        Insert: {
          duration_min: number;
          id?: string;
          organization_id: string;
          patient_id: string;
          procedure_id: string;
          professional_id?: string | null;
          starts_at: string;
          status?: string;
        };
        Update: {
          duration_min?: number;
          id?: string;
          organization_id?: string;
          patient_id?: string;
          procedure_id?: string;
          professional_id?: string | null;
          starts_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_organization_id_patient_id_fkey";
            columns: ["organization_id", "patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "appointments_organization_id_procedure_id_fkey";
            columns: ["organization_id", "procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "appointments_organization_id_professional_id_fkey";
            columns: ["organization_id", "professional_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["organization_id", "user_id"];
          },
        ];
      };
      automation_rules: {
        Row: {
          actions: string[];
          active: boolean;
          conditions: string[];
          id: string;
          kind: string;
          name: string;
          organization_id: string;
          when: string;
        };
        Insert: {
          actions?: string[];
          active?: boolean;
          conditions?: string[];
          id?: string;
          kind: string;
          name: string;
          organization_id: string;
          when: string;
        };
        Update: {
          actions?: string[];
          active?: boolean;
          conditions?: string[];
          id?: string;
          kind?: string;
          name?: string;
          organization_id?: string;
          when?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_runs: {
        Row: {
          id: string;
          organization_id: string;
          ran_at: string;
          recovered: number;
          rule_id: string;
          summary: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          ran_at?: string;
          recovered?: number;
          rule_id: string;
          summary: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          ran_at?: string;
          recovered?: number;
          rule_id?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_runs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_runs_organization_id_rule_id_fkey";
            columns: ["organization_id", "rule_id"];
            isOneToOne: false;
            referencedRelation: "automation_rules";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      inventory_lots: {
        Row: {
          expires_at: string;
          id: string;
          lot_code: string;
          organization_id: string;
          product_id: string;
          quantity: number;
        };
        Insert: {
          expires_at: string;
          id?: string;
          lot_code: string;
          organization_id: string;
          product_id: string;
          quantity: number;
        };
        Update: {
          expires_at?: string;
          id?: string;
          lot_code?: string;
          organization_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_lots_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_lots_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      leads: {
        Row: {
          created_at: string;
          id: string;
          last_contact_at: string;
          name: string;
          next_action: string | null;
          organization_id: string;
          patient_id: string | null;
          phone: string | null;
          potential_value: number;
          procedure_id: string | null;
          quote_sent_at: string | null;
          source: string;
          stage: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_contact_at?: string;
          name: string;
          next_action?: string | null;
          organization_id: string;
          patient_id?: string | null;
          phone?: string | null;
          potential_value?: number;
          procedure_id?: string | null;
          quote_sent_at?: string | null;
          source: string;
          stage?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_contact_at?: string;
          name?: string;
          next_action?: string | null;
          organization_id?: string;
          patient_id?: string | null;
          phone?: string | null;
          potential_value?: number;
          procedure_id?: string | null;
          quote_sent_at?: string | null;
          source?: string;
          stage?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_organization_id_patient_id_fkey";
            columns: ["organization_id", "patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "leads_organization_id_procedure_id_fkey";
            columns: ["organization_id", "procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      members: {
        Row: { name: string; organization_id: string; role: string; user_id: string };
        Insert: { name: string; organization_id: string; role: string; user_id: string };
        Update: { name?: string; organization_id?: string; role?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunities: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          organization_id: string;
          refs: string[];
          status: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          organization_id: string;
          refs?: string[];
          status?: string;
          value?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          organization_id?: string;
          refs?: string[];
          status?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "opportunities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          address: string | null;
          city: string | null;
          closing_time: string | null;
          created_at: string;
          id: string;
          logo_url: string | null;
          name: string;
          opening_time: string | null;
          segment: string;
          team_size: string | null;
          whatsapp: string | null;
          work_days: number[];
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          closing_time?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name: string;
          opening_time?: string | null;
          segment?: string;
          team_size?: string | null;
          whatsapp?: string | null;
          work_days?: number[];
        };
        Update: {
          address?: string | null;
          city?: string | null;
          closing_time?: string | null;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name?: string;
          opening_time?: string | null;
          segment?: string;
          team_size?: string | null;
          whatsapp?: string | null;
          work_days?: number[];
        };
        Relationships: [];
      };
      patients: {
        Row: {
          first_visit_at: string | null;
          id: string;
          last_visit_at: string | null;
          name: string;
          next_return_at: string | null;
          notes: string | null;
          organization_id: string;
          phone: string | null;
          total_spent: number;
        };
        Insert: {
          first_visit_at?: string | null;
          id?: string;
          last_visit_at?: string | null;
          name: string;
          next_return_at?: string | null;
          notes?: string | null;
          organization_id: string;
          phone?: string | null;
          total_spent?: number;
        };
        Update: {
          first_visit_at?: string | null;
          id?: string;
          last_visit_at?: string | null;
          name?: string;
          next_return_at?: string | null;
          notes?: string | null;
          organization_id?: string;
          phone?: string | null;
          total_spent?: number;
        };
        Relationships: [
          {
            foreignKeyName: "patients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      procedure_products: {
        Row: { organization_id: string; procedure_id: string; product_id: string; quantity: number };
        Insert: { organization_id: string; procedure_id: string; product_id: string; quantity: number };
        Update: { organization_id?: string; procedure_id?: string; product_id?: string; quantity?: number };
        Relationships: [
          {
            foreignKeyName: "procedure_products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "procedure_products_organization_id_procedure_id_fkey";
            columns: ["organization_id", "procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "procedure_products_organization_id_product_id_fkey";
            columns: ["organization_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      profiles: {
        Row: {
          user_id: string;
          name: string | null;
          source: string;
          demo_first_at: string | null;
          demo_last_at: string | null;
          subscribe_clicked_at: string | null;
          checkout_started_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          name?: string | null;
          source?: string;
          demo_first_at?: string | null;
          demo_last_at?: string | null;
          subscribe_clicked_at?: string | null;
          checkout_started_at?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          name?: string | null;
          source?: string;
          demo_first_at?: string | null;
          demo_last_at?: string | null;
          subscribe_clicked_at?: string | null;
          checkout_started_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      procedures: {
        Row: {
          category: string;
          duration_min: number;
          id: string;
          name: string;
          organization_id: string;
          price: number;
          return_days: number;
        };
        Insert: {
          category: string;
          duration_min: number;
          id?: string;
          name: string;
          organization_id: string;
          price: number;
          return_days: number;
        };
        Update: {
          category?: string;
          duration_min?: number;
          id?: string;
          name?: string;
          organization_id?: string;
          price?: number;
          return_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: "procedures_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: { id: string; min_quantity: number | null; name: string; organization_id: string; unit: string; unit_cost: number };
        Insert: { id?: string; min_quantity?: number | null; name: string; organization_id: string; unit: string; unit_cost: number };
        Update: { id?: string; min_quantity?: number | null; name?: string; organization_id?: string; unit?: string; unit_cost?: number };
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          id: string;
          organization_id: string | null;
          provider: string;
          provider_subscription_id: string | null;
          started_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          organization_id?: string | null;
          provider?: string;
          provider_subscription_id?: string | null;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          organization_id?: string | null;
          provider?: string;
          provider_subscription_id?: string | null;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      waitlist_entries: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          patient_id: string;
          period: string;
          procedure_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          patient_id: string;
          period: string;
          procedure_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          patient_id?: string;
          period?: string;
          procedure_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waitlist_entries_organization_id_patient_id_fkey";
            columns: ["organization_id", "patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "waitlist_entries_organization_id_procedure_id_fkey";
            columns: ["organization_id", "procedure_id"];
            isOneToOne: false;
            referencedRelation: "procedures";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_member: { Args: { org: string }; Returns: boolean };
      is_owner: { Args: { org: string }; Returns: boolean };
      pulse_mark: { Args: { step: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
