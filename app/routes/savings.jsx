import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@remix-run/react";
import { CategorySavingsService } from "../libs/categorySavings.services";
import { ExpensesService } from "../libs/expenses.services";
import {
  buildCacheKey,
  CacheNamespaces,
  CacheTTL,
  clearCacheByPrefix,
  getCachedValue,
  removeCachedValue,
  setCachedValue,
} from "../libs/clientCache";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (amount) =>
  currencyFormatter.format(Number.isFinite(Number(amount)) ? Number(amount) : 0);

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : "Unexpected error";

const toDateString = (dateValue) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

const getMonthLabel = (monthStart) => {
  const parsedDate = parseDateForDisplay(monthStart);
  if (!parsedDate) return monthStart;
  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
};

const sortExpensesNewestFirst = (expenses) =>
  [...expenses].sort((leftExpense, rightExpense) => {
    const leftDate = `${leftExpense.expense_date || ""} ${leftExpense.created_at || ""}`;
    const rightDate = `${rightExpense.expense_date || ""} ${rightExpense.created_at || ""}`;
    return rightDate.localeCompare(leftDate);
  });

const getRelatedCategory = (rollover) => {
  if (!rollover) return null;
  if (Array.isArray(rollover.categories)) return rollover.categories[0] || null;
  return rollover.categories || null;
};

const getDefaultCorrectionForm = (rollover) => ({
  amount: "",
  description: "",
  date: rollover.month_end,
});

const getCorrectionFormErrors = (rollover, form) => {
  const validationErrors = {};
  const parsedAmount = Number(form.amount);

  if (form.amount === "") {
    validationErrors.amount = "Amount is required.";
  } else if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    validationErrors.amount = "Amount must be greater than 0.";
  }

  if (!form.date) {
    validationErrors.date = "Date is required.";
  } else if (form.date < rollover.month_start || form.date > rollover.month_end) {
    validationErrors.date = `Date must be between ${formatDateForDisplay(
      rollover.month_start
    )} and ${formatDateForDisplay(rollover.month_end)}.`;
  }

  if ((form.description || "").trim().length > 500) {
    validationErrors.description = "Note must be 500 characters or fewer.";
  }

  return validationErrors;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SAVINGS_CACHE_KEY_BASE = `${CacheNamespaces.savings}:dashboard`;
const HOME_EXPENSES_CACHE_PREFIX = `${CacheNamespaces.home}:expenses`;
const HOME_PENDING_SAVINGS_COUNT_CACHE_KEY = `${CacheNamespaces.home}:pending-savings-count`;

