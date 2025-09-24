# Budget App Database Schema

This document explains the database structure for the budget tracking application.

## Database Structure

### Tables

#### `users`
Stores user account information for multi-user support.
- `id` - Primary key
- `email` - Unique user email
- `name` - User's display name
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

#### `categories`
Stores budget categories for each user.
- `id` - Primary key
- `user_id` - Foreign key to users table
- `name` - Category name (unique per user)
- `weekly_budget` - Weekly budget limit (decimal)
- `monthly_budget` - Monthly budget limit (decimal)
- `created_at` - Category creation timestamp
- `updated_at` - Last update timestamp

#### `expenses`
Stores individual expenses within categories.
- `id` - Primary key
- `category_id` - Foreign key to categories table
- `description` - Expense description
- `amount` - Expense amount (must be positive)
- `expense_date` - Date of the expense
- `created_at` - Record creation timestamp
- `updated_at` - Last update timestamp

### Key Features

1. **Data Integrity**
   - Foreign key constraints ensure referential integrity
   - Check constraints prevent negative budgets and amounts
   - Unique constraints prevent duplicate category names per user

2. **Cascade Deletes**
   - Deleting a user removes all their categories and expenses
   - Deleting a category removes all its expenses

3. **Performance Indexes**
   - Optimized queries for common operations
   - Composite indexes for date-range queries

4. **Automatic Timestamps**
   - Auto-updating `updated_at` fields via triggers
   - Tracks when records are created and modified

## Setup Instructions

### 1. Create Database
```sql
-- Run schema.sql to create tables and indexes
psql -d your_database -f schema.sql
```

### 2. Add Sample Data (Optional)
```sql
-- Run seed.sql to add test data
psql -d your_database -f seed.sql
```

### 3. Use Provided Queries
The `queries.sql` file contains optimized queries for common operations:
- Get categories with spending totals
- Calculate weekly/monthly spending
- Retrieve recent expenses
- Budget overview reports

## Database Choice Recommendations

### PostgreSQL (Recommended)
- Excellent JSON support for future features
- Strong ACID compliance
- Great performance with proper indexing
- Works well with Remix/Node.js

### SQLite (Development)
- Good for local development
- Zero configuration
- File-based database

### Supabase (Production)
- PostgreSQL with real-time features
- Built-in authentication
- Auto-generated API
- Perfect for Remix applications

## Migration Strategy

1. Start with the base schema (`schema.sql`)
2. Add sample data for testing (`seed.sql`)
3. Use the provided queries (`queries.sql`) for application logic
4. Create additional migrations as features are added

## Security Considerations

1. **Row Level Security**: Consider implementing RLS policies in PostgreSQL
2. **Input Validation**: Always validate user inputs before database operations
3. **Parameterized Queries**: Use prepared statements to prevent SQL injection
4. **User Isolation**: Ensure users can only access their own data

## Future Enhancements

The schema is designed to support future features:
- User authentication and multi-user support
- Category sharing between users
- Expense attachments (receipts)
- Budget goals and alerts
- Spending analytics and reports
