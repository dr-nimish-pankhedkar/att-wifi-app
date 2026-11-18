/** Whitelisted, admin-editable POS configuration tables and their editable fields. */
type FieldType = 'text' | 'int' | 'money' | 'bool' | 'uuid';

export interface EntityDef {
  table: string;
  fields: Record<string, FieldType>;
  required: string[];
  /** Before a hard delete: return a reason to block, or 'deactivate' to soft-delete instead. */
  inUse?: (supabase: import('@supabase/supabase-js').SupabaseClient, id: string) => Promise<null | 'deactivate' | string>;
}

const countWhere = async (supabase: import('@supabase/supabase-js').SupabaseClient, table: string, col: string, id: string) => {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq(col, id);
  return count ?? 0;
};

export const ENTITIES: Record<string, EntityDef> = {
  areas: {
    table: 'pos_areas',
    fields: { name: 'text', sort_order: 'int', active: 'bool' },
    required: ['name'],
    inUse: async (s, id) => ((await countWhere(s, 'pos_tables', 'area_id', id)) ? 'Move or delete the tables in this area first' : null),
  },
  tables: {
    table: 'pos_tables',
    fields: { name: 'text', area_id: 'uuid', seats: 'int', sort_order: 'int', active: 'bool' },
    required: ['name', 'area_id'],
    inUse: async (s, id) => ((await countWhere(s, 'orders', 'table_id', id)) ? 'deactivate' : null),
  },
  categories: {
    table: 'menu_categories',
    fields: { name: 'text', sort_order: 'int', active: 'bool' },
    required: ['name'],
    inUse: async (s, id) => ((await countWhere(s, 'menu_items', 'category_id', id)) ? 'Move or delete the items in this category first' : null),
  },
  'addon-groups': {
    table: 'addon_groups',
    fields: { name: 'text', min_select: 'int', max_select: 'int', sort_order: 'int', active: 'bool' },
    required: ['name'],
  },
  'addon-options': {
    table: 'addon_options',
    fields: { group_id: 'uuid', name: 'text', price: 'money', sort_order: 'int', active: 'bool' },
    required: ['group_id', 'name'],
  },
};

export function cleanFields(def: EntityDef, body: Record<string, unknown>, creating: boolean): { row?: Record<string, unknown>; error?: string } {
  const row: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(def.fields)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (t === 'text') {
      const s = (v ?? '').toString().trim().slice(0, 120);
      if (!s) return { error: `${k} cannot be empty` };
      row[k] = s;
    } else if (t === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return { error: `${k} must be a whole number` };
      row[k] = n;
    } else if (t === 'money') {
      const n = Number(v);
      if (!(n >= 0) || n > 1_000_000) return { error: `${k} must be a valid amount` };
      row[k] = Math.round(n * 100) / 100;
    } else if (t === 'bool') {
      row[k] = Boolean(v);
    } else if (t === 'uuid') {
      if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) return { error: `${k} is invalid` };
      row[k] = v;
    }
  }
  if (creating) for (const r of def.required) if (!(r in row)) return { error: `${r} is required` };
  return { row };
}
