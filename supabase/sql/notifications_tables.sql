-- Notifications feature migration for existing databases.

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

DO $$
BEGIN
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

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_status
    ON push_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_subscription
    ON notification_dispatch_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_scheduled_for
    ON notification_dispatch_logs(scheduled_for);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_dispatch_logs_unique
    ON notification_dispatch_logs(subscription_id, reminder_type, scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_settings_singleton
    ON notification_settings((true));

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname = 'update_updated_at_column'
    ) THEN
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
    END IF;
END $$;

