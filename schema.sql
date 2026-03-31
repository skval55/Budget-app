-- Budget App Database Schema
-- This schema supports multiple users with categories and expenses

-- Users table (for future multi-user support)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    weekly_budget DECIMAL(10, 2) NOT NULL CHECK (weekly_budget >= 0),
    savings_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure category names are unique per user
    UNIQUE(user_id, name)
);

-- Expenses table
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    description VARCHAR(500) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_expenses_category_id ON expenses(category_id);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category_date ON expenses(category_id, expense_date);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Recurring payments + income additions (safe for existing databases)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recurring_expenses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 31),
    month_of_year SMALLINT CHECK (month_of_year BETWEEN 1 AND 12),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    notes VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recurring_incomes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 31),
    day_of_month_secondary SMALLINT CHECK (day_of_month_secondary BETWEEN 1 AND 31),
    month_of_year SMALLINT CHECK (month_of_year BETWEEN 1 AND 12),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    notes VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS category_savings_rollovers (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month_start DATE NOT NULL,
    month_end DATE NOT NULL,
    budget_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    spent_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    rollover_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'skipped')),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, month_start)
);

CREATE TABLE IF NOT EXISTS category_savings_transactions (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    month_start DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'monthly_rollover' CHECK (source IN ('monthly_rollover')),
    rollover_id INTEGER REFERENCES category_savings_rollovers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    nightly_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    nightly_time TIME NOT NULL DEFAULT '20:00:00',
    weekly_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    weekly_day_of_week SMALLINT NOT NULL DEFAULT 0 CHECK (weekly_day_of_week BETWEEN 0 AND 6),
    weekly_time TIME NOT NULL DEFAULT '18:00:00',
    timezone VARCHAR(120) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    device_label VARCHAR(120) NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(endpoint)
);

CREATE TABLE IF NOT EXISTS notification_dispatch_logs (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('nightly', 'weekly')),
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS savings_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) NOT NULL DEFAULT 'variable';

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS recurring_expense_id INTEGER REFERENCES recurring_expenses(id) ON DELETE SET NULL;

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS generated_for_date DATE;

ALTER TABLE expenses
    ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE recurring_expenses
    ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE recurring_incomes
    ADD COLUMN IF NOT EXISTS day_of_month_secondary SMALLINT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'recurring_expenses_category_id_fkey'
    ) THEN
        ALTER TABLE recurring_expenses
            DROP CONSTRAINT recurring_expenses_category_id_fkey;
    END IF;

    ALTER TABLE recurring_expenses
        ADD CONSTRAINT recurring_expenses_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'recurring_incomes_day_of_month_secondary_check'
    ) THEN
        ALTER TABLE recurring_incomes
            ADD CONSTRAINT recurring_incomes_day_of_month_secondary_check
            CHECK (
                day_of_month_secondary IS NULL
                OR day_of_month_secondary BETWEEN 1 AND 31
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'expenses_entry_type_check'
    ) THEN
        ALTER TABLE expenses
            ADD CONSTRAINT expenses_entry_type_check
            CHECK (entry_type IN ('variable', 'recurring'));
    END IF;

    ALTER TABLE category_savings_rollovers
        DROP CONSTRAINT IF EXISTS category_savings_rollovers_status_check;

    ALTER TABLE category_savings_rollovers
        ADD CONSTRAINT category_savings_rollovers_status_check
        CHECK (status IN ('pending', 'confirmed', 'skipped'));

    ALTER TABLE push_subscriptions
        DROP CONSTRAINT IF EXISTS push_subscriptions_status_check;

    ALTER TABLE push_subscriptions
        ADD CONSTRAINT push_subscriptions_status_check
        CHECK (status IN ('active', 'inactive'));

    ALTER TABLE notification_dispatch_logs
        DROP CONSTRAINT IF EXISTS notification_dispatch_logs_reminder_type_check;

    ALTER TABLE notification_dispatch_logs
        ADD CONSTRAINT notification_dispatch_logs_reminder_type_check
        CHECK (reminder_type IN ('nightly', 'weekly'));

    ALTER TABLE notification_dispatch_logs
        DROP CONSTRAINT IF EXISTS notification_dispatch_logs_status_check;

    ALTER TABLE notification_dispatch_logs
        ADD CONSTRAINT notification_dispatch_logs_status_check
        CHECK (status IN ('pending', 'sent', 'failed'));
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_status ON recurring_expenses(status);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_category_id ON recurring_expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_incomes_status ON recurring_incomes(status);
CREATE INDEX IF NOT EXISTS idx_category_savings_rollovers_category_month
    ON category_savings_rollovers(category_id, month_start);
CREATE INDEX IF NOT EXISTS idx_category_savings_rollovers_status_month
    ON category_savings_rollovers(status, month_start);
CREATE INDEX IF NOT EXISTS idx_category_savings_transactions_category_month
    ON category_savings_transactions(category_id, month_start);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_status
    ON push_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_subscription
    ON notification_dispatch_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_scheduled_for
    ON notification_dispatch_logs(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_expenses_entry_type ON expenses(entry_type);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring_expense_id ON expenses(recurring_expense_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_generated_unique
    ON expenses(recurring_expense_id, generated_for_date)
    WHERE recurring_expense_id IS NOT NULL AND generated_for_date IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_savings_rollovers_unique
    ON category_savings_rollovers(category_id, month_start);

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_savings_transactions_monthly_unique
    ON category_savings_transactions(category_id, month_start, source);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_dispatch_logs_unique
    ON notification_dispatch_logs(subscription_id, reminder_type, scheduled_for);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_singleton
    ON notification_settings((true));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_recurring_expenses_updated_at'
    ) THEN
        CREATE TRIGGER update_recurring_expenses_updated_at
            BEFORE UPDATE ON recurring_expenses
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_recurring_incomes_updated_at'
    ) THEN
        CREATE TRIGGER update_recurring_incomes_updated_at
            BEFORE UPDATE ON recurring_incomes
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_category_savings_rollovers_updated_at'
    ) THEN
        CREATE TRIGGER update_category_savings_rollovers_updated_at
            BEFORE UPDATE ON category_savings_rollovers
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_category_savings_transactions_updated_at'
    ) THEN
        CREATE TRIGGER update_category_savings_transactions_updated_at
            BEFORE UPDATE ON category_savings_transactions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_notification_settings_updated_at'
    ) THEN
        CREATE TRIGGER update_notification_settings_updated_at
            BEFORE UPDATE ON notification_settings
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_push_subscriptions_updated_at'
    ) THEN
        CREATE TRIGGER update_push_subscriptions_updated_at
            BEFORE UPDATE ON push_subscriptions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_notification_dispatch_logs_updated_at'
    ) THEN
        CREATE TRIGGER update_notification_dispatch_logs_updated_at
            BEFORE UPDATE ON notification_dispatch_logs
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
