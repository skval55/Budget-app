// import { createClient } from '@supabase/supabase-js';

import { supabase } from "./supabaseClient"; 

// Initialize Supabase client (you'll need to set these environment variables)
// const supabaseUrl = process.env.SUPABASE_URL!;
// const supabaseKey = process.env.SUPABASE_ANON_KEY!;
// const supabase = createClient(supabaseUrl, supabaseKey);

// Types
export interface Expense {
  id: number;
  category_id: number;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseData {
  category_id: number;
  description: string;
  amount: number;
  expense_date: string;
}

export interface UpdateExpenseData {
  description?: string;
  amount?: number;
  expense_date?: string;
}

export interface ExpenseFilters {
  category_id?: number;
  start_date?: string;
  end_date?: string;
  limit?: number;
}

// Service class for expense operations
export class ExpensesService {
  
  /**
   * Create a new expense
   */
  static async createExpense(data: CreateExpenseData): Promise<Expense> {
    const { data: expense, error } = await supabase
      .from('expenses')
      .insert([data])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create expense: ${error.message}`);
    }

    return expense;
  }

  /**
   * Get all expenses with optional filters
   */
  static async getExpenses(filters: ExpenseFilters = {}): Promise<Expense[]> {
    let query = supabase
      .from('expenses')
      .select('*');

    // Apply filters
    if (filters.category_id) {
      query = query.eq('category_id', filters.category_id);
    }

    if (filters.start_date) {
      query = query.gte('expense_date', filters.start_date);
    }

    if (filters.end_date) {
      query = query.lte('expense_date', filters.end_date);
    }

    // Order by expense date (most recent first)
    query = query.order('expense_date', { ascending: false });
    query = query.order('created_at', { ascending: false });

    // Apply limit
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data: expenses, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch expenses: ${error.message}`);
    }

    return expenses || [];
  }

  /**
   * Get a single expense by ID
   */
  static async getExpenseById(id: number): Promise<Expense | null> {
    const { data: expense, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No rows returned
      }
      throw new Error(`Failed to fetch expense: ${error.message}`);
    }

    return expense;
  }

  /**
   * Get recent expenses for a category (last N expenses)
   */
  static async getRecentExpenses(categoryId: number, limit: number = 3): Promise<Expense[]> {
    return this.getExpenses({
      category_id: categoryId,
      limit
    });
  }

  /**
   * Get expenses for a specific date range
   */
  static async getExpensesByDateRange(
    categoryId: number,
    startDate: string,
    endDate: string
  ): Promise<Expense[]> {
    return this.getExpenses({
      category_id: categoryId,
      start_date: startDate,
      end_date: endDate
    });
  }

  /**
   * Get weekly expenses (last 7 days)
   */
  static async getWeeklyExpenses(categoryId: number): Promise<Expense[]> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    return this.getExpensesByDateRange(categoryId, startDate, endDate);
  }

  /**
   * Get monthly expenses (last 30 days)
   */
  static async getMonthlyExpenses(categoryId: number): Promise<Expense[]> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    return this.getExpensesByDateRange(categoryId, startDate, endDate);
  }

  /**
   * Calculate total amount spent for expenses
   */
  static calculateTotalAmount(expenses: Expense[]): number {
    return expenses.reduce((total, expense) => total + expense.amount, 0);
  }

  /**
   * Get weekly spending total for a category
   */
  static async getWeeklySpending(categoryId: number): Promise<number> {
    const expenses = await this.getWeeklyExpenses(categoryId);
    return this.calculateTotalAmount(expenses);
  }

  /**
   * Get monthly spending total for a category
   */
  static async getMonthlySpending(categoryId: number): Promise<number> {
    const expenses = await this.getMonthlyExpenses(categoryId);
    return this.calculateTotalAmount(expenses);
  }

  /**
   * Update an expense
   */
  static async updateExpense(id: number, data: UpdateExpenseData): Promise<Expense> {
    const { data: expense, error } = await supabase
      .from('expenses')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update expense: ${error.message}`);
    }

    return expense;
  }

  /**
   * Delete an expense
   */
  static async deleteExpense(id: number): Promise<void> {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete expense: ${error.message}`);
    }
  }

  /**
   * Delete all expenses for a category
   */
  static async deleteExpensesByCategory(categoryId: number): Promise<void> {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('category_id', categoryId);

    if (error) {
      throw new Error(`Failed to delete expenses for category: ${error.message}`);
    }
  }

  /**
   * Get expense statistics for a category
   */
  static async getCategoryExpenseStats(categoryId: number) {
    const [allExpenses, weeklyExpenses, monthlyExpenses] = await Promise.all([
      this.getExpenses({ category_id: categoryId }),
      this.getWeeklyExpenses(categoryId),
      this.getMonthlyExpenses(categoryId)
    ]);

    return {
      totalExpenses: allExpenses.length,
      totalAmount: this.calculateTotalAmount(allExpenses),
      weeklyExpenses: weeklyExpenses.length,
      weeklyAmount: this.calculateTotalAmount(weeklyExpenses),
      monthlyExpenses: monthlyExpenses.length,
      monthlyAmount: this.calculateTotalAmount(monthlyExpenses),
      recentExpenses: allExpenses.slice(0, 3)
    };
  }

  /**
   * Search expenses by description
   */
  static async searchExpenses(
    query: string,
    categoryId?: number
  ): Promise<Expense[]> {
    let supabaseQuery = supabase
      .from('expenses')
      .select('*')
      .ilike('description', `%${query}%`);

    if (categoryId) {
      supabaseQuery = supabaseQuery.eq('category_id', categoryId);
    }

    supabaseQuery = supabaseQuery
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    const { data: expenses, error } = await supabaseQuery;

    if (error) {
      throw new Error(`Failed to search expenses: ${error.message}`);
    }

    return expenses || [];
  }

  /**
   * Bulk create expenses
   */
  static async createExpenses(expenses: CreateExpenseData[]): Promise<Expense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .insert(expenses)
      .select();

    if (error) {
      throw new Error(`Failed to create expenses: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get expenses grouped by month
   */
  static async getExpensesByMonth(
    categoryId: number,
    year: number
  ): Promise<Record<string, Expense[]>> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const expenses = await this.getExpensesByDateRange(categoryId, startDate, endDate);

    // Group by month
    const groupedExpenses: Record<string, Expense[]> = {};
    
    expenses.forEach(expense => {
      const month = expense.expense_date.substring(0, 7); // YYYY-MM
      if (!groupedExpenses[month]) {
        groupedExpenses[month] = [];
      }
      groupedExpenses[month].push(expense);
    });

    return groupedExpenses;
  }
}

// Utility functions
export const ExpenseUtils = {
  /**
   * Format expense amount as currency
   */
  formatCurrency: (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  },

  /**
   * Format expense date
   */
  formatDate: (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  },

  /**
   * Get date N days ago
   */
  getDaysAgo: (days: number): string => {
    const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  },

  /**
   * Check if expense is from this week
   */
  isThisWeek: (expenseDate: string): boolean => {
    const expense = new Date(expenseDate);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return expense >= weekAgo;
  },

  /**
   * Check if expense is from this month
   */
  isThisMonth: (expenseDate: string): boolean => {
    const expense = new Date(expenseDate);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return expense >= monthAgo;
  }
};
