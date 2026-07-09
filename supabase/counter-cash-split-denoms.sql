-- Split ₹20 and ₹10 into separate note and coin columns
ALTER TABLE counter_cash_logs ADD COLUMN IF NOT EXISTS count_20_note integer NOT NULL DEFAULT 0;
ALTER TABLE counter_cash_logs ADD COLUMN IF NOT EXISTS count_20_coin integer NOT NULL DEFAULT 0;
ALTER TABLE counter_cash_logs ADD COLUMN IF NOT EXISTS count_10_note integer NOT NULL DEFAULT 0;
ALTER TABLE counter_cash_logs ADD COLUMN IF NOT EXISTS count_10_coin integer NOT NULL DEFAULT 0;
