export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';
import { ENTITIES, cleanFields } from '@/lib/pos/adminEntities';

/** POST — create a row (area, table, category, add-on group, add-on option). */
export async function POST(request: NextRequest, { params }: { params: { entity: string } }) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const def = ENTITIES[params.entity];
  if (!def) return bad('Unknown type', 404);

  const body = await request.json().catch(() => null);
  if (!body) return bad('Invalid body');
  const { row, error } = cleanFields(def, body, true);
  if (error) return bad(error);

  const supabase = createAdminClient();
  if (!('sort_order' in row!) && 'sort_order' in def.fields) {
    const { data: last } = await supabase.from(def.table).select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    row!.sort_order = ((last?.sort_order as number | undefined) ?? 0) + 10;
  }
  const { data, error: dbErr } = await supabase.from(def.table).insert(row!).select().single();
  if (dbErr) return bad(dbErr.code === '23505' ? 'That name already exists' : dbErr.message, dbErr.code === '23505' ? 409 : 500);
  return NextResponse.json({ row: data }, { status: 201 });
}
