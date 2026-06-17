-- ============================================================
-- Run in Supabase SQL Editor
-- ============================================================

-- Add half_day flag to attendance
alter table attendance add column if not exists half_day boolean default false;

-- Public holidays
create table if not exists public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  created_at timestamptz default now()
);

alter table public_holidays enable row level security;
create policy "admin_all_holidays" on public_holidays for all using (is_admin());
create policy "public_read_holidays" on public_holidays for select using (true);
