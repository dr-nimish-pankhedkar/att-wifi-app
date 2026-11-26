alter table public.orders drop constraint if exists orders_payment_mode_check;
alter table public.orders add constraint orders_payment_mode_check check (payment_mode = any (array['cash','upi','split','online','due']));
alter table public.orders
  add column if not exists due_paid_at timestamptz,
  add column if not exists due_paid_mode text check (due_paid_mode in ('cash','upi')),
  add column if not exists due_paid_by uuid references public.profiles(id);
create index if not exists orders_due_open_idx on public.orders (settled_at) where payment_mode = 'due' and due_paid_at is null;
alter table public.settings add column if not exists milestones jsonb not null default '[]'::jsonb;
create table if not exists public.customer_rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  rule_id text not null, rule_name text not null, reward text not null,
  status text not null default 'earned' check (status in ('earned','given')),
  created_at timestamptz not null default now(), given_at timestamptz, given_by uuid references public.profiles(id)
);
create index if not exists customer_rewards_customer_idx on public.customer_rewards (customer_id, rule_id, created_at desc);
alter table public.customer_rewards enable row level security;
