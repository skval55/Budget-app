
import { supabase } from "./supabaseClient";

// Types
export interface Category {
  id: number;
  name: string;
  weekly_budget: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryData {
  name: string;
  weekly_budget: number;
}

export interface UpdateCategoryData {
  name?: string;
  weekly_budget?: number;
}

export interface CategoryWithStats extends Category {
  totalExpenses: number;
  totalAmount: number;
  weeklySpent: number;
  weeklyRemaining: number;
  recentExpenses: any[];
}

// Service class for category operations
export class CategoriesService {
  
  /**
   * Create a new category
   */
  static async createCategory(data: CreateCategoryData): Promise<Category> {

    console.log({data})
    const { data: category, error } = await supabase
      .from('categories')
      .insert([data])
      .select()
      .single();

      if (error) {
        console.error('Supabase error:', error);
        throw new Error(`Failed to create category: ${error.message || error.details || 'Unknown database error'}`);
      }

    return category;
  }

  /**
   * Get all categories 
   */
  static async getCategories(): Promise<Category[]> {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }

    return categories || [];
  }

  /**
   * Get a single category by ID
   */
  static async getCategoryById(id: number): Promise<Category | null> {
    const { data: category, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No rows returned
      }
      throw new Error(`Failed to fetch category: ${error.message}`);
    }

    return category;
  }


  /**
   * Update a category
   */
  static async updateCategory(id: number, data: UpdateCategoryData): Promise<Category> {
    const { data: category, error } = await supabase
      .from('categories')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update category: ${error.message}`);
    }

    return category;
  }

  /**
   * Delete a category (will cascade delete all expenses)
   */
  static async deleteCategory(id: number): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete category: ${error.message}`);
    }
  }

  /**
   * Check if category name exists for user
   */
  static async categoryNameExists(name: string, excludeId?: number): Promise<boolean> {
    let query = supabase
      .from('categories')
      .select('id')
      .eq('name', name);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to check category name: ${error.message || error.details || 'Unknown error'}`);
    }

    return (data?.length || 0) > 0;
  }

  

  /**
   * Search categories by name
   */
  static async searchCategories(query: string): Promise<Category[]> {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .ilike('name', `%${query}%`)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to search categories: ${error.message || error.details || 'Unknown error'}`);
    }

    return categories || [];
  }

  /**
   * Get categories with no expenses
   */
  static async getEmptyCategories(): Promise<Category[]> {
    const { data: categories, error } = await supabase
      .from('categories')
      .select(`
        *,
        expenses!left(id)
      `)
      .is('expenses.id', null);

    if (error) {
      throw new Error(`Failed to fetch empty categories: ${error.message || error.details || 'Unknown error'}`);
    }

    return categories || [];
  }
}

// Utility functions for categories
export const CategoryUtils = {
  /**
   * Calculate budget utilization percentage
   */
  getBudgetUtilization: (spent: number, budget: number): number => {
    if (budget === 0) return 0;
    return Math.min((spent / budget) * 100, 100);
  },

  /**
   * Check if category is over budget
   */
  isOverBudget: (spent: number, budget: number): boolean => {
    return spent > budget;
  },

  /**
   * Get budget status
   */
  getBudgetStatus: (spent: number, budget: number): 'under' | 'at' | 'over' => {
    if (spent > budget) return 'over';
    if (spent === budget) return 'at';
    return 'under';
  },

  /**
   * Format budget remaining
   */
  formatRemaining: (spent: number, budget: number): string => {
    const remaining = budget - spent;
    const prefix = remaining >= 0 ? 'remaining' : 'over budget';
    return `$${Math.abs(remaining).toFixed(2)} ${prefix}`;
  },

  /**
   * Get budget color based on utilization
   */
  getBudgetColor: (spent: number, budget: number): string => {
    const utilization = CategoryUtils.getBudgetUtilization(spent, budget);
    
    if (utilization >= 100) return 'red';
    if (utilization >= 80) return 'yellow';
    return 'green';
  }
};
