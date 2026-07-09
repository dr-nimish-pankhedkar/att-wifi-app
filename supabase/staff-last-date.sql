-- Add last_date to profiles for tracking resigned/inactive staff
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_date date;
