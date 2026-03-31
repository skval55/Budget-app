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
          savings_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: number;
          name: string;
          weekly_budget: number;
          savings_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: number;
          name?: string;
          weekly_budget?: number;
          savings_enabled?: boolean;
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
      category_savings_rollovers: {
        Row: {
          id: number;
          category_id: number;
          month_start: string;
          month_end: string;
          budget_amount: number;
          spent_amount: number;
          rollover_amount: number;
          status: "pending" | "confirmed" | "skipped";
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          category_id: number;
          month_start: string;
          month_end: string;
          budget_amount?: number;
          spent_amount?: number;
          rollover_amount?: number;
          status?: "pending" | "confirmed" | "skipped";
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          category_id?: number;
          month_start?: string;
          month_end?: string;
          budget_amount?: number;
          spent_amount?: number;
          rollover_amount?: number;
          status?: "pending" | "confirmed" | "skipped";
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      category_savings_transactions: {
        Row: {
          id: number;
          category_id: number;
          month_start: string;
          amount: number;
          source: "monthly_rollover";
          rollover_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          category_id: number;
          month_start: string;
          amount: number;
          source?: "monthly_rollover";
          rollover_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          category_id?: number;
          month_start?: string;
          amount?: number;
          source?: "monthly_rollover";
          rollover_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      notification_settings: {
        Row: {
          id: number;
          nightly_enabled: boolean;
          nightly_time: string;
          weekly_enabled: boolean;
          weekly_day_of_week: number;
          weekly_time: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          nightly_enabled?: boolean;
          nightly_time?: string;
          weekly_enabled?: boolean;
          weekly_day_of_week?: number;
          weekly_time?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          nightly_enabled?: boolean;
          nightly_time?: string;
          weekly_enabled?: boolean;
          weekly_day_of_week?: number;
          weekly_time?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      push_subscriptions: {
        Row: {
          id: number;
          device_label: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          status: "active" | "inactive";
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          device_label: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          status?: "active" | "inactive";
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          device_label?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          status?: "active" | "inactive";
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      notification_dispatch_logs: {
        Row: {
          id: number;
          subscription_id: number;
          reminder_type: "nightly" | "weekly";
          scheduled_for: string;
          status: "pending" | "sent" | "failed";
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          subscription_id: number;
          reminder_type: "nightly" | "weekly";
          scheduled_for: string;
          status?: "pending" | "sent" | "failed";
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          subscription_id?: number;
          reminder_type?: "nightly" | "weekly";
          scheduled_for?: string;
          status?: "pending" | "sent" | "failed";
          error?: string | null;
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
export type CategorySavingsRollover = Database['public']['Tables']['category_savings_rollovers']['Row'];
export type CategorySavingsTransaction =
  Database['public']['Tables']['category_savings_transactions']['Row'];
export type NotificationSettings =
  Database['public']['Tables']['notification_settings']['Row'];
export type PushSubscriptionRecord =
  Database['public']['Tables']['push_subscriptions']['Row'];
export type NotificationDispatchLog =
  Database['public']['Tables']['notification_dispatch_logs']['Row'];

export type CreateUser = Database['public']['Tables']['users']['Insert'];
export type CreateCategory = Database['public']['Tables']['categories']['Insert'];
export type CreateExpense = Database['public']['Tables']['expenses']['Insert'];
export type CreateRecurringExpense = Database['public']['Tables']['recurring_expenses']['Insert'];
export type CreateRecurringIncome = Database['public']['Tables']['recurring_incomes']['Insert'];
export type CreateCategorySavingsRollover =
  Database['public']['Tables']['category_savings_rollovers']['Insert'];
export type CreateCategorySavingsTransaction =
  Database['public']['Tables']['category_savings_transactions']['Insert'];
export type CreateNotificationSettings =
  Database['public']['Tables']['notification_settings']['Insert'];
export type CreatePushSubscriptionRecord =
  Database['public']['Tables']['push_subscriptions']['Insert'];
export type CreateNotificationDispatchLog =
  Database['public']['Tables']['notification_dispatch_logs']['Insert'];

export type UpdateUser = Database['public']['Tables']['users']['Update'];
export type UpdateCategory = Database['public']['Tables']['categories']['Update'];
export type UpdateExpense = Database['public']['Tables']['expenses']['Update'];
export type UpdateRecurringExpense = Database['public']['Tables']['recurring_expenses']['Update'];
export type UpdateRecurringIncome = Database['public']['Tables']['recurring_incomes']['Update'];
export type UpdateCategorySavingsRollover =
  Database['public']['Tables']['category_savings_rollovers']['Update'];
export type UpdateCategorySavingsTransaction =
  Database['public']['Tables']['category_savings_transactions']['Update'];
export type UpdateNotificationSettings =
  Database['public']['Tables']['notification_settings']['Update'];
export type UpdatePushSubscriptionRecord =
  Database['public']['Tables']['push_subscriptions']['Update'];
export type UpdateNotificationDispatchLog =
  Database['public']['Tables']['notification_dispatch_logs']['Update'];
