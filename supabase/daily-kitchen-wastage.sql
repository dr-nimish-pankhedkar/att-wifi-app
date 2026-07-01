-- Add 'wastage' as a valid shift type in daily kitchen logs.
-- Wastage is additive (accumulates through the day), tracked separately from consumption.

-- daily_kitchen_logs
alter table daily_kitchen_logs drop constraint if exists daily_kitchen_logs_shift_check;
alter table daily_kitchen_logs
  add constraint daily_kitchen_logs_shift_check
  check (shift in ('in', 'closing', 'wastage'));
