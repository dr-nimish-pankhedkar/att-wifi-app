-- Customers + loyalty points (earn on bills, redeem as a bill reduction).

create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  phone          text not null unique check (phone ~ '^[0-9]{10}$'),
  name           text,
  visits         int not null default 0,
  total_spent    numeric(12,2) not null default 0,
  last_visit_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists customers_name_idx on customers (lower(name));

-- One row per points movement. points > 0 = credit, < 0 = debit.
create table if not exists loyalty_ledger (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id) on delete cascade,
  order_id     uuid references orders(id) on delete set null,
  kind         text not null check (kind in ('earn','redeem','adjust','import')),
  points       numeric(10,2) not null,
  note         text,
  source       text not null default 'pos',          -- 'pos' | 'petpooja' | 'admin'
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists loyalty_ledger_customer_idx on loyalty_ledger (customer_id);
create index if not exists loyalty_ledger_order_idx on loyalty_ledger (order_id);

-- Current balance: expired credits drop out.
create or replace view customer_balances with (security_invoker = true) as
select c.id as customer_id,
       coalesce(sum(l.points) filter (where l.points < 0 or l.expires_at is null or l.expires_at > now()), 0)::numeric(10,2) as balance
from customers c left join loyalty_ledger l on l.customer_id = c.id
group by c.id;

alter table orders add column if not exists customer_id uuid references customers(id) on delete set null;
alter table orders add column if not exists loyalty_redeemed numeric(10,2) not null default 0 check (loyalty_redeemed >= 0);
alter table orders add column if not exists loyalty_earned numeric(10,2) not null default 0;

-- Loyalty rules (editable in Admin → POS setup → Loyalty).
alter table settings add column if not exists loyalty jsonb not null default '{}'::jsonb;

-- Total = items − discount − points redeemed.
create or replace function pos_orders_compute_total() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.discount := least(greatest(coalesce(new.discount, 0), 0), coalesce(new.subtotal, 0));
  new.loyalty_redeemed := least(greatest(coalesce(new.loyalty_redeemed, 0), 0), coalesce(new.subtotal, 0) - new.discount);
  new.total := round(coalesce(new.subtotal, 0) - new.discount - new.loyalty_redeemed, 2);
  return new;
end $$;

drop trigger if exists orders_compute_total on public.orders;
create trigger orders_compute_total before insert or update of subtotal, discount, loyalty_redeemed on public.orders
for each row execute function pos_orders_compute_total();

alter table customers enable row level security;
alter table loyalty_ledger enable row level security;
