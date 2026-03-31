import { supabase } from "./supabaseClient";

export type RecurringFrequency = "weekly" | "monthly" | "yearly";
export type RecurringStatus = "active" | "paused";

export interface RecurringExpense {
  id: number;
  name: string;
  amount: number;
  category_id: number | null;
  frequency: RecurringFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  status: RecurringStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringExpenseData {
  name: string;
  amount: number;
  category_id?: number | null;
  frequency: RecurringFrequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  month_of_year?: number | null;
  start_date?: string;
  end_date?: string | null;
  status?: RecurringStatus;
  notes?: string | null;
}

export interface UpdateRecurringExpenseData {
  name?: string;
  amount?: number;
  category_id?: number | null;
  frequency?: RecurringFrequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  month_of_year?: number | null;
  start_date?: string;
  end_date?: string | null;
  status?: RecurringStatus;
  notes?: string | null;
}

export interface RecurringExpenseFilters {
  status?: RecurringStatus;
  category_id?: number;
}

const toIntegerOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return null;
  return Math.trunc(parsedValue);
};

const normalizeRecurringExpenseScheduleFields = <
  T extends
    | CreateRecurringExpenseData
    | UpdateRecurringExpenseData
    | Record<string, unknown>
>(
  data: T
): T => {
  const normalizedData = { ...data } as Record<string, unknown>;
  const frequency = normalizedData.frequency as RecurringFrequency | undefined;

  if (!frequency) return normalizedData as T;

  if (frequency === "weekly") {
    normalizedData.day_of_week = toIntegerOrNull(normalizedData.day_of_week);
    normalizedData.day_of_month = null;
    normalizedData.month_of_year = null;
  } else if (frequency === "monthly") {
    normalizedData.day_of_week = null;
    normalizedData.day_of_month = toIntegerOrNull(normalizedData.day_of_month);
    normalizedData.month_of_year = null;
  } else if (frequency === "yearly") {
    normalizedData.day_of_week = null;
    normalizedData.day_of_month = toIntegerOrNull(normalizedData.day_of_month);
    normalizedData.month_of_year = toIntegerOrNull(normalizedData.month_of_year);
  }

  return normalizedData as T;
};

export class RecurringExpensesService {
  static async createRecurringExpense(
    data: CreateRecurringExpenseData
  ): Promise<RecurringExpense> {
    const payload = normalizeRecurringExpenseScheduleFields(data);
    const { data: recurringExpense, error } = await supabase
      .from("recurring_expenses")
      .insert([payload])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create recurring expense: ${error.message}`);
    }

    return recurringExpense;
  }

  static async getRecurringExpenses(
    filters: RecurringExpenseFilters = {}
  ): Promise<RecurringExpense[]> {
    let query = supabase
      .from("recurring_expenses")
      .select("*")
      .order("created_at", { ascending: true });

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.category_id !== undefined && filters.category_id !== null) {
      query = query.eq("category_id", filters.category_id);
    }

    const { data: recurringExpenses, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch recurring expenses: ${error.message}`);
    }

    return recurringExpenses || [];
  }

  static async updateRecurringExpense(
    id: number,
    data: UpdateRecurringExpenseData
  ): Promise<RecurringExpense> {
    const payload = normalizeRecurringExpenseScheduleFields(data);
    const { data: recurringExpense, error } = await supabase
      .from("recurring_expenses")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update recurring expense: ${error.message}`);
    }

    return recurringExpense;
  }

  static async deleteRecurringExpense(id: number): Promise<void> {
    const { error } = await supabase
      .from("recurring_expenses")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to delete recurring expense: ${error.message}`);
    }
  }

  static async setRecurringExpenseStatus(
    id: number,
    status: RecurringStatus
  ): Promise<RecurringExpense> {
    const { data: recurringExpense, error } = await supabase
      .from("recurring_expenses")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update recurring expense status: ${error.message}`);
    }

    return recurringExpense;
  }

  static async pauseRecurringExpense(id: number): Promise<RecurringExpense> {
    return this.setRecurringExpenseStatus(id, "paused");
  }

  static async resumeRecurringExpense(id: number): Promise<RecurringExpense> {
    return this.setRecurringExpenseStatus(id, "active");
  }

  static calculateNormalizedMonthlyAmount(recurringExpense: RecurringExpense): number {
    const amount = Number(recurringExpense.amount) || 0;
    if (recurringExpense.frequency === "weekly") {
      return (amount * 52) / 12;
    }
    if (recurringExpense.frequency === "yearly") {
      return amount / 12;
    }
    return amount;
  }

  static calculateNormalizedMonthlyTotal(
    recurringExpenses: RecurringExpense[],
    options: { activeOnly?: boolean } = {}
  ): number {
    const { activeOnly = true } = options;
    const expensesToInclude = activeOnly
      ? recurringExpenses.filter((expense) => expense.status === "active")
      : recurringExpenses;

    return expensesToInclude.reduce(
      (total, recurringExpense) =>
        total + this.calculateNormalizedMonthlyAmount(recurringExpense),
      0
    );
  }
}
