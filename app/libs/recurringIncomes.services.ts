import { supabase } from "./supabaseClient";
import type { RecurringFrequency, RecurringStatus } from "./recurringExpenses.services";

export interface RecurringIncome {
  id: number;
  name: string;
  amount: number;
  frequency: RecurringFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  day_of_month_secondary: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  status: RecurringStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringIncomeData {
  name: string;
  amount: number;
  frequency: RecurringFrequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  day_of_month_secondary?: number | null;
  month_of_year?: number | null;
  start_date?: string;
  end_date?: string | null;
  status?: RecurringStatus;
  notes?: string | null;
}

export interface UpdateRecurringIncomeData {
  name?: string;
  amount?: number;
  frequency?: RecurringFrequency;
  day_of_week?: number | null;
  day_of_month?: number | null;
  day_of_month_secondary?: number | null;
  month_of_year?: number | null;
  start_date?: string;
  end_date?: string | null;
  status?: RecurringStatus;
  notes?: string | null;
}

export interface RecurringIncomeFilters {
  status?: RecurringStatus;
}

const toIntegerOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) return null;
  return Math.trunc(parsedValue);
};

const normalizeRecurringIncomeScheduleFields = <
  T extends
    | CreateRecurringIncomeData
    | UpdateRecurringIncomeData
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
    normalizedData.day_of_month_secondary = null;
    normalizedData.month_of_year = null;
  } else if (frequency === "monthly") {
    normalizedData.day_of_week = null;
    normalizedData.day_of_month = toIntegerOrNull(normalizedData.day_of_month);
    normalizedData.day_of_month_secondary = toIntegerOrNull(
      normalizedData.day_of_month_secondary
    );
    if (normalizedData.day_of_month === normalizedData.day_of_month_secondary) {
      normalizedData.day_of_month_secondary = null;
    }
    normalizedData.month_of_year = null;
  } else if (frequency === "yearly") {
    normalizedData.day_of_week = null;
    normalizedData.day_of_month = toIntegerOrNull(normalizedData.day_of_month);
    normalizedData.day_of_month_secondary = null;
    normalizedData.month_of_year = toIntegerOrNull(normalizedData.month_of_year);
  }

  return normalizedData as T;
};

export class RecurringIncomesService {
  static async createRecurringIncome(
    data: CreateRecurringIncomeData
  ): Promise<RecurringIncome> {
    const payload = normalizeRecurringIncomeScheduleFields(data);
    const { data: recurringIncome, error } = await supabase
      .from("recurring_incomes")
      .insert([payload])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create recurring income: ${error.message}`);
    }

    return recurringIncome;
  }

  static async getRecurringIncomes(
    filters: RecurringIncomeFilters = {}
  ): Promise<RecurringIncome[]> {
    let query = supabase
      .from("recurring_incomes")
      .select("*")
      .order("created_at", { ascending: true });

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const { data: recurringIncomes, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch recurring incomes: ${error.message}`);
    }

    return recurringIncomes || [];
  }

  static async updateRecurringIncome(
    id: number,
    data: UpdateRecurringIncomeData
  ): Promise<RecurringIncome> {
    const payload = normalizeRecurringIncomeScheduleFields(data);
    const { data: recurringIncome, error } = await supabase
      .from("recurring_incomes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update recurring income: ${error.message}`);
    }

    return recurringIncome;
  }

  static async deleteRecurringIncome(id: number): Promise<void> {
    const { error } = await supabase
      .from("recurring_incomes")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`Failed to delete recurring income: ${error.message}`);
    }
  }

  static async setRecurringIncomeStatus(
    id: number,
    status: RecurringStatus
  ): Promise<RecurringIncome> {
    const { data: recurringIncome, error } = await supabase
      .from("recurring_incomes")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update recurring income status: ${error.message}`);
    }

    return recurringIncome;
  }

  static async pauseRecurringIncome(id: number): Promise<RecurringIncome> {
    return this.setRecurringIncomeStatus(id, "paused");
  }

  static async resumeRecurringIncome(id: number): Promise<RecurringIncome> {
    return this.setRecurringIncomeStatus(id, "active");
  }

  static calculateNormalizedMonthlyAmount(recurringIncome: RecurringIncome): number {
    const amount = Number(recurringIncome.amount) || 0;
    if (recurringIncome.frequency === "weekly") {
      return (amount * 52) / 12;
    }
    if (recurringIncome.frequency === "yearly") {
      return amount / 12;
    }
    if (recurringIncome.frequency === "monthly") {
      return recurringIncome.day_of_month_secondary ? amount * 2 : amount;
    }
    return amount;
  }

  static calculateNormalizedMonthlyTotal(
    recurringIncomes: RecurringIncome[],
    options: { activeOnly?: boolean } = {}
  ): number {
    const { activeOnly = true } = options;
    const incomesToInclude = activeOnly
      ? recurringIncomes.filter((income) => income.status === "active")
      : recurringIncomes;

    return incomesToInclude.reduce(
      (total, recurringIncome) =>
        total + this.calculateNormalizedMonthlyAmount(recurringIncome),
      0
    );
  }
}
