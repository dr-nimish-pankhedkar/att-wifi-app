-- Add IP address and device tracking to kitchen log entries
-- Run these one at a time in Supabase SQL editor

ALTER TABLE daily_kitchen_log_entries ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE daily_kitchen_log_entries ADD COLUMN IF NOT EXISTS user_agent text;
