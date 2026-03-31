import { useEffect, useMemo, useState } from "react";
import { Link } from "@remix-run/react";
import { CategoriesService } from "../libs/categories.services";
import { ExpensesService } from "../libs/expenses.services";
import { RecurringExpensesService } from "../libs/recurringExpenses.services";
import { RecurringIncomesService } from "../libs/recurringIncomes.services";
import { RecurringPostingService } from "../libs/recurringPosting.services";
import {
  buildCacheKey,
  CacheNamespaces,
  CacheTTL,
  clearCacheByPrefix,
  getCachedValue,
  setCachedValue,
} from "../libs/clientCache";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (amount) =>
  currencyFormatter.format(Number.isFinite(amount) ? amount : 0);

const dayOptions = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const monthOptions = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const toDateString = (dateValue) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCurrentMonthBounds = () => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: toDateString(startDate),
    endDate: toDateString(endDate),
  };
};

const defaultRecurringForm = {
  name: "",
  amount: "",
  frequency: "monthly",
  day_of_week: "1",
  day_of_month: "1",
  month_of_year: "1",
  start_date: toDateString(new Date()),
  end_date: "",
  notes: "",
};

const defaultIncomeForm = {
  name: "",
  amount: "",
  frequency: "monthly",
  day_of_week: "1",
  day_of_month: "1",
  day_of_month_secondary: "",
  month_of_year: "1",
  start_date: toDateString(new Date()),
  end_date: "",
  notes: "",
};

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : "Unexpected error";

