-- Counter cash denomination log
-- Run each statement separately in Supabase SQL editor

CREATE TABLE IF NOT EXISTS counter_cash_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date    date NOT NULL UNIQUE,
  count_500   integer NOT NULL DEFAULT 0,
  count_200   integer NOT NULL DEFAULT 0,
  count_100   integer NOT NULL DEFAULT 0,
  count_50    integer NOT NULL DEFAULT 0,
  count_20    integer NOT NULL DEFAULT 0,
  count_10    integer NOT NULL DEFAULT 0,
  total       numeric NOT NULL DEFAULT 0,
  logged_by   uuid,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE counter_cash_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccl_insert" ON counter_cash_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "ccl_select" ON counter_cash_logs FOR SELECT USING (true);

CREATE POLICY "ccl_update" ON counter_cash_logs FOR UPDATE USING (true);
