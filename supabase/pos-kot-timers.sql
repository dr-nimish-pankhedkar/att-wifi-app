alter table public.order_items add column if not exists ready_at timestamptz, add column if not exists served_at timestamptz;
alter table public.settings add column if not exists kot_alert_minutes int not null default 20;

create or replace function public.order_items_kot_times() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.kot_status is distinct from old.kot_status then
    if new.kot_status in ('ready','served') and new.ready_at is null then new.ready_at := now(); end if;
    if new.kot_status = 'served' and new.served_at is null then new.served_at := now(); end if;
    if new.kot_status in ('new','preparing') then new.ready_at := null; new.served_at := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists order_items_kot_times on public.order_items;
create trigger order_items_kot_times before update of kot_status on public.order_items
  for each row execute function public.order_items_kot_times();

update public.order_items set ready_at = updated_at where kot_status in ('ready','served') and ready_at is null;
update public.order_items set served_at = updated_at where kot_status = 'served' and served_at is null;
