import { useState, useEffect } from "react";
import { CategoriesService } from "../libs/categories.services";
import { ExpensesService } from "../libs/expenses.services";

export default function Index() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [showDeleteExpenseConfirm, setShowDeleteExpenseConfirm] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [showWeeklyExpenses, setShowWeeklyExpenses] = useState(false);
  const [showMonthlyExpenses, setShowMonthlyExpenses] = useState(false);
  const [selectedCategoryForExpenses, setSelectedCategoryForExpenses] = useState(null);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [selectedReportMonth, setSelectedReportMonth] = useState('');

  const addCategory = async (newCategory) => {
    try {
      // Only send the data that the database expects (no id, it's auto-generated)
      const categoryData = {
        name: newCategory.name,
        weekly_budget: newCategory.weekly_budget
      };
      
      const createdCategory = await CategoriesService.createCategory(categoryData);
      setCategories([...categories, createdCategory]);
      setShowCategoryForm(false);
    } catch (error) {
      console.error('Failed to add category:', error);
      // You can add user-friendly error handling here
      alert('Failed to create category: ' + error.message);
    }
  };

  const addExpense = async (categoryId, expense) => {
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
    } catch (error) {
      console.error('Failed to add expense:', error);
      alert('Failed to create expense: ' + error.message);
    }
  };

  const deleteCategory = async (categoryId) => {
    try {
      await CategoriesService.deleteCategory(categoryId);
      setCategories(categories.filter(cat => cat.id !== categoryId));
      // Also remove associated expenses from local state
      setExpenses(expenses.filter(exp => exp.category_id !== categoryId));
      setShowDeleteConfirm(false);
      setCategoryToDelete(null);
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category: ' + error.message);
    }
  };

  const handleDeleteClick = (category) => {
    setCategoryToDelete(category);
    setShowDeleteConfirm(true);
  };

  const deleteExpense = async (categoryId, expenseId) => {
    try {
      await ExpensesService.deleteExpense(expenseId);
      setExpenses(expenses.filter(exp => exp.id !== expenseId));
      setShowDeleteExpenseConfirm(false);
      setExpenseToDelete(null);
    } catch (error) {
      console.error('Failed to delete expense:', error);
      alert('Failed to delete expense: ' + error.message);
    }
  };

  const handleDeleteExpenseClick = (categoryId, expense) => {
    setExpenseToDelete({ categoryId, expense });
    setShowDeleteExpenseConfirm(true);
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

  // Generate list of available months (last 12 months)
  const getAvailableMonths = () => {
    const months = [];
    const now = new Date();
    
    for (let i = 1; i <= 12; i++) {
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
        alert('Failed to load data: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);


  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
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
              const weeklyRemaining = category.weekly_budget - weeklySpent;
              // Monthly budget based on days in current month
              const monthlyBudget = getMonthlyBudget(category.weekly_budget);
              const monthlyRemaining = monthlyBudget - monthlySpent;

            return (
              <div key={category.id} className="bg-white rounded-lg shadow-md p-3 sm:p-4">
                {/* Header with title and actions */}
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">{category.name}</h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setSelectedCategoryId(category.id);
                        setShowExpenseForm(true);
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                      title="Add expense"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
                      <span className="font-bold">${weeklySpent.toFixed(0)} / ${category.weekly_budget.toFixed(0)}</span>
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
                      <span className="font-bold">${monthlySpent.toFixed(0)} / ${monthlyBudget.toFixed(0)}</span>
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
                        <span className="text-gray-900 font-semibold">${expense.amount.toFixed(0)}</span>
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
            onSubmit={addCategory}
            onCancel={() => setShowCategoryForm(false)}
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
          />
        )}

        {/* Weekly Expenses Modal */}
        {showWeeklyExpenses && selectedCategoryForExpenses && (
          <WeeklyExpensesModal
            category={selectedCategoryForExpenses}
            expenses={getCurrentWeekExpenses(getCategoryExpenses(selectedCategoryForExpenses.id))}
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

        {/* Add New Category Button */}
         <button
            onClick={() => setShowCategoryForm(true)}
            disabled={loading}
            className="mt-5 w-full sm:w-auto bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-6 py-3 sm:py-2 rounded-lg font-medium text-lg sm:text-base"
          >
            {loading ? 'Loading...' : 'Add New Category'}
          </button>
      </div>
    </div>
  );
}

function DeleteExpenseConfirmModal({ expense, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg sm:text-xl font-semibold mb-4 text-red-600">Delete Expense</h2>
        <p className="text-gray-700 mb-2">
          Are you sure you want to delete this expense?
        </p>
        <div className="bg-gray-50 rounded-lg p-3 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium text-gray-900">{expense.description}</p>
              <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
            </div>
            <p className="text-lg font-semibold text-gray-900">${expense.amount.toFixed(2)}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          This action cannot be undone.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onConfirm}
            className="w-full sm:flex-1 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Delete Expense
          </button>
          <button
            onClick={onCancel}
            className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


function CategoryForm({ onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    weeklyBudget: '',
    monthlyBudget: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      weekly_budget: parseFloat(formData.weeklyBudget),
    //   monthlyBudget: parseFloat(formData.monthlyBudget)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Add New Category</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Weekly Budget ($)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={formData.weeklyBudget}
              onChange={(e) => setFormData({ ...formData, weeklyBudget: e.target.value })}
              className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
            />
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="submit"
              className="w-full sm:flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
            >
              Add Category
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function DeleteConfirmModal({ category, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg sm:text-xl font-semibold mb-4 text-red-600">Delete Category</h2>
        <p className="text-gray-700 mb-2">
          Are you sure you want to delete the <strong>"{category.name}"</strong> category?
        </p>
        <p className="text-sm text-gray-600 mb-6">
          This will permanently delete the category and all expenses associated with it. This action cannot be undone.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onConfirm}
            className="w-full sm:flex-1 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Delete Category
          </button>
          <button
            onClick={onCancel}
            className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}


function ExpenseForm({ categoryId, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(categoryId, {
      description: formData.description,
      amount: parseFloat(formData.amount),
      date: formData.date
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Add New Expense</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount ($)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-4 py-3 sm:px-3 sm:py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="submit"
              className="w-full sm:flex-1 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
            >
              Add Expense
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:flex-1 bg-gray-300 hover:bg-gray-400 active:bg-gray-500 text-gray-700 py-3 sm:py-2 rounded-md font-medium text-base sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WeeklyExpensesModal({ category, expenses, onDeleteExpense, onClose }) {
  const getTotalAmount = () => {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-blue-600">
            Weekly Expenses - {category.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            title="Close"
          >
            ×
          </button>
        </div>
        
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-blue-700 font-medium">Total Weekly Spending:</span>
            <span className="text-blue-900 font-bold text-lg">${getTotalAmount().toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-blue-600 text-sm">Weekly Budget:</span>
            <span className="text-blue-800 font-semibold">${category.weekly_budget.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {expenses.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No expenses this week</p>
          ) : (
            expenses.map((expense) => (
              <div key={expense.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="font-medium text-gray-900 truncate">{expense.description}</p>
                  <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-gray-900">${expense.amount.toFixed(2)}</span>
                  <button
                    onClick={() => onDeleteExpense(category.id, expense)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    title="Delete expense"
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
            onClick={onClose}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-md font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthlyExpensesModal({ category, expenses, onDeleteExpense, onClose }) {
  const getTotalAmount = () => {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
  };

  // Calculate monthly budget
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
    <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-purple-600">
            Monthly Expenses - {category.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            title="Close"
          >
            ×
          </button>
        </div>
        
        <div className="mb-4 p-3 bg-purple-50 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-purple-700 font-medium">Total Monthly Spending:</span>
            <span className="text-purple-900 font-bold text-lg">${getTotalAmount().toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-purple-600 text-sm">Monthly Budget:</span>
            <span className="text-purple-800 font-semibold">${getMonthlyBudget().toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {expenses.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No expenses this month</p>
          ) : (
            expenses.map((expense) => (
              <div key={expense.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="font-medium text-gray-900 truncate">{expense.description}</p>
                  <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-gray-900">${expense.amount.toFixed(2)}</span>
                  <button
                    onClick={() => onDeleteExpense(category.id, expense)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    title="Delete expense"
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
            onClick={onClose}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-md font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthlyReportModal({ selectedMonth, reportData, onClose }) {
  const [year, month] = selectedMonth.split('-').map(Number);
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  const getTotalSpent = () => {
    return reportData.reduce((total, item) => total + item.totalSpent, 0);
  };

  const getTotalExpenses = () => {
    return reportData.reduce((total, item) => total + item.expenseCount, 0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-green-600">
            Monthly Report - {monthName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            title="Close"
          >
            ×
          </button>
        </div>
        
        {/* Summary Section */}
        <div className="mb-6 p-4 bg-green-50 rounded-lg">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-green-700 font-medium">Spent</p>
              <p className="text-green-900 font-bold text-2xl">${getTotalSpent().toFixed(2)}</p>
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

        {/* Categories Report */}
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
                    <p className="text-lg font-bold text-gray-900">${item.totalSpent.toFixed(2)}</p>
                    <p className="text-sm text-gray-600">{item.expenseCount} expense{item.expenseCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                
                {/* Expenses List */}
                <div className="space-y-2">
                  {item.expenses.map((expense) => (
                    <div key={expense.id} className="flex justify-between items-center p-2 bg-white rounded border">
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="font-medium text-gray-900 truncate">{expense.description}</p>
                        <p className="text-sm text-gray-600">{new Date(expense.expense_date).toLocaleDateString()}</p>
                      </div>
                      <span className="font-semibold text-gray-900">${expense.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-md font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
