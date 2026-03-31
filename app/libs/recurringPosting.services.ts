import { supabase } from "./supabaseClient";
import {
  RecurringExpensesService,
  type RecurringExpense,
} from "./recurringExpenses.services";

const parseDateOnly = (dateValue: string): Date => {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const toDateOnly = (dateValue: Date): Date =>
  new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());

const toDateString = (dateValue: Date): string => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const maxDate = (leftDate: Date, rightDate: Date): Date =>
  leftDate > rightDate ? leftDate : rightDate;

const minDate = (leftDate: Date, rightDate: Date): Date =>
  leftDate < rightDate ? leftDate : rightDate;

const getLastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

const isDateInRange = (dateValue: Date, startDate: Date, endDate: Date): boolean =>
  dateValue >= startDate && dateValue <= endDate;

const buildDueDatesForRecurringExpense = (
  recurringExpense: RecurringExpense,
  startDate: Date,
  endDate: Date
): string[] => {
  if (startDate > endDate) return [];

  const dueDates: string[] = [];

  if (recurringExpense.frequency === "weekly") {
    if (recurringExpense.day_of_week === null) return [];

    const cursorDate = new Date(startDate);
    while (cursorDate <= endDate) {
      if (cursorDate.getDay() === recurringExpense.day_of_week) {
        dueDates.push(toDateString(cursorDate));
      }
      cursorDate.setDate(cursorDate.getDate() + 1);
    }
    return dueDates;
  }

  if (recurringExpense.frequency === "monthly") {
    if (recurringExpense.day_of_month === null) return [];

    const monthCursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (monthCursor <= endMonth) {
      const year = monthCursor.getFullYear();
      const monthIndex = monthCursor.getMonth();
      const dueDay = Math.min(
        recurringExpense.day_of_month,
        getLastDayOfMonth(year, monthIndex)
      );
      const dueDate = new Date(year, monthIndex, dueDay);

      if (isDateInRange(dueDate, startDate, endDate)) {
        dueDates.push(toDateString(dueDate));
      }

      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }

    return dueDates;
  }

  if (recurringExpense.frequency === "yearly") {
    if (
      recurringExpense.day_of_month === null ||
      recurringExpense.month_of_year === null
    ) {
      return [];
    }

    const monthIndex = recurringExpense.month_of_year - 1;
    for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year += 1) {
      const dueDay = Math.min(
        recurringExpense.day_of_month,
        getLastDayOfMonth(year, monthIndex)
      );
      const dueDate = new Date(year, monthIndex, dueDay);
      if (isDateInRange(dueDate, startDate, endDate)) {
        dueDates.push(toDateString(dueDate));
      }
    }
  }

  return dueDates;
};

interface RecurringCatchupResult {
  attempted: number;
  created: number;
}

export class RecurringPostingService {
  static async runCurrentMonthCatchup(
    currentDate: Date = new Date()
  ): Promise<RecurringCatchupResult> {
    const today = toDateOnly(currentDate);
    const monthStartDate = new Date(today.getFullYear(), today.getMonth(), 1);

    const recurringExpenses = await RecurringExpensesService.getRecurringExpenses({
      status: "active",
    });

    const expensesToInsert: Array<{
      category_id: number | null;
      description: string;
      amount: number;
      expense_date: string;
      entry_type: "recurring";
      recurring_expense_id: number;
      generated_for_date: string;
    }> = [];

    recurringExpenses.forEach((recurringExpense) => {
      const recurringStartDate = parseDateOnly(recurringExpense.start_date);
      const recurringEndDate = recurringExpense.end_date
        ? parseDateOnly(recurringExpense.end_date)
        : today;

      const effectiveStartDate = maxDate(monthStartDate, recurringStartDate);
      const effectiveEndDate = minDate(today, recurringEndDate);

      if (effectiveStartDate > effectiveEndDate) return;

      const dueDates = buildDueDatesForRecurringExpense(
        recurringExpense,
        effectiveStartDate,
        effectiveEndDate
      );

      dueDates.forEach((dueDate) => {
        expensesToInsert.push({
          category_id: recurringExpense.category_id,
          description: recurringExpense.name,
          amount: recurringExpense.amount,
          expense_date: dueDate,
          entry_type: "recurring",
          recurring_expense_id: recurringExpense.id,
          generated_for_date: dueDate,
        });
      });
    });

    if (expensesToInsert.length === 0) {
      return { attempted: 0, created: 0 };
    }

    const { data, error } = await supabase
      .from("expenses")
      .upsert(expensesToInsert, {
        onConflict: "recurring_expense_id,generated_for_date",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      throw new Error(`Failed recurring catch-up posting: ${error.message}`);
    }

    return {
      attempted: expensesToInsert.length,
      created: data?.length || 0,
    };
  }
}
