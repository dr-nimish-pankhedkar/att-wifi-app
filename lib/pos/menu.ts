import type { SupabaseClient } from '@supabase/supabase-js';
import type { AddonGroup, CartLineInput, Menu, MenuItem } from './types';

/** Load the full menu. Staff see only active rows; admins can ask for everything. */
export async function loadMenu(supabase: SupabaseClient, includeInactive = false): Promise<Menu> {
  const [cats, items, vars, groups, opts, links, settings] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').order('sort_order'),
    supabase.from('menu_variations').select('*').order('sort_order'),
    supabase.from('addon_groups').select('*').order('sort_order'),
    supabase.from('addon_options').select('*').order('sort_order'),
    supabase.from('menu_item_addon_groups').select('*'),
    supabase.from('settings').select('company_name, bill_title, bill_footer').limit(1).maybeSingle(),
  ]);
  const err = [cats, items, vars, groups, opts, links].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);

  const keep = <T extends { active: boolean }>(r: T) => includeInactive || r.active;

  const addon_groups: AddonGroup[] = (groups.data ?? []).filter(keep).map((g) => ({
    ...g,
    options: (opts.data ?? []).filter((o) => o.group_id === g.id && keep(o)).map((o) => ({ ...o, price: Number(o.price) })),
  }));

  const categories = (cats.data ?? []).filter(keep);
  const catIds = new Set(categories.map((c) => c.id));

  const menuItems: MenuItem[] = (items.data ?? [])
    .filter((i) => keep(i) && (includeInactive || (i.category_id && catIds.has(i.category_id))))
    .map((i) => ({
      ...i,
      price: Number(i.price),
      variations: (vars.data ?? []).filter((v) => v.menu_item_id === i.id && keep(v)).map((v) => ({ ...v, price: Number(v.price) })),
      addon_group_ids: (links.data ?? []).filter((l) => l.menu_item_id === i.id).map((l) => l.addon_group_id),
    }));

  const st = settings.data;
  const bill = { title: st?.bill_title || st?.company_name || '', footer: st?.bill_footer || 'Thank you for visiting!' };
  return { categories, items: menuItems, addon_groups, bill };
}

/**
 * Turn cart lines from a device into priced order_items rows.
 * Prices always come from the database, never from the device.
 */
export function priceLines(menu: Menu, lines: CartLineInput[]) {
  const itemById = new Map(menu.items.map((i) => [i.id, i]));
  const optById = new Map(menu.addon_groups.flatMap((g) => g.options.map((o) => [o.id, { ...o, group: g }] as const)));

  return lines.map((line) => {
    const item = itemById.get(line.menu_item_id);
    if (!item) throw new Error('An item in this order is no longer on the menu');
    if (!item.in_stock) throw new Error(`${item.name} is out of stock`);
    const qty = Math.floor(Number(line.qty));
    if (!(qty > 0 && qty <= 99)) throw new Error(`Invalid quantity for ${item.name}`);

    let unit = item.price;
    let variation_name: string | null = null;
    let variation_id: string | null = null;
    if (item.variations.length > 0) {
      const v = item.variations.find((x) => x.id === line.variation_id);
      if (!v) throw new Error(`Choose an option for ${item.name}`);
      unit = v.price; variation_name = v.name; variation_id = v.id;
    }

    const addons = (line.addon_option_ids ?? []).map((id) => {
      const o = optById.get(id);
      if (!o || !item.addon_group_ids.includes(o.group.id)) throw new Error(`Invalid add-on for ${item.name}`);
      return o;
    });
    for (const gid of item.addon_group_ids) {
      const g = menu.addon_groups.find((x) => x.id === gid);
      if (!g) continue;
      const n = addons.filter((a) => a.group.id === gid).length;
      if (n < g.min_select || n > g.max_select) throw new Error(`${g.name}: choose ${g.min_select}–${g.max_select} for ${item.name}`);
    }
    unit += addons.reduce((s, a) => s + a.price, 0);

    return {
      client_id: line.client_id || null,
      menu_item_id: item.id,
      name: item.name,
      variation_id,
      variation_name,
      addons: addons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
      price: Math.round(unit * 100) / 100,
      qty,
      note: line.note?.toString().slice(0, 200) || null,
    };
  });
}
