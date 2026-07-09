-- Track cash taken home by founders/managers
ALTER TABLE counter_cash_logs ADD COLUMN IF NOT EXISTS cash_taken numeric NOT NULL DEFAULT 0;
ALTER TABLE counter_cash_logs ADD COLUMN IF NOT EXISTS cash_taken_by text;
