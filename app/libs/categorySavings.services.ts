import { CategoriesService, type Category } from "./categories.services";
import { ExpensesService, type Expense } from "./expenses.services";
import { supabase } from "./supabaseClient";

export type SavingsRolloverStatus = "pending" | "confirmed" | "skipped";

export interface CategorySavingsRollover {
  id: number;
  category_id: number;
  month_start: string;
  month_end: string;
  budget_amount: number;
  spent_amount: number;
  rollover_amount: number;
  status: SavingsRolloverStatus;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategorySavingsTransaction {
  id: number;
  category_id: number;
  month_start: string;
  amount: number;
  source: "monthly_rollover";
  rollover_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CategorySavingsBalance {
  category_id: number;
  category_name: string;
  savings_enabled: boolean;
  balance: number;
  transaction_count: number;
}

export interface CategorySavingsRolloverWithCategory extends CategorySavingsRollover {
  categories: {
    id: number;
    name: string;
    weekly_budget: number;
    savings_enabled: boolean;
  } | null;
}

interface SavingsRolloverValues {
  month_end: string;
  budget_amount: number;
  spent_amount: number;
  rollover_amount: number;
}

export interface SavingsCatchupResult {
  created: number;
  recomputed: number;
  pending: number;
}

const toDateString = (dateValue: Date): string => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateOnly = (dateValue: string): Date => {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getMonthStart = (dateValue: Date): Date =>
  new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);

const getMonthEnd = (dateValue: Date): Date =>
  new Date(dateValue.getFullYear(), dateValue.getMonth() + 1, 0);

const addMonths = (dateValue: Date, monthCount: number): Date =>
  new Date(dateValue.getFullYear(), dateValue.getMonth() + monthCount, 1);

const roundCurrency = (value: number): number =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getDaysInMonth = (dateValue: Date): number =>
  getMonthEnd(dateValue).getDate();

const getPreviousMonthStart = (dateValue: Date): Date =>
  new Date(dateValue.getFullYear(), dateValue.getMonth() - 1, 1);

const getCategoryForRollover = (
  rollover: CategorySavingsRolloverWithCategory
): CategorySavingsRolloverWithCategory["categories"] => {
  const categoryValue = rollover.categories;
  if (Array.isArray(categoryValue)) {
    return categoryValue[0] || null;
  }
  return categoryValue || null;
};

export class CategorySavingsService {
  static calculateMonthlyBudget(weeklyBudget: number, monthStartDate: Date): number {
    const dailyBudget = Number(weeklyBudget || 0) / 7;
    return roundCurrency(dailyBudget * getDaysInMonth(monthStartDate));
  }

  static async getVariableExpensesForMonth(
    categoryId: number,
    monthStart: string,
    monthEnd: string
  ): Promise<Expense[]> {
    return ExpensesService.getExpenses({
      category_id: categoryId,
      start_date: monthStart,
      end_date: monthEnd,
      entry_type: "variable",
      limit: 5000,
      offset: 0,
    });
  }

  static async calculateRolloverValuesForMonth(
    categoryId: number,
    weeklyBudget: number,
    monthStart: string
  ): Promise<SavingsRolloverValues> {
    const monthStartDate = getMonthStart(parseDateOnly(monthStart));
    const monthEnd = toDateString(getMonthEnd(monthStartDate));
    const monthExpenses = await this.getVariableExpensesForMonth(
      categoryId,
      monthStart,
      monthEnd
    );
    const spentAmount = roundCurrency(
      monthExpenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
    );
    const budgetAmount = this.calculateMonthlyBudget(weeklyBudget, monthStartDate);
    const rolloverAmount = roundCurrency(budgetAmount - spentAmount);

    return {
      month_end: monthEnd,
      budget_amount: budgetAmount,
      spent_amount: spentAmount,
      rollover_amount: rolloverAmount,
    };
  }

  static async runPendingCatchup(
    currentDate: Date = new Date()
  ): Promise<SavingsCatchupResult> {
    const previousMonthStart = getPreviousMonthStart(currentDate);
    const previousMonthStartStr = toDateString(previousMonthStart);

    const allCategories = await CategoriesService.getCategories();
    const savingsCategories = allCategories.filter(
      (category) => Boolean(category.savings_enabled)
    );

    if (savingsCategories.length === 0) {
      return { created: 0, recomputed: 0, pending: 0 };
    }

    const rolloverSeeds: Array<{
      category_id: number;
      month_start: string;
      month_end: string;
      budget_amount: number;
      spent_amount: number;
      rollover_amount: number;
      status: "pending";
    }> = [];

    savingsCategories.forEach((category) => {
      const categoryCreatedMonth = getMonthStart(new Date(category.created_at));
      if (categoryCreatedMonth > previousMonthStart) return;

      for (
        let monthCursor = new Date(categoryCreatedMonth);
        monthCursor <= previousMonthStart;
        monthCursor = addMonths(monthCursor, 1)
      ) {
        rolloverSeeds.push({
          category_id: category.id,
          month_start: toDateString(monthCursor),
          month_end: toDateString(getMonthEnd(monthCursor)),
          budget_amount: 0,
          spent_amount: 0,
          rollover_amount: 0,
          status: "pending",
        });
      }
    });

    let createdCount = 0;
    if (rolloverSeeds.length > 0) {
      const { data: createdRows, error: upsertError } = await supabase
        .from("category_savings_rollovers")
        .upsert(rolloverSeeds, {
          onConflict: "category_id,month_start",
          ignoreDuplicates: true,
        })
        .select("id");

      if (upsertError) {
        throw new Error(`Failed to seed savings rollovers: ${upsertError.message}`);
      }

      createdCount = createdRows?.length || 0;
    }

    const savingsCategoryIds = savingsCategories.map((category) => category.id);
    const categoryById = savingsCategories.reduce<Record<number, Category>>(
      (map, category) => {
        map[category.id] = category;
        return map;
      },
      {}
    );

    const { data: pendingRollovers, error: pendingError } = await supabase
      .from("category_savings_rollovers")
      .select(
        "id, category_id, month_start, month_end, budget_amount, spent_amount, rollover_amount, status, confirmed_at, created_at, updated_at"
      )
      .eq("status", "pending")
      .in("category_id", savingsCategoryIds)
      .lte("month_start", previousMonthStartStr)
      .order("month_start", { ascending: true });

    if (pendingError) {
      throw new Error(`Failed to fetch pending savings rollovers: ${pendingError.message}`);
    }

    let recomputedCount = 0;
    for (const rollover of pendingRollovers || []) {
      const category = categoryById[rollover.category_id];
      if (!category) continue;

      const recalculatedValues = await this.calculateRolloverValuesForMonth(
        rollover.category_id,
        Number(category.weekly_budget || 0),
        rollover.month_start
      );

      const didChange =
        toDateString(getMonthEnd(parseDateOnly(rollover.month_start))) !== rollover.month_end ||
        roundCurrency(Number(rollover.budget_amount || 0)) !==
          recalculatedValues.budget_amount ||
        roundCurrency(Number(rollover.spent_amount || 0)) !==
          recalculatedValues.spent_amount ||
        roundCurrency(Number(rollover.rollover_amount || 0)) !==
          recalculatedValues.rollover_amount;

      if (!didChange) continue;

      const { error: updateError } = await supabase
        .from("category_savings_rollovers")
        .update(recalculatedValues)
        .eq("id", rollover.id)
        .eq("status", "pending");

      if (updateError) {
        throw new Error(`Failed to update savings rollover: ${updateError.message}`);
      }

      recomputedCount += 1;
    }

    const pendingCount = (pendingRollovers || []).length;
    return {
      created: createdCount,
      recomputed: recomputedCount,
      pending: pendingCount,
    };
  }

  static async getPendingRollovers(): Promise<CategorySavingsRolloverWithCategory[]> {
    const { data: rollovers, error } = await supabase
      .from("category_savings_rollovers")
      .select(
        "id, category_id, month_start, month_end, budget_amount, spent_amount, rollover_amount, status, confirmed_at, created_at, updated_at, categories(id, name, weekly_budget, savings_enabled)"
      )
      .eq("status", "pending")
      .order("month_start", { ascending: true })
      .order("category_id", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending rollovers: ${error.message}`);
    }

    return (rollovers || []).filter((rollover) => {
      const category = getCategoryForRollover(
        rollover as CategorySavingsRolloverWithCategory
      );
      return Boolean(category?.savings_enabled);
    }) as CategorySavingsRolloverWithCategory[];
  }

  static async getConfirmedRollovers(
    limit: number = 50
  ): Promise<CategorySavingsRolloverWithCategory[]> {
    const { data: rollovers, error } = await supabase
      .from("category_savings_rollovers")
      .select(
        "id, category_id, month_start, month_end, budget_amount, spent_amount, rollover_amount, status, confirmed_at, created_at, updated_at, categories(id, name, weekly_budget, savings_enabled)"
      )
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch confirmed rollovers: ${error.message}`);
    }

    return (rollovers || []) as CategorySavingsRolloverWithCategory[];
  }

  static async getPendingRolloversCount(): Promise<number> {
    const pendingRollovers = await this.getPendingRollovers();
    return pendingRollovers.length;
  }

  static async getCategorySavingsBalances(): Promise<CategorySavingsBalance[]> {
    const categories = await CategoriesService.getCategories();
    const { data: transactions, error } = await supabase
      .from("category_savings_transactions")
      .select("*")
      .eq("source", "monthly_rollover");

    if (error) {
      throw new Error(`Failed to fetch savings transactions: ${error.message}`);
    }

    const totalsByCategory = new Map<number, { total: number; count: number }>();
    (transactions || []).forEach((transaction) => {
      const currentTotals = totalsByCategory.get(transaction.category_id) || {
        total: 0,
        count: 0,
      };
      currentTotals.total += Number(transaction.amount || 0);
      currentTotals.count += 1;
      totalsByCategory.set(transaction.category_id, currentTotals);
    });

    return categories
      .filter((category) => {
        const totals = totalsByCategory.get(category.id);
        return Boolean(category.savings_enabled) || Boolean(totals && totals.count > 0);
      })
      .map((category) => {
        const totals = totalsByCategory.get(category.id) || { total: 0, count: 0 };
        return {
          category_id: category.id,
          category_name: category.name,
          savings_enabled: Boolean(category.savings_enabled),
          balance: roundCurrency(totals.total),
          transaction_count: totals.count,
        };
      })
      .sort((leftBalance, rightBalance) =>
        leftBalance.category_name.localeCompare(rightBalance.category_name)
      );
  }

  static async skipPendingRollover(
    rolloverId: number
  ): Promise<CategorySavingsRolloverWithCategory> {
    const rolloverSelect =
      "id, category_id, month_start, month_end, budget_amount, spent_amount, rollover_amount, status, confirmed_at, created_at, updated_at, categories(id, name, weekly_budget, savings_enabled)";

    const { data: skippedRollover, error: skipError } = await supabase
      .from("category_savings_rollovers")
      .update({
        status: "skipped",
        confirmed_at: null,
      })
      .eq("id", rolloverId)
      .eq("status", "pending")
      .select(rolloverSelect)
      .single();

    if (!skipError && skippedRollover) {
      return skippedRollover as unknown as CategorySavingsRolloverWithCategory;
    }

    const { data: existingRolloverRow, error: existingError } = await supabase
      .from("category_savings_rollovers")
      .select(rolloverSelect)
      .eq("id", rolloverId)
      .single();

    if (existingError || !existingRolloverRow) {
      throw new Error(
        `Failed to delete pending rollover: ${skipError?.message || existingError?.message || "Not found"}`
      );
    }

    const existingRollover =
      existingRolloverRow as unknown as CategorySavingsRolloverWithCategory;
    if (existingRollover.status === "skipped") {
      return existingRollover;
    }

    if (existingRollover.status === "confirmed") {
      throw new Error("This month is already confirmed and cannot be deleted.");
    }

    throw new Error(
      `Failed to delete pending rollover: ${skipError?.message || "Unknown error"}`
    );
  }

  static async confirmRollover(
    rolloverId: number
  ): Promise<CategorySavingsRolloverWithCategory> {
    const { data: rolloverRow, error: rolloverError } = await supabase
      .from("category_savings_rollovers")
      .select(
        "id, category_id, month_start, month_end, budget_amount, spent_amount, rollover_amount, status, confirmed_at, created_at, updated_at, categories(id, name, weekly_budget, savings_enabled)"
      )
      .eq("id", rolloverId)
      .single();

    if (rolloverError || !rolloverRow) {
      throw new Error(
        `Failed to fetch savings rollover: ${rolloverError?.message || "Not found"}`
      );
    }

    const rollover =
      rolloverRow as unknown as CategorySavingsRolloverWithCategory;
    const category = getCategoryForRollover(rollover);
    if (!category) {
      throw new Error("Savings rollover has no category.");
    }

    let confirmedRollover = rollover;
    if (rollover.status !== "confirmed") {
      const recalculatedValues = await this.calculateRolloverValuesForMonth(
        rollover.category_id,
        Number(category.weekly_budget || 0),
        rollover.month_start
      );

      const { data: updatedRollover, error: updateError } = await supabase
        .from("category_savings_rollovers")
        .update({
          ...recalculatedValues,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", rollover.id)
        .eq("status", "pending")
        .select(
          "id, category_id, month_start, month_end, budget_amount, spent_amount, rollover_amount, status, confirmed_at, created_at, updated_at, categories(id, name, weekly_budget, savings_enabled)"
        )
        .single();

      if (updateError || !updatedRollover) {
        throw new Error(
          `Failed to confirm savings rollover: ${updateError?.message || "Unknown error"}`
        );
      }

      confirmedRollover =
        updatedRollover as unknown as CategorySavingsRolloverWithCategory;
    }

    const { error: transactionError } = await supabase
      .from("category_savings_transactions")
      .upsert(
        [
          {
            category_id: confirmedRollover.category_id,
            month_start: confirmedRollover.month_start,
            amount: confirmedRollover.rollover_amount,
            source: "monthly_rollover",
            rollover_id: confirmedRollover.id,
          },
        ],
        {
          onConflict: "category_id,month_start,source",
        }
      );

    if (transactionError) {
      throw new Error(
        `Failed to record savings transaction: ${transactionError.message}`
      );
    }

    return confirmedRollover;
  }
}