function ModalFrame({
  children,
  onClose,
  titleId,
  maxWidth = "max-w-md",
  zIndex = "z-50",
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const getFocusableElements = () =>
      Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));

    const focusableElements = getFocusableElements();
    const preferredFocus =
      focusableElements.find((element) => element.hasAttribute("autofocus")) ||
      focusableElements[0] ||
      panel;
    preferredFocus.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      const modalPanels = Array.from(
        document.querySelectorAll('[data-modal-frame="true"]')
      );
      const topMostPanel = modalPanels[modalPanels.length - 1];
      if (topMostPanel !== panel) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4 ${zIndex}`}>
      <div
        ref={panelRef}
        data-modal-frame="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-lg p-4 sm:p-6 w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}
      >
        {children}
      </div>
    </div>
  );
}

function EditMonthExpenseModal({
  expense,
  rollover,
  isSubmitting,
  onSubmit,
  onCancel,
}) {
  const [formData, setFormData] = useState({
    description: expense.description || "",
    amount: String(expense.amount ?? ""),
    date: expense.expense_date ? String(expense.expense_date).slice(0, 10) : toDateString(new Date()),
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = (event) => {
    event.preventDefault();
    const validationErrors = {};
    const parsedAmount = Number(formData.amount);

    if (formData.amount === "") {
      validationErrors.amount = "Amount is required.";
    } else if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      validationErrors.amount = "Amount must be greater than 0.";
    }

    if (!formData.date) {
      validationErrors.date = "Date is required.";
    } else if (
      formData.date < rollover.month_start ||
      formData.date > rollover.month_end
    ) {
      validationErrors.date = `Date must be between ${formatDateForDisplay(
        rollover.month_start
      )} and ${formatDateForDisplay(rollover.month_end)}.`;
    }

    if ((formData.description || "").trim().length > 500) {
      validationErrors.description = "Note must be 500 characters or fewer.";
    }

    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    onSubmit({
      description: (formData.description || "").trim() || "Expense",
      amount: Number(formData.amount),
      date: formData.date,
    });
  };

  return (
    <ModalFrame onClose={onCancel} titleId="edit-month-expense-title">
      <h2 id="edit-month-expense-title" className="text-lg font-semibold mb-4 text-gray-900">
        Edit Expense
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <label className="block text-sm text-gray-700">
          Amount
          <input
            type="number"
            autoFocus
            min="0.01"
            step="0.01"
            value={formData.amount}
            onChange={(event) =>
              setFormData((current) => ({ ...current, amount: event.target.value }))
            }
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
        </label>
        <label className="block text-sm text-gray-700">
          Date
          <input
            type="date"
            value={formData.date}
            onChange={(event) =>
              setFormData((current) => ({ ...current, date: event.target.value }))
            }
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
        </label>
        <label className="block text-sm text-gray-700">
          Note
          <input
            type="text"
            maxLength={500}
            value={formData.description}
            onChange={(event) =>
              setFormData((current) => ({ ...current, description: event.target.value }))
            }
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-600">{errors.description}</p>
          )}
        </label>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-blue-600 text-white py-2 text-sm font-medium disabled:bg-blue-300"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 rounded-md bg-gray-200 text-gray-700 py-2 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export default function Savings() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [balances, setBalances] = useState([]);
  const [pendingRollovers, setPendingRollovers] = useState([]);
  const [confirmedRollovers, setConfirmedRollovers] = useState([]);
  const [openRolloverId, setOpenRolloverId] = useState(null);
  const [monthExpensesByRollover, setMonthExpensesByRollover] = useState({});
  const [loadingMonthExpensesId, setLoadingMonthExpensesId] = useState(null);
  const [correctionForms, setCorrectionForms] = useState({});
  const [correctionErrors, setCorrectionErrors] = useState({});
  const [isSavingCorrectionExpense, setIsSavingCorrectionExpense] = useState(false);
  const [isConfirmingRolloverId, setIsConfirmingRolloverId] = useState(null);
  const [isDeletingRolloverId, setIsDeletingRolloverId] = useState(null);
  const [isDeletingExpenseId, setIsDeletingExpenseId] = useState(null);
  const [editingExpenseContext, setEditingExpenseContext] = useState(null);
  const [isUpdatingExpense, setIsUpdatingExpense] = useState(false);

  const showStatusMessage = (message, type = "success") => {
    setStatusMessage({ message, type });
  };

  const totalBalance = useMemo(() => {
    return balances.reduce(
      (totalAmount, balanceEntry) => totalAmount + Number(balanceEntry.balance || 0),
      0
    );
  }, [balances]);

  const pendingTotal = useMemo(() => {
    return pendingRollovers.reduce(
      (totalAmount, rollover) => totalAmount + Number(rollover.rollover_amount || 0),
      0
    );
  }, [pendingRollovers]);

  const invalidateSavingsRelatedCaches = () => {
    clearCacheByPrefix(CacheNamespaces.savings);
    clearCacheByPrefix(CacheNamespaces.overview);
    clearCacheByPrefix(HOME_EXPENSES_CACHE_PREFIX);
    removeCachedValue(HOME_PENDING_SAVINGS_COUNT_CACHE_KEY);
  };

  const applySavingsSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (!Array.isArray(snapshot.balances)) return false;
    if (!Array.isArray(snapshot.pendingRollovers)) return false;
    if (!Array.isArray(snapshot.confirmedRollovers)) return false;

    setBalances(snapshot.balances);
    setPendingRollovers(snapshot.pendingRollovers);
    setConfirmedRollovers(snapshot.confirmedRollovers);
    return true;
  };

  const loadSavingsData = async ({
    withCatchup = false,
    preferCache = false,
    withRefreshIndicator = false,
  } = {}) => {
    const cacheKey = buildCacheKey(SAVINGS_CACHE_KEY_BASE, { history_limit: 60 });
    let hydratedFromCache = false;

    if (preferCache) {
      const cachedSnapshot = getCachedValue(cacheKey);
      hydratedFromCache = applySavingsSnapshot(cachedSnapshot);
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
        await CategorySavingsService.runPendingCatchup();
        clearCacheByPrefix(CacheNamespaces.savings);
      }

      const [balanceData, pendingData, confirmedData] = await Promise.all([
        CategorySavingsService.getCategorySavingsBalances(),
        CategorySavingsService.getPendingRollovers(),
        CategorySavingsService.getConfirmedRollovers(60),
      ]);

      const freshSnapshot = {
        balances: balanceData,
        pendingRollovers: pendingData,
        confirmedRollovers: confirmedData,
      };

      applySavingsSnapshot(freshSnapshot);
      setCachedValue(cacheKey, freshSnapshot, CacheTTL.short);
    } catch (error) {
      console.error("Failed to load savings data:", error);
      showStatusMessage(`Failed to load savings data: ${getErrorMessage(error)}`, "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSavingsData({ withCatchup: true, preferCache: true });
  }, []);

  useEffect(() => {
    if (!openRolloverId) return;
    const stillExists = pendingRollovers.some((rollover) => rollover.id === openRolloverId);
    if (!stillExists) {
      setOpenRolloverId(null);
    }
  }, [openRolloverId, pendingRollovers]);

  const loadMonthExpensesForRollover = async (rollover) => {
    setLoadingMonthExpensesId(rollover.id);
    try {
      const monthExpenses = await CategorySavingsService.getVariableExpensesForMonth(
        rollover.category_id,
        rollover.month_start,
        rollover.month_end
      );
      setMonthExpensesByRollover((currentMap) => ({
        ...currentMap,
        [rollover.id]: sortExpensesNewestFirst(monthExpenses),
      }));
    } catch (error) {
      console.error("Failed to load month expenses:", error);
      showStatusMessage(`Failed to load month expenses: ${getErrorMessage(error)}`, "error");
    } finally {
      setLoadingMonthExpensesId(null);
    }
  };

  const openCorrectionsForRollover = async (rollover, options = {}) => {
    const { forceReload = false } = options;
    setOpenRolloverId(rollover.id);
    setCorrectionForms((currentForms) => {
      if (currentForms[rollover.id]) return currentForms;
      return {
        ...currentForms,
        [rollover.id]: getDefaultCorrectionForm(rollover),
      };
    });

    if (forceReload || !monthExpensesByRollover[rollover.id]) {
      await loadMonthExpensesForRollover(rollover);
    }
  };

  const handleToggleCorrections = async (rollover) => {
    if (openRolloverId === rollover.id) {
      setOpenRolloverId(null);
      return;
    }

    await openCorrectionsForRollover(rollover);
  };

  const handleCorrectionFormChange = (rolloverId, patch) => {
    setCorrectionForms((currentForms) => ({
      ...currentForms,
      [rolloverId]: {
        ...(currentForms[rolloverId] || {}),
        ...patch,
      },
    }));
  };

  const handleAddCorrectionExpense = async (event, rollover) => {
    event.preventDefault();
    if (isSavingCorrectionExpense) return;

    const correctionForm = correctionForms[rollover.id] || getDefaultCorrectionForm(rollover);
    const validationErrors = getCorrectionFormErrors(rollover, correctionForm);
    if (Object.keys(validationErrors).length > 0) {
      setCorrectionErrors((currentErrors) => ({
        ...currentErrors,
        [rollover.id]: validationErrors,
      }));
      return;
    }

    setIsSavingCorrectionExpense(true);
    try {
      await ExpensesService.createExpense({
        category_id: rollover.category_id,
        description: (correctionForm.description || "").trim() || "Expense",
        amount: Number(correctionForm.amount),
        expense_date: correctionForm.date,
        entry_type: "variable",
      });

      showStatusMessage("Expense added for savings correction.");
      setCorrectionForms((currentForms) => ({
        ...currentForms,
        [rollover.id]: {
          amount: "",
          description: correctionForm.description || "",
          date: rollover.month_end,
        },
      }));
      setCorrectionErrors((currentErrors) => ({
        ...currentErrors,
        [rollover.id]: {},
      }));

      invalidateSavingsRelatedCaches();
      await loadSavingsData({ withCatchup: true });
      await openCorrectionsForRollover(rollover, { forceReload: true });
    } catch (error) {
      console.error("Failed to add correction expense:", error);
      showStatusMessage(
        `Failed to add correction expense: ${getErrorMessage(error)}`,
        "error"
      );
    } finally {
      setIsSavingCorrectionExpense(false);
    }
  };

  const handleDeleteMonthExpense = async (rollover, expense) => {
    if (!window.confirm("Delete this expense?")) return;
    if (isDeletingExpenseId) return;

    setIsDeletingExpenseId(expense.id);
    try {
      await ExpensesService.deleteExpense(expense.id);
      showStatusMessage("Expense deleted.");
      invalidateSavingsRelatedCaches();
      await loadSavingsData({ withCatchup: true });
      await openCorrectionsForRollover(rollover, { forceReload: true });
    } catch (error) {
      console.error("Failed to delete month expense:", error);
      showStatusMessage(`Failed to delete expense: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsDeletingExpenseId(null);
    }
  };

  const handleConfirmRollover = async (rollover) => {
    if (isConfirmingRolloverId || isDeletingRolloverId) return;
    setIsConfirmingRolloverId(rollover.id);
    try {
      await CategorySavingsService.confirmRollover(rollover.id);
      showStatusMessage(
        `Confirmed ${getRelatedCategory(rollover)?.name || "category"} for ${getMonthLabel(
          rollover.month_start
        )}.`
      );
      invalidateSavingsRelatedCaches();
      await loadSavingsData({ withCatchup: true });
    } catch (error) {
      console.error("Failed to confirm rollover:", error);
      showStatusMessage(`Failed to confirm rollover: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsConfirmingRolloverId(null);
    }
  };

  const handleDeletePendingRollover = async (rollover) => {
    if (isConfirmingRolloverId || isDeletingRolloverId) return;
    const categoryName = getRelatedCategory(rollover)?.name || "this category";
    const monthLabel = getMonthLabel(rollover.month_start);
    const confirmedDelete = window.confirm(
      `Delete pending rollover for ${categoryName} (${monthLabel})?`
    );
    if (!confirmedDelete) return;

    setIsDeletingRolloverId(rollover.id);
    try {
      await CategorySavingsService.skipPendingRollover(rollover.id);
      showStatusMessage(`Deleted pending rollover for ${categoryName} (${monthLabel}).`);
      invalidateSavingsRelatedCaches();
      await loadSavingsData({ withCatchup: true });
    } catch (error) {
      console.error("Failed to delete pending rollover:", error);
      showStatusMessage(
        `Failed to delete pending rollover: ${getErrorMessage(error)}`,
        "error"
      );
    } finally {
      setIsDeletingRolloverId(null);
    }
  };

  const handleSubmitExpenseEdit = async (updatedExpense) => {
    if (!editingExpenseContext || isUpdatingExpense) return;
    const { expense, rollover } = editingExpenseContext;
    setIsUpdatingExpense(true);
    try {
      await ExpensesService.updateExpense(expense.id, {
        description: updatedExpense.description,
        amount: updatedExpense.amount,
        expense_date: updatedExpense.date,
        entry_type: "variable",
      });
      setEditingExpenseContext(null);
      showStatusMessage("Expense updated.");
      invalidateSavingsRelatedCaches();
      await loadSavingsData({ withCatchup: true });
      await openCorrectionsForRollover(rollover, { forceReload: true });
    } catch (error) {
      console.error("Failed to update month expense:", error);
      showStatusMessage(`Failed to update expense: ${getErrorMessage(error)}`, "error");
    } finally {
      setIsUpdatingExpense(false);
    }
  };

  const handleRefresh = async () => {
    await loadSavingsData({ withCatchup: true, withRefreshIndicator: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-3 sm:space-y-4">
        <header className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 leading-tight">
                Category Savings
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Pending month-end leftovers ready to confirm
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="w-9 h-9 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 flex items-center justify-center"
                aria-label={refreshing ? "Refreshing savings" : "Refresh savings"}
                title={refreshing ? "Refreshing savings" : "Refresh savings"}
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

        <section className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Savings</p>
            <p
              className={`text-lg sm:text-xl font-semibold mt-1 ${
                totalBalance >= 0 ? "text-gray-900" : "text-red-700"
              }`}
            >
              {formatCurrency(totalBalance)}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Pending Confirmations</p>
            <p className="text-lg sm:text-xl font-semibold mt-1 text-gray-900">
              {pendingRollovers.length}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3 col-span-2 sm:col-span-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Pending Total</p>
            <p
              className={`text-lg sm:text-xl font-semibold mt-1 ${
                pendingTotal >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {formatCurrency(pendingTotal)}
            </p>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Pending Confirmations</h2>
            <span className="text-sm text-gray-500">{pendingRollovers.length} pending</span>
          </div>

          {loading ? (
            <p className="text-sm text-gray-600">Loading savings data...</p>
          ) : pendingRollovers.length === 0 ? (
            <p className="text-sm text-gray-600">No pending savings confirmations.</p>
          ) : (
            <div className="space-y-2">
              {pendingRollovers.map((rollover) => {
                const category = getRelatedCategory(rollover);
                const isOpen = openRolloverId === rollover.id;
                const monthExpenses = monthExpensesByRollover[rollover.id] || [];
                const correctionForm =
                  correctionForms[rollover.id] || getDefaultCorrectionForm(rollover);
                const correctionFormErrors = correctionErrors[rollover.id] || {};

                return (
                  <div
                    key={rollover.id}
                    className="rounded-md border border-gray-200 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {category?.name || "Unknown category"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getMonthLabel(rollover.month_start)}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold ${
                          Number(rollover.rollover_amount) >= 0
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {formatCurrency(rollover.rollover_amount)}
                      </p>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-gray-50 px-2 py-1">
                        <p className="text-gray-500">Budget</p>
                        <p className="font-medium text-gray-800">
                          {formatCurrency(rollover.budget_amount)}
                        </p>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1">
                        <p className="text-gray-500">Spent</p>
                        <p className="font-medium text-gray-800">
                          {formatCurrency(rollover.spent_amount)}
                        </p>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1">
                        <p className="text-gray-500">To Savings</p>
                        <p
                          className={`font-medium ${
                            Number(rollover.rollover_amount) >= 0
                              ? "text-green-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatCurrency(rollover.rollover_amount)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(isConfirmingRolloverId || isDeletingRolloverId)}
                        onClick={() => handleConfirmRollover(rollover)}
                        className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600 text-white disabled:bg-blue-300"
                      >
                        {isConfirmingRolloverId === rollover.id ? "Confirming..." : "Confirm"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(isConfirmingRolloverId || isDeletingRolloverId)}
                        onClick={() => handleDeletePendingRollover(rollover)}
                        className="px-2.5 py-1.5 text-xs rounded-md border border-red-300 text-red-700 bg-white disabled:opacity-50"
                      >
                        {isDeletingRolloverId === rollover.id ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCorrections(rollover)}
                        className="px-2.5 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 bg-white"
                      >
                        {isOpen ? "Hide corrections" : "Add/edit expenses"}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        <form
                          onSubmit={(event) => handleAddCorrectionExpense(event, rollover)}
                          className="space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="Amount"
                              value={correctionForm.amount}
                              onChange={(event) =>
                                handleCorrectionFormChange(rollover.id, {
                                  amount: event.target.value,
                                })
                              }
                              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md text-sm"
                            />
                            <input
                              type="date"
                              value={correctionForm.date}
                              onChange={(event) =>
                                handleCorrectionFormChange(rollover.id, {
                                  date: event.target.value,
                                })
                              }
                              className="w-36 px-2 py-2 border border-gray-300 rounded-md text-sm"
                            />
                            <button
                              type="submit"
                              disabled={isSavingCorrectionExpense}
                              className="px-3 py-2 rounded-md bg-green-600 text-white text-sm font-medium disabled:bg-green-300"
                            >
                              {isSavingCorrectionExpense ? "..." : "Add"}
                            </button>
                          </div>
                          {correctionFormErrors.amount && (
                            <p className="text-xs text-red-600">{correctionFormErrors.amount}</p>
                          )}
                          {correctionFormErrors.date && (
                            <p className="text-xs text-red-600">{correctionFormErrors.date}</p>
                          )}
                          <input
                            type="text"
                            maxLength={500}
                            placeholder="Note (optional)"
                            value={correctionForm.description}
                            onChange={(event) =>
                              handleCorrectionFormChange(rollover.id, {
                                description: event.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                          {correctionFormErrors.description && (
                            <p className="text-xs text-red-600">
                              {correctionFormErrors.description}
                            </p>
                          )}
                        </form>

                        <div className="space-y-1">
                          {loadingMonthExpensesId === rollover.id ? (
                            <p className="text-xs text-gray-500 py-2">Loading month expenses...</p>
                          ) : monthExpenses.length === 0 ? (
                            <p className="text-xs text-gray-500 py-2">No expenses in this month yet.</p>
                          ) : (
                            monthExpenses.map((expense) => (
                              <div
                                key={expense.id}
                                className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs"
                              >
                                <div className="min-w-0 pr-2">
                                  <p className="font-medium text-gray-800 truncate">
                                    {expense.description}
                                  </p>
                                  <p className="text-gray-500">
                                    {formatDateForDisplay(expense.expense_date)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-gray-900">
                                    {formatCurrency(expense.amount)}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingExpenseContext({
                                        expense,
                                        rollover,
                                      })
                                    }
                                    className="text-amber-600 hover:text-amber-700"
                                    title="Edit expense"
                                    aria-label="Edit expense"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.536a2 2 0 01-.879.513l-3.244.811a.5.5 0 01-.606-.606l.811-3.244A2 2 0 019 11z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeletingExpenseId === expense.id}
                                    onClick={() => handleDeleteMonthExpense(rollover, expense)}
                                    className="text-red-600 hover:text-red-700 disabled:text-red-300"
                                    title="Delete expense"
                                    aria-label="Delete expense"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Category Balances</h2>
            <span className="text-sm text-gray-500">{balances.length} categories</span>
          </div>

          {balances.length === 0 ? (
            <p className="text-sm text-gray-600">
              No savings balances yet. Enable savings on categories to start tracking.
            </p>
          ) : (
            <div className="space-y-1">
              {balances.map((balanceEntry) => (
                <div
                  key={balanceEntry.category_id}
                  className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {balanceEntry.category_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {balanceEntry.transaction_count} confirmation
                      {balanceEntry.transaction_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      Number(balanceEntry.balance) >= 0 ? "text-gray-900" : "text-red-700"
                    }`}
                  >
                    {formatCurrency(balanceEntry.balance)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Confirmed History</h2>
            <span className="text-sm text-gray-500">{confirmedRollovers.length} recent</span>
          </div>

          {confirmedRollovers.length === 0 ? (
            <p className="text-sm text-gray-600">No confirmed savings rollovers yet.</p>
          ) : (
            <div className="space-y-1">
              {confirmedRollovers.map((rollover) => {
                const category = getRelatedCategory(rollover);
                return (
                  <div
                    key={rollover.id}
                    className="rounded-md border border-gray-200 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {category?.name || "Unknown category"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getMonthLabel(rollover.month_start)} · Confirmed{" "}
                          {formatDateForDisplay(rollover.confirmed_at)}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold ${
                          Number(rollover.rollover_amount) >= 0
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {formatCurrency(rollover.rollover_amount)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {editingExpenseContext && (
        <EditMonthExpenseModal
          expense={editingExpenseContext.expense}
          rollover={editingExpenseContext.rollover}
          isSubmitting={isUpdatingExpense}
          onSubmit={handleSubmitExpenseEdit}
          onCancel={() => {
            if (isUpdatingExpense) return;
            setEditingExpenseContext(null);
          }}
        />
      )}
    </div>
  );
}
