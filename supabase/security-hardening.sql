-- Security hardening (Nov 2026)

-- PIN brute-force tracking
create table if not exists auth_attempts (
  id          bigint generated always as identity primary key,
  key         text not null,
  success     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists auth_attempts_key_time_idx on auth_attempts (key, created_at desc);
create index if not exists auth_attempts_time_idx on auth_attempts (created_at desc);
alter table auth_attempts enable row level security;

-- The browser never queries these tables directly; all access goes through server routes
-- (service role). Remove policies that let anyone with the public anon key read/write them.
drop policy if exists ccl_select on public.counter_cash_logs;
drop policy if exists ccl_insert on public.counter_cash_logs;
drop policy if exists ccl_update on public.counter_cash_logs;
drop policy if exists "admin manage kitchen items" on public.daily_kitchen_items;
drop policy if exists "public read kitchen logs" on public.daily_kitchen_logs;
drop policy if exists "public insert kitchen logs" on public.daily_kitchen_logs;
drop policy if exists "public update kitchen logs" on public.daily_kitchen_logs;
drop policy if exists "public delete kitchen logs" on public.daily_kitchen_logs;

-- is_admin(): fixed search_path, and not callable by anonymous visitors.
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','founder'))
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
