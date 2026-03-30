import { useState, useEffect, useRef } from "react";
import { CategoriesService } from "../libs/categories.services";
import { ExpensesService } from "../libs/expenses.services";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (amount) =>
  currencyFormatter.format(Number.isFinite(amount) ? amount : 0);

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : "Unexpected error";

const getFriendlyErrorMessage = (error, entity) => {
  const rawMessage = getErrorMessage(error);
  const normalizedMessage = rawMessage.toLowerCase();

  if (
    normalizedMessage.includes("duplicate") ||
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("unique") ||
    normalizedMessage.includes("23505")
  ) {
    return "A category with this name already exists.";
  }

  if (
    normalizedMessage.includes("check constraint") ||
    normalizedMessage.includes("violates check constraint")
  ) {
    if (entity === "expense") {
      return "Expense amount must be greater than 0.";
    }
    if (entity === "category") {
      return "Weekly budget must be greater than 0.";
    }
  }

  if (
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("network")
  ) {
    return "Network connection issue. Please try again.";
  }

  return rawMessage;
};

const hasDuplicateCategoryName = (name, categories = [], excludeId = null) => {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;

  return categories.some((category) => {
    if (excludeId !== null && category.id === excludeId) return false;
    return String(category.name || "").trim().toLowerCase() === normalized;
  });
};

