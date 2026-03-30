// Database types for TypeScript support

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: number;
          email: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          email: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          email?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: number;
          user_id: number;
          name: string;
          weekly_budget: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: number;
          name: string;
          weekly_budget: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: number;
          name?: string;
          weekly_budget?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      expenses: {
        Row: {
          id: number;
          category_id: number | null;
          description: string;
          amount: number;
          expense_date: string;
          entry_type: "variable" | "recurring";
          recurring_expense_id: number | null;
          generated_for_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          category_id?: number | null;
          description: string;
          amount: number;
          expense_date: string;
          entry_type?: "variable" | "recurring";
          recurring_expense_id?: number | null;
          generated_for_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          category_id?: number | null;
          description?: string;
          amount?: number;
          expense_date?: string;
          entry_type?: "variable" | "recurring";
          recurring_expense_id?: number | null;
          generated_for_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      recurring_expenses: {
        Row: {
          id: number;
          name: string;
          amount: number;
          category_id: number | null;
          frequency: "weekly" | "monthly" | "yearly";
          day_of_week: number | null;
          day_of_month: number | null;
          month_of_year: number | null;
          start_date: string;
          end_date: string | null;
          status: "active" | "paused";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          amount: number;
          category_id?: number | null;
          frequency: "weekly" | "monthly" | "yearly";
          day_of_week?: number | null;
          day_of_month?: number | null;
          month_of_year?: number | null;
          start_date?: string;
          end_date?: string | null;
          status?: "active" | "paused";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          amount?: number;
          category_id?: number | null;
          frequency?: "weekly" | "monthly" | "yearly";
          day_of_week?: number | null;
          day_of_month?: number | null;
          month_of_year?: number | null;
          start_date?: string;
          end_date?: string | null;
          status?: "active" | "paused";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      recurring_incomes: {
        Row: {
          id: number;
          name: string;
          amount: number;
          frequency: "weekly" | "monthly" | "yearly";
          day_of_week: number | null;
          day_of_month: number | null;
          day_of_month_secondary: number | null;
          month_of_year: number | null;
          start_date: string;
          end_date: string | null;
          status: "active" | "paused";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          amount: number;
          frequency: "weekly" | "monthly" | "yearly";
          day_of_week?: number | null;
          day_of_month?: number | null;
          day_of_month_secondary?: number | null;
          month_of_year?: number | null;
          start_date?: string;
          end_date?: string | null;
          status?: "active" | "paused";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          amount?: number;
          frequency?: "weekly" | "monthly" | "yearly";
          day_of_week?: number | null;
          day_of_month?: number | null;
          day_of_month_secondary?: number | null;
          month_of_year?: number | null;
          start_date?: string;
          end_date?: string | null;
          status?: "active" | "paused";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Convenience types
export type User = Database['public']['Tables']['users']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type RecurringExpense = Database['public']['Tables']['recurring_expenses']['Row'];
export type RecurringIncome = Database['public']['Tables']['recurring_incomes']['Row'];

export type CreateUser = Database['public']['Tables']['users']['Insert'];
export type CreateCategory = Database['public']['Tables']['categories']['Insert'];
export type CreateExpense = Database['public']['Tables']['expenses']['Insert'];
export type CreateRecurringExpense = Database['public']['Tables']['recurring_expenses']['Insert'];
export type CreateRecurringIncome = Database['public']['Tables']['recurring_incomes']['Insert'];

export type UpdateUser = Database['public']['Tables']['users']['Update'];
export type UpdateCategory = Database['public']['Tables']['categories']['Update'];
export type UpdateExpense = Database['public']['Tables']['expenses']['Update'];
export type UpdateRecurringExpense = Database['public']['Tables']['recurring_expenses']['Update'];
export type UpdateRecurringIncome = Database['public']['Tables']['recurring_incomes']['Update'];
