-- Keep order totals correct inside the database (saves API round trips).
create or replace function pos_orders_compute_total() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.discount := least(greatest(coalesce(new.discount, 0), 0), coalesce(new.subtotal, 0));
  new.total := round(coalesce(new.subtotal, 0) - new.discount, 2);
  return new;
end $$;

drop trigger if exists orders_compute_total on public.orders;
create trigger orders_compute_total before insert or update of subtotal, discount on public.orders
for each row execute function pos_orders_compute_total();

create or replace function pos_order_items_subtotal() returns trigger
language plpgsql set search_path = '' as $$
declare oid uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o set subtotal = coalesce((
    select sum(i.price * i.qty) from public.order_items i where i.order_id = oid and i.kot_status <> 'cancelled'
  ), 0) where o.id = oid;
  return null;
end $$;

drop trigger if exists order_items_subtotal on public.order_items;
create trigger order_items_subtotal after insert or delete or update of price, qty, kot_status on public.order_items
for each row execute function pos_order_items_subtotal();
