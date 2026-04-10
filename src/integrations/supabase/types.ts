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
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_entries: {
        Row: {
          created_at: string
          debt_id: string
          id: string
          interest_paid: number
          month: number
          principal_paid: number
          remaining_balance: number
          total_paid: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          debt_id: string
          id?: string
          interest_paid?: number
          month: number
          principal_paid?: number
          remaining_balance?: number
          total_paid?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          debt_id?: string
          id?: string
          interest_paid?: number
          month?: number
          principal_paid?: number
          remaining_balance?: number
          total_paid?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "debt_entries_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          created_at: string
          debtor_name: string
          fixed_payment_amount: number
          id: string
          is_zero_interest: boolean
          name: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          debtor_name?: string
          fixed_payment_amount?: number
          id?: string
          is_zero_interest?: boolean
          name: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          debtor_name?: string
          fixed_payment_amount?: number
          id?: string
          is_zero_interest?: boolean
          name?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      earners: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_entities: {
        Row: {
          column_mapping: Json
          created_at: string
          id: string
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          id?: string
          name: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      geojson_layers: {
        Row: {
          created_at: string
          geojson: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          geojson?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          geojson?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      income_entries: {
        Row: {
          created_at: string
          earner_id: string
          id: string
          month: number
          source1_employer: string
          source1_gross: number
          source1_social: number
          source1_tax: number
          source2_employer: string
          source2_gross: number
          source2_social: number
          source2_tax: number
          source3_employer: string
          source3_gross: number
          source3_social: number
          source3_tax: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          earner_id: string
          id?: string
          month: number
          source1_employer?: string
          source1_gross?: number
          source1_social?: number
          source1_tax?: number
          source2_employer?: string
          source2_gross?: number
          source2_social?: number
          source2_tax?: number
          source3_employer?: string
          source3_gross?: number
          source3_social?: number
          source3_tax?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          earner_id?: string
          id?: string
          month?: number
          source1_employer?: string
          source1_gross?: number
          source1_social?: number
          source1_tax?: number
          source2_employer?: string
          source2_gross?: number
          source2_social?: number
          source2_tax?: number
          source3_employer?: string
          source3_gross?: number
          source3_social?: number
          source3_tax?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "income_entries_earner_id_fkey"
            columns: ["earner_id"]
            isOneToOne: false
            referencedRelation: "earners"
            referencedColumns: ["id"]
          },
        ]
      }
      pension_entries: {
        Row: {
          closing_balance: number
          compensation: number
          created_at: string
          employee_contribution: number
          employer: string
          employer_contribution: number
          fund_id: string
          fund_name: string
          id: string
          management_fees: number
          month: number
          monthly_growth: number
          monthly_return: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          closing_balance?: number
          compensation?: number
          created_at?: string
          employee_contribution?: number
          employer?: string
          employer_contribution?: number
          fund_id: string
          fund_name?: string
          id?: string
          management_fees?: number
          month: number
          monthly_growth?: number
          monthly_return?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          closing_balance?: number
          compensation?: number
          created_at?: string
          employee_contribution?: number
          employer?: string
          employer_contribution?: number
          fund_id?: string
          fund_name?: string
          id?: string
          management_fees?: number
          month?: number
          monthly_growth?: number
          monthly_return?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "pension_entries_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "pension_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      pension_funds: {
        Row: {
          accessible: boolean
          accumulation_fee_pct: number
          birth_date: string | null
          created_at: string
          deposit_fee_pct: number
          employer: string
          end_savings_age: number
          fund_name: string
          id: string
          life_expectancy_age: number
          name: string
          parent_matching: boolean
          relevant: boolean
          retirement_age: number
          state_deposit_amount: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accessible?: boolean
          accumulation_fee_pct?: number
          birth_date?: string | null
          created_at?: string
          deposit_fee_pct?: number
          employer?: string
          end_savings_age?: number
          fund_name?: string
          id?: string
          life_expectancy_age?: number
          name: string
          parent_matching?: boolean
          relevant?: boolean
          retirement_age?: number
          state_deposit_amount?: number
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accessible?: boolean
          accumulation_fee_pct?: number
          birth_date?: string | null
          created_at?: string
          deposit_fee_pct?: number
          employer?: string
          end_savings_age?: number
          fund_name?: string
          id?: string
          life_expectancy_age?: number
          name?: string
          parent_matching?: boolean
          relevant?: boolean
          retirement_age?: number
          state_deposit_amount?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pension_settings: {
        Row: {
          accumulation_fee_pct: number
          checking_balance: number
          created_at: string
          default_employer: string
          default_fund_name: string
          deposit_fee_pct: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accumulation_fee_pct?: number
          checking_balance?: number
          created_at?: string
          default_employer?: string
          default_fund_name?: string
          deposit_fee_pct?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accumulation_fee_pct?: number
          checking_balance?: number
          created_at?: string
          default_employer?: string
          default_fund_name?: string
          deposit_fee_pct?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          apify_actor_rent_id: string
          apify_actor_sale_id: string
          apify_rent_input: Json
          apify_sale_input: Json
          apify_token: string
          city: string
          created_at: string
          house_number: string
          id: string
          monthly_rent_income: number
          purchase_price: number
          street: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          apify_actor_rent_id?: string
          apify_actor_sale_id?: string
          apify_rent_input?: Json
          apify_sale_input?: Json
          apify_token?: string
          city?: string
          created_at?: string
          house_number?: string
          id?: string
          monthly_rent_income?: number
          purchase_price?: number
          street?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          apify_actor_rent_id?: string
          apify_actor_sale_id?: string
          apify_rent_input?: Json
          apify_sale_input?: Json
          apify_token?: string
          city?: string
          created_at?: string
          house_number?: string
          id?: string
          monthly_rent_income?: number
          purchase_price?: number
          street?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      property_snapshots: {
        Row: {
          avg_price: number
          created_at: string
          id: string
          month: number
          property_id: string
          raw_data: Json
          sample_size: number
          std_deviation: number
          type: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          avg_price?: number
          created_at?: string
          id?: string
          month: number
          property_id: string
          raw_data?: Json
          sample_size?: number
          std_deviation?: number
          type?: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          avg_price?: number
          created_at?: string
          id?: string
          month?: number
          property_id?: string
          raw_data?: Json
          sample_size?: number
          std_deviation?: number
          type?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "property_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      recipient_mappings: {
        Row: {
          created_at: string
          custom_name: string
          id: string
          original_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_name: string
          id?: string
          original_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string
          id?: string
          original_name?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          created_at: string
          date: string
          entity_id: string
          id: string
          raw_data: Json | null
          relevant_transaction: boolean
          source_recipient: string | null
          subscription: boolean
          upload_id: string | null
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          date: string
          entity_id: string
          id?: string
          raw_data?: Json | null
          relevant_transaction?: boolean
          source_recipient?: string | null
          subscription?: boolean
          upload_id?: string | null
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          date?: string
          entity_id?: string
          id?: string
          raw_data?: Json | null
          relevant_transaction?: boolean
          source_recipient?: string | null
          subscription?: boolean
          upload_id?: string | null
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "financial_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      uploads: {
        Row: {
          created_at: string
          entity_id: string
          file_name: string
          id: string
          month: number
          storage_path: string
          transaction_count: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          entity_id: string
          file_name: string
          id?: string
          month: number
          storage_path: string
          transaction_count?: number
          user_id: string
          year: number
        }
        Update: {
          created_at?: string
          entity_id?: string
          file_name?: string
          id?: string
          month?: number
          storage_path?: string
          transaction_count?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "uploads_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "financial_entities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