const parseDateForDisplay = (dateValue) => {
  if (!dateValue) return null;
  if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsedDate = new Date(dateValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const formatDateForDisplay = (dateValue, fallback = "Not set") => {
  const parsedDate = parseDateForDisplay(dateValue);
  return parsedDate ? parsedDate.toLocaleDateString() : fallback;
};

const formatIncomeFrequency = (recurringIncome) => {
  if (recurringIncome.frequency !== "monthly") return recurringIncome.frequency;

  const monthlyDays = [
    recurringIncome.day_of_month,
    recurringIncome.day_of_month_secondary,
  ]
    .filter((dayValue) => Number.isInteger(dayValue))
    .sort((leftDay, rightDay) => leftDay - rightDay);

  if (monthlyDays.length === 0) return "monthly";
  if (monthlyDays.length === 1) return `monthly (${monthlyDays[0]})`;
  return `monthly (${monthlyDays[0]} & ${monthlyDays[1]})`;
};

const OVERVIEW_CACHE_KEY_BASE = `${CacheNamespaces.overview}:current-month`;
const buildOverviewCacheKey = () => {
  const { startDate, endDate } = getCurrentMonthBounds();
  return buildCacheKey(OVERVIEW_CACHE_KEY_BASE, {
    start_date: startDate,
    end_date: endDate,
  });
};

export default function Overview() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [categories, setCategories] = useState([]);
  const [variableExpensesThisMonth, setVariableExpensesThisMonth] = useState([]);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [recurringIncomes, setRecurringIncomes] = useState([]);

  const [recurringForm, setRecurringForm] = useState(defaultRecurringForm);
  const [incomeForm, setIncomeForm] = useState(defaultIncomeForm);
  const [recurringFormErrors, setRecurringFormErrors] = useState({});
  const [incomeFormErrors, setIncomeFormErrors] = useState({});
  const [editingRecurringExpenseId, setEditingRecurringExpenseId] = useState(null);
  const [editingRecurringIncomeId, setEditingRecurringIncomeId] = useState(null);
  const [isSavingRecurringExpense, setIsSavingRecurringExpense] = useState(false);
  const [isSavingRecurringIncome, setIsSavingRecurringIncome] = useState(false);
  const [showRecurringExpenseForm, setShowRecurringExpenseForm] = useState(false);
  const [showRecurringIncomeForm, setShowRecurringIncomeForm] = useState(false);

  const categoryById = useMemo(() => {
    return categories.reduce((map, category) => {
      map[category.id] = category;
      return map;
    }, {});
  }, [categories]);

  const monthLabel = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, []);

  const variableMonthlyTotal = useMemo(() => {
    return variableExpensesThisMonth.reduce(
      (total, expense) => total + Number(expense.amount || 0),
      0
    );
  }, [variableExpensesThisMonth]);

  const recurringMonthlyTotal = useMemo(() => {
    return RecurringExpensesService.calculateNormalizedMonthlyTotal(
      recurringExpenses,
      { activeOnly: true }
    );
  }, [recurringExpenses]);

  const incomeMonthlyTotal = useMemo(() => {
    return RecurringIncomesService.calculateNormalizedMonthlyTotal(
      recurringIncomes,
      { activeOnly: true }
    );
  }, [recurringIncomes]);

  const netMonthlyBalance = useMemo(() => {
    return incomeMonthlyTotal - recurringMonthlyTotal - variableMonthlyTotal;
  }, [incomeMonthlyTotal, recurringMonthlyTotal, variableMonthlyTotal]);

  const showStatusMessage = (message, type = "success") => {
    setStatusMessage({ message, type });
  };

  const applyOverviewSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (!Array.isArray(snapshot.categories)) return false;
    if (!Array.isArray(snapshot.recurringExpenses)) return false;
    if (!Array.isArray(snapshot.recurringIncomes)) return false;
    if (!Array.isArray(snapshot.variableExpensesThisMonth)) return false;

    setCategories(snapshot.categories);
    setRecurringExpenses(snapshot.recurringExpenses);
    setRecurringIncomes(snapshot.recurringIncomes);
    setVariableExpensesThisMonth(snapshot.variableExpensesThisMonth);
    return true;
  };

  const loadOverviewData = async ({
    withCatchup = false,
    preferCache = false,
    withRefreshIndicator = false,
  } = {}) => {
    const cacheKey = buildOverviewCacheKey();
    let hydratedFromCache = false;

    if (preferCache) {
      const cachedSnapshot = getCachedValue(cacheKey);
      hydratedFromCache = applyOverviewSnapshot(cachedSnapshot);
      if (hydratedFromCache) {
        setLoading(false);
      }
    }

    if (withRefreshIndicator) {
      setRefreshing(true);
    } else if (!hydratedFromCache) {
      const setLoadingState = loading ? setLoading : setRefreshing;
      setLoadingState(true);
    }

    try {
      if (withCatchup) {
        await RecurringPostingService.runCurrentMonthCatchup();
        clearCacheByPrefix(CacheNamespaces.overview);
      }

      const { startDate, endDate } = getCurrentMonthBounds();
      const [
        categoriesData,
        recurringExpensesData,
        recurringIncomesData,
        variableExpensesData,
      ] = await Promise.all([
        CategoriesService.getCategories(),
        RecurringExpensesService.getRecurringExpenses(),
        RecurringIncomesService.getRecurringIncomes(),
        ExpensesService.getExpenses({
          start_date: startDate,
          end_date: endDate,
          entry_type: "variable",
          limit: 5000,
          offset: 0,
        }),
      ]);

      const freshSnapshot = {
        categories: categoriesData,
        recurringExpenses: recurringExpensesData,
        recurringIncomes: recurringIncomesData,
        variableExpensesThisMonth: variableExpensesData,
      };

      applyOverviewSnapshot(freshSnapshot);
      setCachedValue(cacheKey, freshSnapshot, CacheTTL.short);
    } catch (error) {
      console.error("Failed to load overview data:", error);
      showStatusMessage(`Failed to load data: ${getErrorMessage(error)}`, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOverviewData({ withCatchup: true, preferCache: true });
  }, []);

  const validateRecurringForm = () => {
    const errors = {};
    if (!recurringForm.name.trim()) {
      errors.name = "Name is required.";
    }

    const amount = Number(recurringForm.amount);
    if (recurringForm.amount === "") {
      errors.amount = "Amount is required.";
    } else if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Amount must be greater than 0.";
    }

    if (!recurringForm.start_date) {
      errors.start_date = "Start date is required.";
    }

    if (recurringForm.frequency === "weekly" && recurringForm.day_of_week === "") {
      errors.day_of_week = "Day of week is required.";
    }

    if (
      (recurringForm.frequency === "monthly" || recurringForm.frequency === "yearly") &&
      recurringForm.day_of_month === ""
    ) {
      errors.day_of_month = "Day of month is required.";
    }

    if (recurringForm.frequency === "yearly" && recurringForm.month_of_year === "") {
      errors.month_of_year = "Month is required.";
    }

    setRecurringFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateIncomeForm = () => {
    const errors = {};
    if (!incomeForm.name.trim()) {
      errors.name = "Name is required.";
    }

    const amount = Number(incomeForm.amount);
    if (incomeForm.amount === "") {
      errors.amount = "Amount is required.";
    } else if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Amount must be greater than 0.";
    }

    if (!incomeForm.start_date) {
      errors.start_date = "Start date is required.";
    }

    if (incomeForm.frequency === "weekly" && incomeForm.day_of_week === "") {
      errors.day_of_week = "Day of week is required.";
    }

    if (
      (incomeForm.frequency === "monthly" || incomeForm.frequency === "yearly") &&
      incomeForm.day_of_month === ""
    ) {
      errors.day_of_month = "Day of month is required.";
    }

    if (
      incomeForm.frequency === "monthly" &&
      incomeForm.day_of_month_secondary !== "" &&
      incomeForm.day_of_month_secondary === incomeForm.day_of_month
    ) {
      errors.day_of_month_secondary = "Second day must be different from first day.";
    }

    if (incomeForm.frequency === "yearly" && incomeForm.month_of_year === "") {
      errors.month_of_year = "Month is required.";
    }

    setIncomeFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildRecurringExpensePayload = () => ({
    name: recurringForm.name.trim(),
    amount: Number(recurringForm.amount),
    frequency: recurringForm.frequency,
    day_of_week: recurringForm.frequency === "weekly" ? Number(recurringForm.day_of_week) : null,
    day_of_month:
      recurringForm.frequency === "monthly" || recurringForm.frequency === "yearly"
        ? Number(recurringForm.day_of_month)
        : null,
    month_of_year:
      recurringForm.frequency === "yearly" ? Number(recurringForm.month_of_year) : null,
    start_date: recurringForm.start_date,
    end_date: recurringForm.end_date || null,
    notes: recurringForm.notes.trim() || null,
  });

  const buildRecurringIncomePayload = () => ({
    name: incomeForm.name.trim(),
    amount: Number(incomeForm.amount),
    frequency: incomeForm.frequency,
    day_of_week: incomeForm.frequency === "weekly" ? Number(incomeForm.day_of_week) : null,
    day_of_month:
      incomeForm.frequency === "monthly" || incomeForm.frequency === "yearly"
        ? Number(incomeForm.day_of_month)
        : null,
    day_of_month_secondary:
      incomeForm.frequency === "monthly" && incomeForm.day_of_month_secondary !== ""
        ? Number(incomeForm.day_of_month_secondary)
        : null,
    month_of_year: incomeForm.frequency === "yearly" ? Number(incomeForm.month_of_year) : null,
    start_date: incomeForm.start_date,
    end_date: incomeForm.end_date || null,
    notes: incomeForm.notes.trim() || null,
  });

  const resetRecurringForm = () => {
    setRecurringForm(defaultRecurringForm);
    setRecurringFormErrors({});
    setEditingRecurringExpenseId(null);
  };

  const resetIncomeForm = () => {
    setIncomeForm(defaultIncomeForm);
    setIncomeFormErrors({});
    setEditingRecurringIncomeId(null);
  };

  const handleToggleRecurringExpenseForm = () => {
    if (showRecurringExpenseForm && editingRecurringExpenseId) {
      resetRecurringForm();
    }
    setShowRecurringExpenseForm((isOpen) => !isOpen);
  };

  const handleToggleRecurringIncomeForm = () => {
    if (showRecurringIncomeForm && editingRecurringIncomeId) {
      resetIncomeForm();
    }
    setShowRecurringIncomeForm((isOpen) => !isOpen);
  };

  const handleSaveRecurringExpense = async (event) => {
    event.preventDefault();
    if (isSavingRecurringExpense) return;
    if (!validateRecurringForm()) return;

    setIsSavingRecurringExpense(true);
    try {
      const payload = buildRecurringExpensePayload();
      if (editingRecurringExpenseId) {
        await RecurringExpensesService.updateRecurringExpense(editingRecurringExpenseId, payload);
        showStatusMessage("Recurring expense updated.");
      } else {
        await RecurringExpensesService.createRecurringExpense(payload);
        showStatusMessage("Recurring expense created.");
      }
      resetRecurringForm();
      await loadOverviewData();
    } catch (error) {
      console.error("Failed to save recurring expense:", error);
      showStatusMessage(`Failed to save recurring expense: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsSavingRecurringExpense(false);
    }
  };

  const handleSaveRecurringIncome = async (event) => {
    event.preventDefault();
    if (isSavingRecurringIncome) return;
    if (!validateIncomeForm()) return;

    setIsSavingRecurringIncome(true);
    try {
      const payload = buildRecurringIncomePayload();
      if (editingRecurringIncomeId) {
        await RecurringIncomesService.updateRecurringIncome(editingRecurringIncomeId, payload);
        showStatusMessage("Recurring income updated.");
      } else {
        await RecurringIncomesService.createRecurringIncome(payload);
        showStatusMessage("Recurring income created.");
      }
      resetIncomeForm();
      await loadOverviewData();
    } catch (error) {
      console.error("Failed to save recurring income:", error);
      showStatusMessage(`Failed to save recurring income: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsSavingRecurringIncome(false);
    }
  };

  const handleEditRecurringExpense = (recurringExpense) => {
    setShowRecurringExpenseForm(true);
    setEditingRecurringExpenseId(recurringExpense.id);
    setRecurringFormErrors({});
    setRecurringForm({
      name: recurringExpense.name || "",
      amount: String(recurringExpense.amount ?? ""),
      frequency: recurringExpense.frequency || "monthly",
      day_of_week:
        recurringExpense.day_of_week === null ? "" : String(recurringExpense.day_of_week),
      day_of_month:
        recurringExpense.day_of_month === null ? "" : String(recurringExpense.day_of_month),
      month_of_year:
        recurringExpense.month_of_year === null ? "" : String(recurringExpense.month_of_year),
      start_date: recurringExpense.start_date || toDateString(new Date()),
      end_date: recurringExpense.end_date || "",
      notes: recurringExpense.notes || "",
    });
  };

  const handleEditRecurringIncome = (recurringIncome) => {
    setShowRecurringIncomeForm(true);
    setEditingRecurringIncomeId(recurringIncome.id);
    setIncomeFormErrors({});
    setIncomeForm({
      name: recurringIncome.name || "",
      amount: String(recurringIncome.amount ?? ""),
      frequency: recurringIncome.frequency || "monthly",
      day_of_week:
        recurringIncome.day_of_week === null ? "" : String(recurringIncome.day_of_week),
      day_of_month:
        recurringIncome.day_of_month === null ? "" : String(recurringIncome.day_of_month),
      day_of_month_secondary:
        recurringIncome.day_of_month_secondary == null
          ? ""
          : String(recurringIncome.day_of_month_secondary),
      month_of_year:
        recurringIncome.month_of_year === null ? "" : String(recurringIncome.month_of_year),
      start_date: recurringIncome.start_date || toDateString(new Date()),
      end_date: recurringIncome.end_date || "",
      notes: recurringIncome.notes || "",
    });
  };

  const handleToggleRecurringExpenseStatus = async (recurringExpense) => {
    try {
      if (recurringExpense.status === "active") {
        await RecurringExpensesService.pauseRecurringExpense(recurringExpense.id);
        showStatusMessage("Recurring expense paused.");
      } else {
        await RecurringExpensesService.resumeRecurringExpense(recurringExpense.id);
        showStatusMessage("Recurring expense resumed.");
      }
      await loadOverviewData();
    } catch (error) {
      console.error("Failed to toggle recurring expense status:", error);
      showStatusMessage(`Failed to update recurring expense: ${getErrorMessage(error)}`, "error");
    }
  };

  const handleToggleRecurringIncomeStatus = async (recurringIncome) => {
    try {
      if (recurringIncome.status === "active") {
        await RecurringIncomesService.pauseRecurringIncome(recurringIncome.id);
        showStatusMessage("Recurring income paused.");
      } else {
        await RecurringIncomesService.resumeRecurringIncome(recurringIncome.id);
        showStatusMessage("Recurring income resumed.");
      }
      await loadOverviewData();
    } catch (error) {
      console.error("Failed to toggle recurring income status:", error);
      showStatusMessage(`Failed to update recurring income: ${getErrorMessage(error)}`, "error");
    }
  };

  const handleDeleteRecurringExpense = async (recurringExpenseId) => {
    if (!window.confirm("Delete this recurring expense?")) return;
    try {
      await RecurringExpensesService.deleteRecurringExpense(recurringExpenseId);
      if (editingRecurringExpenseId === recurringExpenseId) {
        resetRecurringForm();
      }
      showStatusMessage("Recurring expense deleted.");
      await loadOverviewData();
    } catch (error) {
      console.error("Failed to delete recurring expense:", error);
      showStatusMessage(`Failed to delete recurring expense: ${getErrorMessage(error)}`, "error");
    }
  };

  const handleDeleteRecurringIncome = async (recurringIncomeId) => {
    if (!window.confirm("Delete this recurring income?")) return;
    try {
      await RecurringIncomesService.deleteRecurringIncome(recurringIncomeId);
      if (editingRecurringIncomeId === recurringIncomeId) {
        resetIncomeForm();
      }
      showStatusMessage("Recurring income deleted.");
      await loadOverviewData();
    } catch (error) {
      console.error("Failed to delete recurring income:", error);
      showStatusMessage(`Failed to delete recurring income: ${getErrorMessage(error)}`, "error");
    }
  };

  const handleRunCatchupNow = async () => {
    setRefreshing(true);
    try {
      const result = await RecurringPostingService.runCurrentMonthCatchup();
      await loadOverviewData();
      showStatusMessage(
        result.created > 0
          ? `Posted ${result.created} recurring expense${result.created === 1 ? "" : "s"}.`
          : "No new recurring expenses were due."
      );
    } catch (error) {
      console.error("Failed recurring catch-up run:", error);
      showStatusMessage(`Failed recurring catch-up: ${getErrorMessage(error)}`, "error");
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-3 sm:space-y-4">
        <header className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 leading-tight">
                Financial Overview
              </h1>
              <p className="text-sm text-gray-600 mt-1">{monthLabel}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRunCatchupNow}
                disabled={refreshing || loading}
                className="w-9 h-9 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 flex items-center justify-center"
                aria-label={refreshing ? "Syncing recurring payments" : "Sync recurring payments"}
                title={refreshing ? "Syncing recurring payments" : "Sync recurring payments"}
              >
                {refreshing ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.5 9A7 7 0 0119 12.5M18.5 15A7 7 0 015 11.5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M5.5 9A7 7 0 0119 12.5M18.5 15A7 7 0 015 11.5" />
                  </svg>
                )}
              </button>
              <Link
                to="/notifications"
                className="w-9 h-9 rounded-md border border-gray-300 bg-white text-gray-700 flex items-center justify-center"
                aria-label="Open notifications"
                title="Notifications"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.03 2.03 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
                  />
                </svg>
              </Link>
              <Link
                to="/"
                className="w-9 h-9 rounded-md border border-blue-300 bg-blue-50 text-blue-700 flex items-center justify-center"
                aria-label="Back to home"
                title="Back to home"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            <a href="#variable" className="px-2 py-1.5 rounded-md bg-gray-100 text-gray-700 text-sm text-center">
              Variable
            </a>
            <a href="#recurring" className="px-2 py-1.5 rounded-md bg-gray-100 text-gray-700 text-sm text-center">
              Recurring
            </a>
            <a href="#income" className="px-2 py-1.5 rounded-md bg-gray-100 text-gray-700 text-sm text-center">
              Income
            </a>
          </div>
        </header>

        {statusMessage && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              statusMessage.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {statusMessage.message}
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Variable (Month)</p>
            <p className="text-lg sm:text-xl font-semibold text-gray-900 mt-1 leading-tight">
              {formatCurrency(variableMonthlyTotal)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Recurring (Monthly Eq.)</p>
            <p className="text-lg sm:text-xl font-semibold text-gray-900 mt-1 leading-tight">
              {formatCurrency(recurringMonthlyTotal)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Income (Monthly Eq.)</p>
            <p className="text-lg sm:text-xl font-semibold text-gray-900 mt-1 leading-tight">
              {formatCurrency(incomeMonthlyTotal)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Net Monthly Balance</p>
            <p
              className={`text-lg sm:text-xl font-semibold mt-1 leading-tight ${
                netMonthlyBalance >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {formatCurrency(netMonthlyBalance)}
            </p>
          </div>
        </section>

        <section id="variable" className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Variable Expenses</h2>
            <span className="text-sm text-gray-500">
              {variableExpensesThisMonth.length} this month
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-gray-600">Loading variable expenses...</p>
          ) : variableExpensesThisMonth.length === 0 ? (
            <p className="text-sm text-gray-600">No variable expenses this month yet.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {variableExpensesThisMonth.slice(0, 25).map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-2 text-sm"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-medium text-gray-800 truncate">{expense.description}</p>
                    <p className="text-xs text-gray-500">
                      {formatDateForDisplay(expense.expense_date)} ·{" "}
                      {categoryById[expense.category_id]?.name || "Unknown Category"}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">{formatCurrency(expense.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section id="recurring" className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Recurring Expenses</h2>
              <span className="text-sm text-gray-500">
                Monthly equivalent: {formatCurrency(recurringMonthlyTotal)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleRecurringExpenseForm}
              className={`w-7 h-7 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                showRecurringExpenseForm
                  ? "bg-green-100 text-green-700 border-green-300"
                  : "bg-white border-green-500 text-green-700 hover:bg-green-50"
              }`}
              title={showRecurringExpenseForm ? "Close recurring form" : "Open recurring form"}
              aria-label={showRecurringExpenseForm ? "Close recurring form" : "Open recurring form"}
            >
              {showRecurringExpenseForm ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          </div>

          {showRecurringExpenseForm && (
            <>
              <form
                onSubmit={handleSaveRecurringExpense}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4"
              >
                <label className="text-xs text-gray-600">
                  Name
                  <input
                    type="text"
                    placeholder="Mortgage, Wi-Fi..."
                    value={recurringForm.name}
                    onChange={(event) =>
                      setRecurringForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={recurringForm.amount}
                    onChange={(event) =>
                      setRecurringForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Frequency
                  <select
                    value={recurringForm.frequency}
                    onChange={(event) =>
                      setRecurringForm((current) => ({
                        ...current,
                        frequency: event.target.value,
                      }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>

                {recurringForm.frequency === "weekly" && (
                  <label className="text-xs text-gray-600">
                    Day of week
                    <select
                      value={recurringForm.day_of_week}
                      onChange={(event) =>
                        setRecurringForm((current) => ({
                          ...current,
                          day_of_week: event.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      {dayOptions.map((dayOption) => (
                        <option key={dayOption.value} value={dayOption.value}>
                          {dayOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {(recurringForm.frequency === "monthly" ||
                  recurringForm.frequency === "yearly") && (
                  <label className="text-xs text-gray-600">
                    Day of month
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="1-31"
                      value={recurringForm.day_of_month}
                      onChange={(event) =>
                        setRecurringForm((current) => ({
                          ...current,
                          day_of_month: event.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </label>
                )}

                {recurringForm.frequency === "yearly" && (
                  <label className="text-xs text-gray-600">
                    Month
                    <select
                      value={recurringForm.month_of_year}
                      onChange={(event) =>
                        setRecurringForm((current) => ({
                          ...current,
                          month_of_year: event.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      {monthOptions.map((monthOption) => (
                        <option key={monthOption.value} value={monthOption.value}>
                          {monthOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="text-xs text-gray-600">
                  Start on
                  <input
                    type="date"
                    value={recurringForm.start_date}
                    onChange={(event) =>
                      setRecurringForm((current) => ({ ...current, start_date: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">
                    First date this can be posted.
                  </span>
                </label>
                <label className="text-xs text-gray-600">
                  Stop on (optional)
                  <input
                    type="date"
                    value={recurringForm.end_date}
                    onChange={(event) =>
                      setRecurringForm((current) => ({ ...current, end_date: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">
                    Leave blank to keep this ongoing.
                  </span>
                </label>
                <label className="text-xs text-gray-600 lg:col-span-2">
                  Notes (optional)
                  <input
                    type="text"
                    placeholder="Optional notes"
                    value={recurringForm.notes}
                    onChange={(event) =>
                      setRecurringForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </label>

                <div className="flex gap-2 items-end">
                  <button
                    type="submit"
                    disabled={isSavingRecurringExpense}
                    className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium disabled:bg-blue-300"
                  >
                    {isSavingRecurringExpense
                      ? "Saving..."
                      : editingRecurringExpenseId
                        ? "Update"
                        : "Add"}
                  </button>
                  {editingRecurringExpenseId && (
                    <button
                      type="button"
                      onClick={resetRecurringForm}
                      className="px-3 py-2 rounded-md bg-gray-200 text-gray-700 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {Object.keys(recurringFormErrors).length > 0 && (
                <div className="mb-3 text-xs text-red-600 space-y-1">
                  {Object.values(recurringFormErrors).map((errorMessage) => (
                    <p key={errorMessage}>{errorMessage}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {recurringExpenses.length === 0 ? (
            <p className="text-sm text-gray-600">No recurring expenses yet.</p>
          ) : (
            <div className="space-y-1">
              {recurringExpenses.map((recurringExpense) => (
                <div
                  key={recurringExpense.id}
                  className="rounded-md border border-gray-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {recurringExpense.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {recurringExpense.frequency} ·{" "}
                        {recurringExpense.status === "active" ? "Active" : "Paused"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Starts {formatDateForDisplay(recurringExpense.start_date)} ·{" "}
                        {recurringExpense.end_date
                          ? `Stops ${formatDateForDisplay(recurringExpense.end_date)}`
                          : "No stop date"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(recurringExpense.amount)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditRecurringExpense(recurringExpense)}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 bg-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleRecurringExpenseStatus(recurringExpense)}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 bg-white"
                    >
                      {recurringExpense.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRecurringExpense(recurringExpense.id)}
                      className="px-2 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </section>

        <section id="income" className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">Recurring Income</h2>
              <span className="text-sm text-gray-500">
                Monthly equivalent: {formatCurrency(incomeMonthlyTotal)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleRecurringIncomeForm}
              className={`w-7 h-7 rounded-md border flex items-center justify-center transition-colors shrink-0 ${
                showRecurringIncomeForm
                  ? "bg-green-100 text-green-700 border-green-300"
                  : "bg-white border-green-500 text-green-700 hover:bg-green-50"
              }`}
              title={showRecurringIncomeForm ? "Close income form" : "Open income form"}
              aria-label={showRecurringIncomeForm ? "Close income form" : "Open income form"}
            >
              {showRecurringIncomeForm ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          </div>

          {showRecurringIncomeForm && (
            <>
              <form
                onSubmit={handleSaveRecurringIncome}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4"
              >
                <label className="text-xs text-gray-600">
                  Name
                  <input
                    type="text"
                    placeholder="Salary, Side gig..."
                    value={incomeForm.name}
                    onChange={(event) =>
                      setIncomeForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={incomeForm.amount}
                    onChange={(event) =>
                      setIncomeForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Frequency
                  <select
                    value={incomeForm.frequency}
                    onChange={(event) =>
                      setIncomeForm((current) => ({
                        ...current,
                        frequency: event.target.value,
                      }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>

                {incomeForm.frequency === "weekly" && (
                  <label className="text-xs text-gray-600">
                    Day of week
                    <select
                      value={incomeForm.day_of_week}
                      onChange={(event) =>
                        setIncomeForm((current) => ({
                          ...current,
                          day_of_week: event.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      {dayOptions.map((dayOption) => (
                        <option key={dayOption.value} value={dayOption.value}>
                          {dayOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {incomeForm.frequency === "monthly" && (
                  <>
                    <label className="text-xs text-gray-600">
                      First payday (day of month)
                      <input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="1-31"
                        value={incomeForm.day_of_month}
                        onChange={(event) =>
                          setIncomeForm((current) => ({
                            ...current,
                            day_of_month: event.target.value,
                          }))
                        }
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Second payday (optional)
                      <input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="e.g. 15"
                        value={incomeForm.day_of_month_secondary}
                        onChange={(event) =>
                          setIncomeForm((current) => ({
                            ...current,
                            day_of_month_secondary: event.target.value,
                          }))
                        }
                        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </label>
                  </>
                )}

                {incomeForm.frequency === "yearly" && (
                  <label className="text-xs text-gray-600">
                    Day of month
                    <input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="1-31"
                      value={incomeForm.day_of_month}
                      onChange={(event) =>
                        setIncomeForm((current) => ({
                          ...current,
                          day_of_month: event.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </label>
                )}

                {incomeForm.frequency === "yearly" && (
                  <label className="text-xs text-gray-600">
                    Month
                    <select
                      value={incomeForm.month_of_year}
                      onChange={(event) =>
                        setIncomeForm((current) => ({
                          ...current,
                          month_of_year: event.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      {monthOptions.map((monthOption) => (
                        <option key={monthOption.value} value={monthOption.value}>
                          {monthOption.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="text-xs text-gray-600">
                  Start on
                  <input
                    type="date"
                    value={incomeForm.start_date}
                    onChange={(event) =>
                      setIncomeForm((current) => ({ ...current, start_date: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">
                    First date this can be counted.
                  </span>
                </label>
                <label className="text-xs text-gray-600">
                  Stop on (optional)
                  <input
                    type="date"
                    value={incomeForm.end_date}
                    onChange={(event) =>
                      setIncomeForm((current) => ({ ...current, end_date: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-gray-500">
                    Leave blank to keep this ongoing.
                  </span>
                </label>
                <label className="text-xs text-gray-600 lg:col-span-2">
                  Notes (optional)
                  <input
                    type="text"
                    placeholder="Optional notes"
                    value={incomeForm.notes}
                    onChange={(event) =>
                      setIncomeForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </label>

                <div className="flex gap-2 items-end">
                  <button
                    type="submit"
                    disabled={isSavingRecurringIncome}
                    className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium disabled:bg-blue-300"
                  >
                    {isSavingRecurringIncome
                      ? "Saving..."
                      : editingRecurringIncomeId
                        ? "Update"
                        : "Add"}
                  </button>
                  {editingRecurringIncomeId && (
                    <button
                      type="button"
                      onClick={resetIncomeForm}
                      className="px-3 py-2 rounded-md bg-gray-200 text-gray-700 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              {Object.keys(incomeFormErrors).length > 0 && (
                <div className="mb-3 text-xs text-red-600 space-y-1">
                  {Object.values(incomeFormErrors).map((errorMessage) => (
                    <p key={errorMessage}>{errorMessage}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {recurringIncomes.length === 0 ? (
            <p className="text-sm text-gray-600">No recurring income items yet.</p>
          ) : (
            <div className="space-y-1">
              {recurringIncomes.map((recurringIncome) => (
                <div key={recurringIncome.id} className="rounded-md border border-gray-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {recurringIncome.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatIncomeFrequency(recurringIncome)} ·{" "}
                        {recurringIncome.status === "active" ? "Active" : "Paused"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Starts {formatDateForDisplay(recurringIncome.start_date)} ·{" "}
                        {recurringIncome.end_date
                          ? `Stops ${formatDateForDisplay(recurringIncome.end_date)}`
                          : "No stop date"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(recurringIncome.amount)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditRecurringIncome(recurringIncome)}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 bg-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleRecurringIncomeStatus(recurringIncome)}
                      className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 bg-white"
                    >
                      {recurringIncome.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRecurringIncome(recurringIncome.id)}
                      className="px-2 py-1 text-xs rounded-md border border-red-300 text-red-700 bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