export default function Index() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [toasts, setToasts] = useState([]);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [showEditCategoryForm, setShowEditCategoryForm] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState(null);
  const [showEditExpenseForm, setShowEditExpenseForm] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [showDeleteExpenseConfirm, setShowDeleteExpenseConfirm] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [showWeeklyExpenses, setShowWeeklyExpenses] = useState(false);
  const [showMonthlyExpenses, setShowMonthlyExpenses] = useState(false);
  const [selectedCategoryForExpenses, setSelectedCategoryForExpenses] = useState(null);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [selectedReportMonth, setSelectedReportMonth] = useState('');
  const [quickAddOpenCategoryId, setQuickAddOpenCategoryId] = useState(null);
  const [quickAddForms, setQuickAddForms] = useState({});
  const [quickAddErrors, setQuickAddErrors] = useState({});
  const [lastQuickDescription, setLastQuickDescription] = useState("");
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
  const [isUpdatingExpense, setIsUpdatingExpense] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const toastTimeoutsRef = useRef(new Map());
  const quickAmountInputRefs = useRef({});

  const dismissToast = (id) => {
    const timeoutId = toastTimeoutsRef.current.get(id);
    if (timeoutId) {
      clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(id);
    }
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  };

  const showToast = (message, type = "success", options = {}) => {
    const { duration = 3500, actionLabel, onAction } = options;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prevToasts) => [
      ...prevToasts,
      {
        id,
        message,
        type,
        actionLabel,
        onAction,
      },
    ]);
    const timeoutId = setTimeout(() => {
      dismissToast(id);
    }, duration);
    toastTimeoutsRef.current.set(id, timeoutId);
  };

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      toastTimeoutsRef.current.clear();
    };
  }, []);

  const getDefaultQuickAddForm = () => ({
    amount: "",
    description: lastQuickDescription,
    date: new Date().toISOString().split("T")[0],
  });

  const getQuickAddForm = (categoryId) =>
    quickAddForms[categoryId] || getDefaultQuickAddForm();

  const updateQuickAddForm = (categoryId, patch) => {
    setQuickAddForms((prevForms) => ({
      ...prevForms,
      [categoryId]: {
        ...(prevForms[categoryId] || getDefaultQuickAddForm()),
        ...patch,
      },
    }));
  };

  const clearQuickAddError = (categoryId, field) => {
    setQuickAddErrors((prevErrors) => {
      const categoryErrors = prevErrors[categoryId];
      if (!categoryErrors || !categoryErrors[field]) return prevErrors;

      return {
        ...prevErrors,
        [categoryId]: {
          ...categoryErrors,
          [field]: undefined,
        },
      };
    });
  };

  const validateQuickAdd = (form) => {
    const errors = {};
    const amount = Number(form.amount);

    if (form.amount === "") {
      errors.amount = "Amount is required.";
    } else if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Amount must be greater than 0.";
    }

    if ((form.description || "").trim().length > 500) {
      errors.description = "Note must be 500 characters or fewer.";
    }

    return errors;
  };

  useEffect(() => {
    if (!quickAddOpenCategoryId) return;

    const frameId = requestAnimationFrame(() => {
      quickAmountInputRefs.current[quickAddOpenCategoryId]?.focus();
    });

    return () => cancelAnimationFrame(frameId);
  }, [quickAddOpenCategoryId]);

  const addCategory = async (newCategory) => {
    if (isSubmittingCategory) return;
    setIsSubmittingCategory(true);
    try {
      // Only send the data that the database expects (no id, it's auto-generated)
      const categoryData = {
        name: newCategory.name,
        weekly_budget: newCategory.weekly_budget
      };
      
      const createdCategory = await CategoriesService.createCategory(categoryData);
      setCategories((prevCategories) => [...prevCategories, createdCategory]);
      setShowCategoryForm(false);
      showToast(`Added ${createdCategory.name}`, "success");
    } catch (error) {
      console.error('Failed to add category:', error);
      showToast(
        `Failed to create category: ${getFriendlyErrorMessage(error, "category")}`,
        "error"
      );
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  const addExpense = async (categoryId, expense) => {
    if (isSubmittingExpense) return;
    setIsSubmittingExpense(true);
    try {
      const expenseData = {
        category_id: categoryId,
        description: expense.description,
        amount: expense.amount,
        expense_date: expense.date
      };
      
      const createdExpense = await ExpensesService.createExpense(expenseData);
      
      // Update the local expenses state
      setExpenses(prev => [...prev, createdExpense]);
      
      setShowExpenseForm(false);
      setSelectedCategoryId(null);
      showToast("Expense added", "success");
      return true;
    } catch (error) {
      console.error('Failed to add expense:', error);
      showToast(
        `Failed to create expense: ${getFriendlyErrorMessage(error, "expense")}`,
        "error"
      );
      return false;
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const toggleQuickAdd = (categoryId) => {
    setQuickAddOpenCategoryId((currentId) => {
      if (currentId === categoryId) return null;
      return categoryId;
    });

    setQuickAddForms((prevForms) => {
      if (prevForms[categoryId]) return prevForms;
      return {
        ...prevForms,
        [categoryId]: getDefaultQuickAddForm(),
      };
    });
  };

  const handleQuickAddSubmit = async (event, categoryId) => {
    event.preventDefault();

    const form = getQuickAddForm(categoryId);
    const validationErrors = validateQuickAdd(form);

    if (Object.keys(validationErrors).length > 0) {
      setQuickAddErrors((prevErrors) => ({
        ...prevErrors,
        [categoryId]: validationErrors,
      }));
      return;
    }

    const description = (form.description || "").trim();
    const wasCreated = await addExpense(categoryId, {
      description: description || "Expense",
      amount: Number(form.amount),
      date: form.date,
    });

    if (!wasCreated) return;

    const rememberedDescription = description || lastQuickDescription;

    if (description) setLastQuickDescription(description);

    setQuickAddErrors((prevErrors) => ({
      ...prevErrors,
      [categoryId]: {},
    }));
    setQuickAddForms((prevForms) => ({
      ...prevForms,
      [categoryId]: {
        amount: "",
        description: rememberedDescription,
        date: new Date().toISOString().split("T")[0],
      },
    }));
    quickAmountInputRefs.current[categoryId]?.focus();
  };

  const deleteCategory = async (categoryId) => {
    if (isDeletingCategory) return;
    setIsDeletingCategory(true);
    const categoryToRemove = categories.find((category) => category.id === categoryId);
    const categoryName = categoryToRemove?.name || "Category";
    const associatedExpenses = expenses.filter(
      (expense) => expense.category_id === categoryId
    );

    try {
      await CategoriesService.deleteCategory(categoryId);
      setCategories((prevCategories) =>
        prevCategories.filter((category) => category.id !== categoryId)
      );
      // Also remove associated expenses from local state
      setExpenses((prevExpenses) =>
        prevExpenses.filter((expense) => expense.category_id !== categoryId)
      );
      setShowDeleteConfirm(false);
      setCategoryToDelete(null);
      setCategoryToEdit((currentCategory) =>
        currentCategory?.id === categoryId ? null : currentCategory
      );
      setShowEditCategoryForm((isOpen) =>
        categoryToEdit?.id === categoryId ? false : isOpen
      );
      setSelectedCategoryForExpenses((currentCategory) =>
        currentCategory?.id === categoryId ? null : currentCategory
      );
      setShowWeeklyExpenses((isOpen) =>
        selectedCategoryForExpenses?.id === categoryId ? false : isOpen
      );
      setShowMonthlyExpenses((isOpen) =>
        selectedCategoryForExpenses?.id === categoryId ? false : isOpen
      );

      showToast(`Deleted ${categoryName}`, "success", {
        actionLabel: "Undo",
        duration: 7000,
        onAction: async () => {
          if (!categoryToRemove) return;
          try {
            const restoredCategory = await CategoriesService.createCategory({
              name: categoryToRemove.name,
              weekly_budget: categoryToRemove.weekly_budget,
            });

            setCategories((prevCategories) => [...prevCategories, restoredCategory]);

            if (associatedExpenses.length > 0) {
              const restoredExpenses = await ExpensesService.createExpenses(
                associatedExpenses.map((expense) => ({
                  category_id: restoredCategory.id,
                  description: expense.description,
                  amount: expense.amount,
                  expense_date: expense.expense_date,
                }))
              );
              setExpenses((prevExpenses) => [...prevExpenses, ...restoredExpenses]);
            }

            showToast(`Restored ${restoredCategory.name}`, "success");
          } catch (error) {
            console.error("Failed to restore category:", error);
            showToast(
              `Failed to restore category: ${getFriendlyErrorMessage(error, "category")}`,
              "error"
            );
          }
        },
      });
    } catch (error) {
      console.error('Failed to delete category:', error);
      showToast(
        `Failed to delete category: ${getFriendlyErrorMessage(error, "category")}`,
        "error"
      );
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const handleDeleteClick = (category) => {
    setCategoryToDelete(category);
    setShowDeleteConfirm(true);
  };

  const handleEditCategoryClick = (category) => {
    setQuickAddOpenCategoryId(null);
    setCategoryToEdit(category);
    setShowEditCategoryForm(true);
  };

  const updateCategory = async (categoryId, updatedCategory) => {
    if (isUpdatingCategory) return false;
    setIsUpdatingCategory(true);

    const originalCategory = categories.find((category) => category.id === categoryId);
    const optimisticCategory = originalCategory
      ? {
          ...originalCategory,
          name: updatedCategory.name,
          weekly_budget: updatedCategory.weekly_budget,
        }
      : null;

    if (optimisticCategory) {
      setCategories((prevCategories) =>
        prevCategories.map((category) =>
          category.id === categoryId ? optimisticCategory : category
        )
      );
      setSelectedCategoryForExpenses((currentCategory) =>
        currentCategory?.id === categoryId ? optimisticCategory : currentCategory
      );
    }

    try {
      const savedCategory = await CategoriesService.updateCategory(categoryId, {
        name: updatedCategory.name,
        weekly_budget: updatedCategory.weekly_budget,
      });

      setCategories((prevCategories) =>
        prevCategories.map((category) =>
          category.id === categoryId ? savedCategory : category
        )
      );
      setSelectedCategoryForExpenses((currentCategory) =>
        currentCategory?.id === categoryId ? savedCategory : currentCategory
      );
      setCategoryToEdit(null);
      setShowEditCategoryForm(false);
      showToast(`Updated ${savedCategory.name}`, "success");
      return true;
    } catch (error) {
      if (originalCategory) {
        setCategories((prevCategories) =>
          prevCategories.map((category) =>
            category.id === categoryId ? originalCategory : category
          )
        );
        setSelectedCategoryForExpenses((currentCategory) =>
          currentCategory?.id === categoryId ? originalCategory : currentCategory
        );
      }
      console.error("Failed to update category:", error);
      showToast(
        `Failed to update category: ${getFriendlyErrorMessage(error, "category")}`,
        "error"
      );
      return false;
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const deleteExpense = async (_categoryId, expenseId) => {
    if (isDeletingExpense) return;
    setIsDeletingExpense(true);
    const expenseToRestore = expenses.find((expense) => expense.id === expenseId);

    try {
      await ExpensesService.deleteExpense(expenseId);
      setExpenses((prevExpenses) =>
        prevExpenses.filter((expense) => expense.id !== expenseId)
      );
      setShowDeleteExpenseConfirm(false);
      setExpenseToDelete(null);
      setExpenseToEdit((currentExpense) =>
        currentExpense?.id === expenseId ? null : currentExpense
      );
      setShowEditExpenseForm((isOpen) =>
        expenseToEdit?.id === expenseId ? false : isOpen
      );
      showToast("Expense deleted", "success", {
        actionLabel: "Undo",
        duration: 7000,
        onAction: async () => {
          if (!expenseToRestore) return;
          try {
            const restoredExpense = await ExpensesService.createExpense({
              category_id: expenseToRestore.category_id,
              description: expenseToRestore.description,
              amount: expenseToRestore.amount,
              expense_date: expenseToRestore.expense_date,
            });

            setExpenses((prevExpenses) => [...prevExpenses, restoredExpense]);
            showToast("Expense restored", "success");
          } catch (error) {
            console.error("Failed to restore expense:", error);
            showToast(
              `Failed to restore expense: ${getFriendlyErrorMessage(error, "expense")}`,
              "error"
            );
          }
        },
      });
    } catch (error) {
      console.error('Failed to delete expense:', error);
      showToast(
        `Failed to delete expense: ${getFriendlyErrorMessage(error, "expense")}`,
        "error"
      );
    } finally {
      setIsDeletingExpense(false);
    }
  };

  const handleDeleteExpenseClick = (categoryId, expense) => {
    setExpenseToDelete({ categoryId, expense });
    setShowDeleteExpenseConfirm(true);
  };

  const handleEditExpenseClick = (expense) => {
    setExpenseToEdit(expense);
    setShowEditExpenseForm(true);
  };

  const updateExpense = async (expenseId, updatedExpense) => {
    if (isUpdatingExpense) return false;
    setIsUpdatingExpense(true);

    const originalExpense = expenses.find((expense) => expense.id === expenseId);
    const optimisticExpense = originalExpense
      ? {
          ...originalExpense,
          description: updatedExpense.description,
          amount: updatedExpense.amount,
          expense_date: updatedExpense.date,
        }
      : null;

    if (optimisticExpense) {
      setExpenses((prevExpenses) =>
        prevExpenses.map((expense) =>
          expense.id === expenseId ? optimisticExpense : expense
        )
      );
    }

    try {
      const savedExpense = await ExpensesService.updateExpense(expenseId, {
        description: updatedExpense.description,
        amount: updatedExpense.amount,
        expense_date: updatedExpense.date,
      });

      setExpenses((prevExpenses) =>
        prevExpenses.map((expense) =>
          expense.id === expenseId ? savedExpense : expense
        )
      );
      setExpenseToEdit(null);
      setShowEditExpenseForm(false);
      showToast("Expense updated", "success");
      return true;
    } catch (error) {
      if (originalExpense) {
        setExpenses((prevExpenses) =>
          prevExpenses.map((expense) =>
            expense.id === expenseId ? originalExpense : expense
          )
        );
      }
      console.error("Failed to update expense:", error);
      showToast(
        `Failed to update expense: ${getFriendlyErrorMessage(error, "expense")}`,
        "error"
      );
      return false;
    } finally {
      setIsUpdatingExpense(false);
    }
  };

  // Helper function to get expenses for a category
  const getCategoryExpenses = (categoryId) => {
    return expenses.filter(expense => expense.category_id === categoryId);
  };

  const getTotalSpent = (categoryExpenses) => {
    return categoryExpenses.reduce((total, expense) => total + expense.amount, 0);
  };

  const getWeeklySpent = (categoryExpenses) => {
    // Use calendar-based week calculation (Sunday to Saturday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return categoryExpenses
      .filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      })
      .reduce((total, expense) => total + expense.amount, 0);
  };

  // Get the number of days in the current month
  const getDaysInCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    // Last day of the month gives us the total days
    const lastDay = new Date(year, month + 1, 0);
    return lastDay.getDate();
  };

  // Calculate daily budget from weekly budget
  const getDailyBudget = (weeklyBudget) => {
    return weeklyBudget / 7;
  };

  // Calculate monthly budget based on days in current month
  const getMonthlyBudget = (weeklyBudget) => {
    const dailyBudget = getDailyBudget(weeklyBudget);
    const daysInMonth = getDaysInCurrentMonth();
    return dailyBudget * daysInMonth;
  };

  // Get spending for current month (calendar month, not last 30 days)
  const getCurrentMonthSpent = (categoryExpenses) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    return categoryExpenses
      .filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getFullYear() === currentYear && 
               expenseDate.getMonth() === currentMonth;
      })
      .reduce((total, expense) => total + expense.amount, 0);
  };

  // Get all expenses for current week
  const getCurrentWeekExpenses = (categoryExpenses) => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return categoryExpenses
      .filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      })
      .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)); // Most recent first
  };

  // Get all expenses for current month
  const getCurrentMonthExpenses = (categoryExpenses) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    return categoryExpenses
      .filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getFullYear() === currentYear && 
               expenseDate.getMonth() === currentMonth;
      })
      .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)); // Most recent first
  };

  // Get expenses for a specific month/year
  const getExpensesForMonth = (categoryExpenses, year, month) => {
    return categoryExpenses
      .filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        return expenseDate.getFullYear() === year && 
               expenseDate.getMonth() === month;
      })
      .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
  };

  // Generate list of available months (current month + previous 11 months)
  const getAvailableMonths = () => {
    const months = [];
    const now = new Date();
    
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      months.push({
        value: `${year}-${month}`,
        label: monthName,
        year: year,
        month: month
      });
    }
    
    return months;
  };

  // Generate monthly report data
  const generateMonthlyReport = (year, month) => {
    const reportData = categories.map(category => {
      const categoryExpenses = getCategoryExpenses(category.id);
      const monthExpenses = getExpensesForMonth(categoryExpenses, year, month);
      const totalSpent = monthExpenses.reduce((total, expense) => total + expense.amount, 0);
      
      return {
        category,
        expenses: monthExpenses,
        totalSpent,
        expenseCount: monthExpenses.length
      };
    }).filter(item => item.expenseCount > 0); // Only include categories with expenses
    
    return reportData;
  };

  // Load data when component mounts
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [categoriesData, expensesData] = await Promise.all([
          CategoriesService.getCategories(),
          ExpensesService.getExpenses()
        ]);
        setCategories(categoriesData);
        setExpenses(expensesData);
      } catch (error) {
        console.error('Failed to load data:', error);
        showToast(
          `Failed to load data: ${getFriendlyErrorMessage(error)}`,
          "error"
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);


  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-center text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">Budget Tracker</h1>
          
          {/* Monthly Report Button */}
          <div className="flex justify-center">
            <div className="flex items-center gap-3 bg-white rounded-lg shadow-md p-3">
              <label className="text-sm font-medium text-gray-700">Monthly Report:</label>
              <select
                value={selectedReportMonth}
                onChange={(e) => setSelectedReportMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select a month...</option>
                {getAvailableMonths().map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (selectedReportMonth) {
                    setShowMonthlyReport(true);
                  }
                }}
                disabled={!selectedReportMonth}
                className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors"
              >
                Generate Report
              </button>
            </div>
          </div>
        </header>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="mt-2 text-gray-600">Loading your budget data...</p>
          </div>
        )}

        {/* Categories Grid */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {categories.map((category) => {
              const categoryExpenses = getCategoryExpenses(category.id);
              const weeklySpent = getWeeklySpent(categoryExpenses);
              const monthlySpent = getCurrentMonthSpent(categoryExpenses);
              // Monthly budget based on days in current month
              const monthlyBudget = getMonthlyBudget(category.weekly_budget);

            return (
              <div key={category.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4">
                {/* Header with title and actions */}
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">{category.name}</h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleQuickAdd(category.id)}
                      className={`px-2 h-8 rounded-md text-xs font-medium transition-colors ${
                        quickAddOpenCategoryId === category.id
                          ? "bg-green-100 text-green-700 border border-green-300"
                          : "bg-green-500 hover:bg-green-600 text-white"
                      }`}
                      title="Quick add expense"
                    >
                      {quickAddOpenCategoryId === category.id ? "Close" : "Quick"}
                    </button>
                    <button
                      onClick={() => {
                        setQuickAddOpenCategoryId(null);
                        setSelectedCategoryId(category.id);
                        setShowExpenseForm(true);
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                      title="Add expense with full form"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleEditCategoryClick(category)}
                      className="text-amber-600 hover:text-amber-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                      title="Edit category"
                      aria-label="Edit category"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.536a2 2 0 01-.879.513l-3.244.811a.5.5 0 01-.606-.606l.811-3.244A2 2 0 019 11z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteClick(category)}
                      className="text-red-500 hover:text-red-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                      title="Delete category"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                {/* Compact Budget Overview */}
                <div className="flex flex-row gap-3 mb-3">
                  {/* Weekly Budget */}
                  <div 
                    className="flex-1 cursor-pointer hover:bg-blue-50 rounded-md p-1 transition-colors"
                    onClick={() => {
                      if (categoryExpenses.length > 0) {
                        setSelectedCategoryForExpenses(category);
                        setShowWeeklyExpenses(true);
                      }
                    }}
                    title={categoryExpenses.length > 0 ? "Click to view weekly expenses" : "No expenses to show"}
                  >
                    <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                      <span>Weekly</span>
                      <span className="font-bold">{formatCurrency(weeklySpent)} / {formatCurrency(category.weekly_budget)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${weeklySpent > category.weekly_budget ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min((weeklySpent / category.weekly_budget) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Monthly Budget */}
                  <div 
                    className="flex-1 cursor-pointer hover:bg-purple-50 rounded-md p-1 transition-colors"
                    onClick={() => {
                      if (categoryExpenses.length > 0) {
                        setSelectedCategoryForExpenses(category);
                        setShowMonthlyExpenses(true);
                      }
                    }}
                    title={categoryExpenses.length > 0 ? "Click to view monthly expenses" : "No expenses to show"}
                  >
                    <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
                      <span>Monthly</span>
                      <span className="font-bold">{formatCurrency(monthlySpent)} / {formatCurrency(monthlyBudget)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${monthlySpent > monthlyBudget ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min((monthlySpent / monthlyBudget) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Recent Expenses - More Compact */}
                <div className="space-y-1">
                  {categoryExpenses
                    .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date))
                    .slice(0, 2)
                    .map((expense) => (
                    <div key={expense.id} className="flex justify-between items-center text-xs group bg-gray-50 rounded p-2">
                      <div className="flex-1 min-w-0 pr-2">
                        <span className="text-gray-700 truncate block font-medium">{expense.description}</span>
                        <span className="text-gray-400">{new Date(expense.expense_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 font-semibold">{formatCurrency(expense.amount)}</span>
                        <button
                          onClick={() => handleEditExpenseClick(expense)}
                          className="opacity-100 text-amber-600 hover:text-amber-700 transition-opacity"
                          title="Edit expense"
                          aria-label="Edit expense"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.536a2 2 0 01-.879.513l-3.244.811a.5.5 0 01-.606-.606l.811-3.244A2 2 0 019 11z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteExpenseClick(category.id, expense)}
                          className="opacity-100 text-red-500 hover:text-red-700 transition-opacity"
                          title="Delete expense"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  {categoryExpenses.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-2">No expenses yet</p>
                  )}
                </div>

                {quickAddOpenCategoryId === category.id && (
                  <form
                    onSubmit={(event) => handleQuickAddSubmit(event, category.id)}
                    className="mt-3 pt-3 border-t border-gray-200 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        ref={(element) => {
                          if (element) {
                            quickAmountInputRefs.current[category.id] = element;
                          } else {
                            delete quickAmountInputRefs.current[category.id];
                          }
                        }}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Amount"
                        value={getQuickAddForm(category.id).amount}
                        onChange={(event) => {
                          updateQuickAddForm(category.id, { amount: event.target.value });
                          clearQuickAddError(category.id, "amount");
                        }}
                        aria-label={`Quick add amount for ${category.name}`}
                        aria-invalid={Boolean(quickAddErrors[category.id]?.amount)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingExpense}
                        className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-3 py-2 rounded-md text-sm font-medium"
                      >
                        {isSubmittingExpense ? "Adding..." : "Add"}
                      </button>
                    </div>
                    {quickAddErrors[category.id]?.amount && (
                      <p className="text-xs text-red-600">{quickAddErrors[category.id].amount}</p>
                    )}

                    <input
                      type="text"
                      maxLength={500}
                      placeholder="Note (optional)"
                      value={getQuickAddForm(category.id).description}
                      onChange={(event) => {
                        updateQuickAddForm(category.id, { description: event.target.value });
                        clearQuickAddError(category.id, "description");
                      }}
                      aria-label={`Quick add note for ${category.name}`}
                      aria-invalid={Boolean(quickAddErrors[category.id]?.description)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                    />
                    {quickAddErrors[category.id]?.description && (
                      <p className="text-xs text-red-600">{quickAddErrors[category.id].description}</p>
                    )}

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Uses today's date</span>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAddOpenCategoryId(null);
                          setSelectedCategoryId(category.id);
                          setShowExpenseForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        More fields
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}            
          </div>
        )}

        {/* Empty State */}
        {!loading && categories.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📊</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No categories yet</h3>
            <p className="text-gray-600 mb-6">Get started by creating your first budget category</p>
            <button
              onClick={() => setShowCategoryForm(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium"
            >
              Create Your First Category
            </button>
          </div>
        )}

        {/* Category Form Modal */}
        {showCategoryForm && (
          <CategoryForm
            categories={categories}
            onSubmit={addCategory}
            onCancel={() => setShowCategoryForm(false)}
            isSubmitting={isSubmittingCategory}
          />
        )}

        {/* Expense Form Modal */}
        {showExpenseForm && (
          <ExpenseForm
            categoryId={selectedCategoryId}
            onSubmit={addExpense}
            onCancel={() => {
              setShowExpenseForm(false);
              setSelectedCategoryId(null);
            }}
            isSubmitting={isSubmittingExpense}
          />
        )}

        {/* Edit Category Modal */}
        {showEditCategoryForm && categoryToEdit && (
          <EditCategoryForm
            category={categoryToEdit}
            categories={categories}
            onSubmit={(updatedCategory) =>
              updateCategory(categoryToEdit.id, updatedCategory)
            }
            onCancel={() => {
              if (isUpdatingCategory) return;
              setShowEditCategoryForm(false);
              setCategoryToEdit(null);
            }}
            isSubmitting={isUpdatingCategory}
          />
        )}

        {/* Edit Expense Modal */}
        {showEditExpenseForm && expenseToEdit && (
          <EditExpenseForm
            expense={expenseToEdit}
            onSubmit={(updatedExpense) =>
              updateExpense(expenseToEdit.id, updatedExpense)
            }
            onCancel={() => {
              if (isUpdatingExpense) return;
              setShowEditExpenseForm(false);
              setExpenseToEdit(null);
            }}
            isSubmitting={isUpdatingExpense}
          />
        )}

        {/* Weekly Expenses Modal */}
        {showWeeklyExpenses && selectedCategoryForExpenses && (
          <WeeklyExpensesModal
            category={selectedCategoryForExpenses}
            expenses={getCurrentWeekExpenses(getCategoryExpenses(selectedCategoryForExpenses.id))}
            onEditExpense={handleEditExpenseClick}
            onDeleteExpense={handleDeleteExpenseClick}
            onClose={() => {
              setShowWeeklyExpenses(false);
              setSelectedCategoryForExpenses(null);
            }}
          />
        )}

        {/* Monthly Expenses Modal */}
        {showMonthlyExpenses && selectedCategoryForExpenses && (
          <MonthlyExpensesModal
            category={selectedCategoryForExpenses}
            expenses={getCurrentMonthExpenses(getCategoryExpenses(selectedCategoryForExpenses.id))}
            onEditExpense={handleEditExpenseClick}
            onDeleteExpense={handleDeleteExpenseClick}
            onClose={() => {
              setShowMonthlyExpenses(false);
              setSelectedCategoryForExpenses(null);
            }}
          />
        )}
        {/* Monthly Report Modal */}
        {showMonthlyReport && selectedReportMonth && (
          <MonthlyReportModal
            selectedMonth={selectedReportMonth}
            reportData={(() => {
              const [year, month] = selectedReportMonth.split('-').map(Number);
              return generateMonthlyReport(year, month);
            })()}
            onClose={() => {
              setShowMonthlyReport(false);
              setSelectedReportMonth('');
            }}
          />
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && categoryToDelete && (
          <DeleteConfirmModal
            category={categoryToDelete}
            onConfirm={() => deleteCategory(categoryToDelete.id)}
            onCancel={() => {
              setShowDeleteConfirm(false);
              setCategoryToDelete(null);
            }}
            isDeleting={isDeletingCategory}
          />
        )}

        {/* Delete Expense Confirmation Modal */}
        {showDeleteExpenseConfirm && expenseToDelete && (
          <DeleteExpenseConfirmModal
            expense={expenseToDelete.expense}
            onConfirm={() => deleteExpense(expenseToDelete.categoryId, expenseToDelete.expense.id)}
            onCancel={() => {
              setShowDeleteExpenseConfirm(false);
              setExpenseToDelete(null);
            }}
            isDeleting={isDeletingExpense}
          />
        )}

        {/* Add New Category Button */}
         <button
            onClick={() => setShowCategoryForm(true)}
            disabled={loading || isSubmittingCategory}
            className="mt-5 w-full sm:w-auto bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-6 py-3 sm:py-2 rounded-lg font-medium text-lg sm:text-base"
          >
            {loading ? 'Loading...' : isSubmittingCategory ? 'Saving...' : 'Add New Category'}
          </button>
      </div>
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-0 right-0 sm:left-auto sm:right-4 z-[90] w-full sm:max-w-sm px-4 sm:px-0 space-y-2 pointer-events-none">
      {toasts.map((toast) => {
        const toneClasses =
          toast.type === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-green-200 bg-green-50 text-green-800";

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-md border shadow-md px-3 py-2 flex items-start justify-between gap-2 ${toneClasses}`}
            role="status"
            aria-live="polite"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
              {toast.actionLabel && typeof toast.onAction === "function" && (
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold underline underline-offset-2"
                  onClick={async () => {
                    try {
                      await toast.onAction();
                    } finally {
                      onDismiss(toast.id);
                    }
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              className="text-sm font-bold opacity-70 hover:opacity-100"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

function DeleteExpenseConfirmModal({ expense, onConfirm, onCancel, isDeleting }) {
  return (
    <ModalFrame onClose={onCancel} titleId="delete-expense-title" zIndex="z-[60]">
      <h2 id="delete-expense-title" className="text-lg sm:text-xl font-semibold mb-4 text-red-600">
        Delete Expense
      </h2>
      <p className="text-gray-700 mb-2">Are you sure you want to delete this expense?</p>
      <div className="bg-gray-50 rounded-lg p-3 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium text-gray-900">{expense.description}</p>
            <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
          </div>
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(expense.amount)}</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-6">This action cannot be undone.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
          className="w-full sm:flex-1 bg-red-500 hover:bg-red-600 active:bg-red-700 disabled:bg-red-300 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
        >
          {isDeleting ? "Deleting..." : "Delete Expense"}
        </button>
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          disabled={isDeleting}
          className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 disabled:bg-gray-200 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
        >
          Cancel
        </button>
      </div>
    </ModalFrame>
  );
}

function CategoryForm({ categories, onSubmit, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    name: "",
    weeklyBudget: "",
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const validationErrors = {};
    const trimmedName = formData.name.trim();
    const weeklyBudget = Number(formData.weeklyBudget);

    if (!trimmedName) {
      validationErrors.name = "Category name is required.";
    } else if (trimmedName.length > 255) {
      validationErrors.name = "Category name must be 255 characters or fewer.";
    } else if (hasDuplicateCategoryName(trimmedName, categories)) {
      validationErrors.name = "A category with this name already exists.";
    }

    if (formData.weeklyBudget === "") {
      validationErrors.weeklyBudget = "Weekly budget is required.";
    } else if (!Number.isFinite(weeklyBudget) || weeklyBudget <= 0) {
      validationErrors.weeklyBudget = "Weekly budget must be greater than 0.";
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    onSubmit({
      name: formData.name.trim(),
      weekly_budget: Number(formData.weeklyBudget),
    });
  };

  return (
    <ModalFrame onClose={onCancel} titleId="add-category-title">
      <h2 id="add-category-title" className="text-lg sm:text-xl font-semibold mb-4">
        Add New Category
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="category-name" className="block text-sm font-medium text-gray-700 mb-2">
            Category Name
          </label>
          <input
            id="category-name"
            type="text"
            autoFocus
            maxLength={255}
            value={formData.name}
            onChange={(event) => {
              setFormData({ ...formData, name: event.target.value });
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
            aria-invalid={Boolean(errors.name)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="category-weekly-budget" className="block text-sm font-medium text-gray-700 mb-2">
            Weekly Budget ($)
          </label>
          <input
            id="category-weekly-budget"
            type="number"
            min="0.01"
            step="0.01"
            value={formData.weeklyBudget}
            onChange={(event) => {
              setFormData({ ...formData, weeklyBudget: event.target.value });
              if (errors.weeklyBudget) {
                setErrors({ ...errors, weeklyBudget: undefined });
              }
            }}
            aria-invalid={Boolean(errors.weeklyBudget)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.weeklyBudget && (
            <p className="mt-1 text-xs text-red-600">{errors.weeklyBudget}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-blue-300 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            {isSubmitting ? "Saving..." : "Add Category"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 disabled:bg-gray-200 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function EditCategoryForm({ category, categories, onSubmit, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    name: category.name || "",
    weeklyBudget: String(category.weekly_budget ?? ""),
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const validationErrors = {};
    const trimmedName = formData.name.trim();
    const weeklyBudget = Number(formData.weeklyBudget);

    if (!trimmedName) {
      validationErrors.name = "Category name is required.";
    } else if (trimmedName.length > 255) {
      validationErrors.name = "Category name must be 255 characters or fewer.";
    } else if (hasDuplicateCategoryName(trimmedName, categories, category.id)) {
      validationErrors.name = "A category with this name already exists.";
    }

    if (formData.weeklyBudget === "") {
      validationErrors.weeklyBudget = "Weekly budget is required.";
    } else if (!Number.isFinite(weeklyBudget) || weeklyBudget <= 0) {
      validationErrors.weeklyBudget = "Weekly budget must be greater than 0.";
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    onSubmit({
      name: formData.name.trim(),
      weekly_budget: Number(formData.weeklyBudget),
    });
  };

  return (
    <ModalFrame onClose={onCancel} titleId="edit-category-title">
      <h2 id="edit-category-title" className="text-lg sm:text-xl font-semibold mb-4">
        Edit Category
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="edit-category-name" className="block text-sm font-medium text-gray-700 mb-2">
            Category Name
          </label>
          <input
            id="edit-category-name"
            type="text"
            autoFocus
            maxLength={255}
            value={formData.name}
            onChange={(event) => {
              setFormData({ ...formData, name: event.target.value });
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
            aria-invalid={Boolean(errors.name)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="edit-category-weekly-budget" className="block text-sm font-medium text-gray-700 mb-2">
            Weekly Budget ($)
          </label>
          <input
            id="edit-category-weekly-budget"
            type="number"
            min="0.01"
            step="0.01"
            value={formData.weeklyBudget}
            onChange={(event) => {
              setFormData({ ...formData, weeklyBudget: event.target.value });
              if (errors.weeklyBudget) {
                setErrors({ ...errors, weeklyBudget: undefined });
              }
            }}
            aria-invalid={Boolean(errors.weeklyBudget)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.weeklyBudget && (
            <p className="mt-1 text-xs text-red-600">{errors.weeklyBudget}</p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-blue-300 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 disabled:bg-gray-200 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function DeleteConfirmModal({ category, onConfirm, onCancel, isDeleting }) {
  return (
    <ModalFrame onClose={onCancel} titleId="delete-category-title" zIndex="z-[60]">
      <h2 id="delete-category-title" className="text-lg sm:text-xl font-semibold mb-4 text-red-600">
        Delete Category
      </h2>
      <p className="text-gray-700 mb-2">
        Are you sure you want to delete the <strong>"{category.name}"</strong> category?
      </p>
      <p className="text-sm text-gray-600 mb-6">
        This will permanently delete the category and all expenses associated with it. This action
        cannot be undone.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isDeleting}
          className="w-full sm:flex-1 bg-red-500 hover:bg-red-600 active:bg-red-700 disabled:bg-red-300 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
        >
          {isDeleting ? "Deleting..." : "Delete Category"}
        </button>
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          disabled={isDeleting}
          className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 disabled:bg-gray-200 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
        >
          Cancel
        </button>
      </div>
    </ModalFrame>
  );
}

function ExpenseForm({ categoryId, onSubmit, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const validationErrors = {};
    const trimmedDescription = formData.description.trim();
    const amount = Number(formData.amount);

    if (!trimmedDescription) {
      validationErrors.description = "Description is required.";
    } else if (trimmedDescription.length > 500) {
      validationErrors.description = "Description must be 500 characters or fewer.";
    }

    if (formData.amount === "") {
      validationErrors.amount = "Amount is required.";
    } else if (!Number.isFinite(amount) || amount <= 0) {
      validationErrors.amount = "Amount must be greater than 0.";
    }

    if (!formData.date) {
      validationErrors.date = "Date is required.";
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    onSubmit(categoryId, {
      description: formData.description.trim(),
      amount: Number(formData.amount),
      date: formData.date,
    });
  };

  return (
    <ModalFrame onClose={onCancel} titleId="add-expense-title">
      <h2 id="add-expense-title" className="text-lg sm:text-xl font-semibold mb-4">
        Add New Expense
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="expense-description" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <input
            id="expense-description"
            type="text"
            autoFocus
            maxLength={500}
            value={formData.description}
            onChange={(event) => {
              setFormData({ ...formData, description: event.target.value });
              if (errors.description) setErrors({ ...errors, description: undefined });
            }}
            aria-invalid={Boolean(errors.description)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-600">{errors.description}</p>
          )}
        </div>
        <div>
          <label htmlFor="expense-amount" className="block text-sm font-medium text-gray-700 mb-2">
            Amount ($)
          </label>
          <input
            id="expense-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={formData.amount}
            onChange={(event) => {
              setFormData({ ...formData, amount: event.target.value });
              if (errors.amount) setErrors({ ...errors, amount: undefined });
            }}
            aria-invalid={Boolean(errors.amount)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
        </div>
        <div>
          <label htmlFor="expense-date" className="block text-sm font-medium text-gray-700 mb-2">
            Date
          </label>
          <input
            id="expense-date"
            type="date"
            value={formData.date}
            onChange={(event) => {
              setFormData({ ...formData, date: event.target.value });
              if (errors.date) setErrors({ ...errors, date: undefined });
            }}
            aria-invalid={Boolean(errors.date)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-blue-300 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            {isSubmitting ? "Saving..." : "Add Expense"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 disabled:bg-gray-200 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function EditExpenseForm({ expense, onSubmit, onCancel, isSubmitting }) {
  const [formData, setFormData] = useState({
    description: expense.description || "",
    amount: String(expense.amount ?? ""),
    date: expense.expense_date
      ? String(expense.expense_date).slice(0, 10)
      : new Date().toISOString().split("T")[0],
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const validationErrors = {};
    const trimmedDescription = formData.description.trim();
    const amount = Number(formData.amount);

    if (!trimmedDescription) {
      validationErrors.description = "Description is required.";
    } else if (trimmedDescription.length > 500) {
      validationErrors.description = "Description must be 500 characters or fewer.";
    }

    if (formData.amount === "") {
      validationErrors.amount = "Amount is required.";
    } else if (!Number.isFinite(amount) || amount <= 0) {
      validationErrors.amount = "Amount must be greater than 0.";
    }

    if (!formData.date) {
      validationErrors.date = "Date is required.";
    }

    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    onSubmit({
      description: formData.description.trim(),
      amount: Number(formData.amount),
      date: formData.date,
    });
  };

  return (
    <ModalFrame onClose={onCancel} titleId="edit-expense-title">
      <h2 id="edit-expense-title" className="text-lg sm:text-xl font-semibold mb-4">
        Edit Expense
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="edit-expense-description" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <input
            id="edit-expense-description"
            type="text"
            autoFocus
            maxLength={500}
            value={formData.description}
            onChange={(event) => {
              setFormData({ ...formData, description: event.target.value });
              if (errors.description) setErrors({ ...errors, description: undefined });
            }}
            aria-invalid={Boolean(errors.description)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-600">{errors.description}</p>
          )}
        </div>
        <div>
          <label htmlFor="edit-expense-amount" className="block text-sm font-medium text-gray-700 mb-2">
            Amount ($)
          </label>
          <input
            id="edit-expense-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={formData.amount}
            onChange={(event) => {
              setFormData({ ...formData, amount: event.target.value });
              if (errors.amount) setErrors({ ...errors, amount: undefined });
            }}
            aria-invalid={Boolean(errors.amount)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
        </div>
        <div>
          <label htmlFor="edit-expense-date" className="block text-sm font-medium text-gray-700 mb-2">
            Date
          </label>
          <input
            id="edit-expense-date"
            type="date"
            value={formData.date}
            onChange={(event) => {
              setFormData({ ...formData, date: event.target.value });
              if (errors.date) setErrors({ ...errors, date: undefined });
            }}
            aria-invalid={Boolean(errors.date)}
            className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
          />
          {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:bg-blue-300 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 disabled:bg-gray-200 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function WeeklyExpensesModal({ category, expenses, onEditExpense, onDeleteExpense, onClose }) {
  const getTotalAmount = () => {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
  };

  return (
    <ModalFrame onClose={onClose} titleId="weekly-expenses-title" maxWidth="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 id="weekly-expenses-title" className="text-lg sm:text-xl font-semibold text-blue-600">
          Weekly Expenses - {category.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          title="Close"
          aria-label="Close weekly expenses"
        >
          ×
        </button>
      </div>

      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-blue-700 font-medium">Total Weekly Spending:</span>
          <span className="text-blue-900 font-bold text-lg">{formatCurrency(getTotalAmount())}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-blue-600 text-sm">Weekly Budget:</span>
          <span className="text-blue-800 font-semibold">{formatCurrency(category.weekly_budget)}</span>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {expenses.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No expenses this week</p>
        ) : (
          expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex-1 min-w-0 pr-3">
                <p className="font-medium text-gray-900 truncate">{expense.description}</p>
                <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(expense.amount)}</span>
                <button
                  type="button"
                  onClick={() => onEditExpense(expense)}
                  className="text-amber-600 hover:text-amber-700 transition-colors"
                  title="Edit expense"
                  aria-label="Edit expense"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.536a2 2 0 01-.879.513l-3.244.811a.5.5 0 01-.606-.606l.811-3.244A2 2 0 019 11z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteExpense(category.id, expense)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                  title="Delete expense"
                  aria-label="Delete expense"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-md font-medium"
        >
          Close
        </button>
      </div>
    </ModalFrame>
  );
}

function MonthlyExpensesModal({ category, expenses, onEditExpense, onDeleteExpense, onClose }) {
  const getTotalAmount = () => {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
  };

  const getMonthlyBudget = () => {
    const dailyBudget = category.weekly_budget / 7;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    return dailyBudget * daysInMonth;
  };

  return (
    <ModalFrame onClose={onClose} titleId="monthly-expenses-title" maxWidth="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 id="monthly-expenses-title" className="text-lg sm:text-xl font-semibold text-purple-600">
          Monthly Expenses - {category.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          title="Close"
          aria-label="Close monthly expenses"
        >
          ×
        </button>
      </div>

      <div className="mb-4 p-3 bg-purple-50 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-purple-700 font-medium">Total Monthly Spending:</span>
          <span className="text-purple-900 font-bold text-lg">{formatCurrency(getTotalAmount())}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-purple-600 text-sm">Monthly Budget:</span>
          <span className="text-purple-800 font-semibold">{formatCurrency(getMonthlyBudget())}</span>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {expenses.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No expenses this month</p>
        ) : (
          expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex-1 min-w-0 pr-3">
                <p className="font-medium text-gray-900 truncate">{expense.description}</p>
                <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(expense.amount)}</span>
                <button
                  type="button"
                  onClick={() => onEditExpense(expense)}
                  className="text-amber-600 hover:text-amber-700 transition-colors"
                  title="Edit expense"
                  aria-label="Edit expense"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.536a2 2 0 01-.879.513l-3.244.811a.5.5 0 01-.606-.606l.811-3.244A2 2 0 019 11z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteExpense(category.id, expense)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                  title="Delete expense"
                  aria-label="Delete expense"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-md font-medium"
        >
          Close
        </button>
      </div>
    </ModalFrame>
  );
}

function MonthlyReportModal({ selectedMonth, reportData, onClose }) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const monthName = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const getTotalSpent = () => {
    return reportData.reduce((total, item) => total + item.totalSpent, 0);
  };

  const getTotalExpenses = () => {
    return reportData.reduce((total, item) => total + item.expenseCount, 0);
  };

  return (
    <ModalFrame onClose={onClose} titleId="monthly-report-title" maxWidth="max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h2 id="monthly-report-title" className="text-xl sm:text-2xl font-bold text-green-600">
          Monthly Report - {monthName}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          title="Close"
          aria-label="Close monthly report"
        >
          ×
        </button>
      </div>

      <div className="mb-6 p-4 bg-green-50 rounded-lg">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-green-700 font-medium">Spent</p>
            <p className="text-green-900 font-bold text-2xl">{formatCurrency(getTotalSpent())}</p>
          </div>
          <div className="text-center">
            <p className="text-green-700 font-medium">Expenses</p>
            <p className="text-green-900 font-bold text-2xl">{getTotalExpenses()}</p>
          </div>
          <div className="text-center">
            <p className="text-green-700 font-medium">Categories</p>
            <p className="text-green-900 font-bold text-2xl">{reportData.length}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 max-h-128 overflow-y-auto">
        {reportData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-lg">No expenses found for {monthName}</p>
          </div>
        ) : (
          reportData.map((item) => (
            <div key={item.category.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{item.category.name}</h3>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(item.totalSpent)}</p>
                  <p className="text-sm text-gray-600">
                    {item.expenseCount} expense{item.expenseCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {item.expenses.map((expense) => (
                  <div key={expense.id} className="flex justify-between items-center p-2 bg-white rounded border">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="font-medium text-gray-900 truncate">{expense.description}</p>
                      <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
                    </div>
                    <span className="font-semibold text-gray-900">{formatCurrency(expense.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-md font-medium"
        >
          Close
        </button>
      </div>
    </ModalFrame>
  );
}
