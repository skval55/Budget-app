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
          category_id: number;
          description: string;
          amount: number;
          expense_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          category_id: number;
          description: string;
          amount: number;
          expense_date: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          category_id?: number;
          description?: string;
          amount?: number;
          expense_date?: string;
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

export type CreateUser = Database['public']['Tables']['users']['Insert'];
export type CreateCategory = Database['public']['Tables']['categories']['Insert'];
export type CreateExpense = Database['public']['Tables']['expenses']['Insert'];

export type UpdateUser = Database['public']['Tables']['users']['Update'];
export type UpdateCategory = Database['public']['Tables']['categories']['Update'];
export type UpdateExpense = Database['public']['Tables']['expenses']['Update'];
