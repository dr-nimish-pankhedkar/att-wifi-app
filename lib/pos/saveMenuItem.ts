import type { SupabaseClient } from '@supabase/supabase-js';

export interface MenuItemInput {
  name?: string; category_id?: string; price?: number; short_code?: string | null; description?: string | null;
  food_type?: 'veg' | 'nonveg' | 'egg'; sort_order?: number; active?: boolean; in_stock?: boolean;
  variation_group?: string;
  variations?: { id?: string; name: string; price: number }[];
  addon_group_ids?: string[];
}

/** Create or update a menu item together with its options and add-on groups. */
export async function saveMenuItem(supabase: SupabaseClient, id: string | null, b: MenuItemInput): Promise<{ id?: string; error?: string }> {
  const row: Record<string, unknown> = {};
  if (b.name !== undefined) { const n = b.name.toString().trim(); if (!n) return { error: 'Name is required' }; row.name = n.slice(0, 120); }
  if (b.category_id !== undefined) row.category_id = b.category_id;
  if (b.short_code !== undefined) row.short_code = b.short_code?.toString().trim().slice(0, 30) || null;
  if (b.description !== undefined) row.description = b.description?.toString().trim().slice(0, 500) || null;
  if (b.food_type !== undefined) { if (!['veg', 'nonveg', 'egg'].includes(b.food_type)) return { error: 'Invalid food type' }; row.food_type = b.food_type; }
  if (b.sort_order !== undefined) row.sort_order = Math.max(0, Math.floor(Number(b.sort_order) || 0));
  if (b.active !== undefined) row.active = Boolean(b.active);
  if (b.in_stock !== undefined) row.in_stock = Boolean(b.in_stock);

  const variations = b.variations?.map((v) => ({ ...v, name: v.name?.toString().trim(), price: Math.round(Number(v.price) * 100) / 100 }));
  if (variations) {
    if (variations.some((v) => !v.name || !(v.price >= 0))) return { error: 'Every option needs a name and a price' };
    if (new Set(variations.map((v) => v.name.toLowerCase())).size !== variations.length) return { error: 'Option names must be different' };
  }
  if (b.price !== undefined) {
    const p = Number(b.price);
    if (!(p >= 0)) return { error: 'Invalid price' };
    row.price = Math.round(p * 100) / 100;
  }
  // With options, the base price shown is the cheapest option.
  if (variations?.length) row.price = Math.min(...variations.map((v) => v.price));

  if (!id) {
    if (!row.name || !row.category_id || row.price === undefined) return { error: 'Name, category and price are required' };
    if (row.sort_order === undefined) {
      const { data: last } = await supabase.from('menu_items').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      row.sort_order = (last?.sort_order ?? 0) + 10;
    }
    const { data, error } = await supabase.from('menu_items').insert(row).select('id').single();
    if (error) return { error: error.code === '23505' ? 'An item with this name already exists in that category' : error.message };
    id = data.id as string;
  } else if (Object.keys(row).length) {
    const { error } = await supabase.from('menu_items').update(row).eq('id', id);
    if (error) return { error: error.code === '23505' ? 'An item with this name already exists in that category' : error.message };
  }

  if (variations) {
    const group = (b.variation_group ?? 'Option').toString().trim().slice(0, 40) || 'Option';
    const { data: existing } = await supabase.from('menu_variations').select('id, name').eq('menu_item_id', id);
    const keepIds = new Set(variations.filter((v) => v.id).map((v) => v.id));
    // Old options are hidden, not deleted, so past bills still resolve them.
    const removed = (existing ?? []).filter((e) => !keepIds.has(e.id)).map((e) => e.id);
    if (removed.length) await supabase.from('menu_variations').update({ active: false, name: `${Date.now()}-removed` }).in('id', removed);
    for (const [i, v] of variations.entries()) {
      const vr = { menu_item_id: id, group_name: group, name: v.name, price: v.price, sort_order: i * 10, active: true };
      const { error } = v.id
        ? await supabase.from('menu_variations').update(vr).eq('id', v.id).eq('menu_item_id', id)
        : await supabase.from('menu_variations').insert(vr);
      if (error) return { error: error.message };
    }
  }

  if (b.addon_group_ids) {
    await supabase.from('menu_item_addon_groups').delete().eq('menu_item_id', id);
    if (b.addon_group_ids.length) {
      const { error } = await supabase.from('menu_item_addon_groups').insert(b.addon_group_ids.map((g) => ({ menu_item_id: id, addon_group_id: g })));
      if (error) return { error: error.message };
    }
  }
  return { id: id! };
}
