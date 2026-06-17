-- ============================================================
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add work-week config to settings
alter table settings add column if not exists off_days text default '1';       -- 0=Sun,1=Mon...6=Sat
alter table settings add column if not exists weekend_shift_id uuid references shifts(id) on delete set null;

-- Date-specific shift overrides per staff
create table if not exists shift_overrides (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete cascade,
  override_date date not null,
  shift_id uuid references shifts(id) on delete set null,
  reason text,
  created_at timestamptz default now(),
  unique(staff_id, override_date)
);

alter table shift_overrides enable row level security;
create policy "admin_all_shift_overrides" on shift_overrides for all using (is_admin());
