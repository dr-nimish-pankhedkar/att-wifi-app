-- Allow 'wastage' as a valid shift type in daily kitchen logs.
-- Uses pg_constraint to find and drop any shift check on each table,
-- regardless of the auto-generated constraint name.

DO $$
DECLARE r RECORD;
BEGIN
  -- Drop any shift check constraint on daily_kitchen_logs
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'daily_kitchen_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%shift%'
  LOOP
    EXECUTE 'ALTER TABLE daily_kitchen_logs DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;

  -- Drop any shift check constraint on daily_kitchen_log_entries (if that table exists)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'daily_kitchen_log_entries') THEN
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'daily_kitchen_log_entries'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%shift%'
    LOOP
      EXECUTE 'ALTER TABLE daily_kitchen_log_entries DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
  END IF;
END $$;

-- Add updated constraints that include 'wastage'
ALTER TABLE daily_kitchen_logs
  ADD CONSTRAINT daily_kitchen_logs_shift_check
  CHECK (shift IN ('in', 'closing', 'wastage'));
