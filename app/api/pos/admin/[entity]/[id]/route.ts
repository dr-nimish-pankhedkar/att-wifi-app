export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';
import { ENTITIES, cleanFields } from '@/lib/pos/adminEntities';

type Ctx = { params: { entity: string; id: string } };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const def = ENTITIES[params.entity];
  if (!def) return bad('Unknown type', 404);
  const body = await request.json().catch(() => null);
  if (!body) return bad('Invalid body');
  const { row, error } = cleanFields(def, body, false);
  if (error) return bad(error);
  if (!Object.keys(row!).length) return bad('Nothing to update');

  const { data, error: dbErr } = await createAdminClient().from(def.table).update(row!).eq('id', params.id).select().maybeSingle();
  if (dbErr) return bad(dbErr.code === '23505' ? 'That name already exists' : dbErr.message, dbErr.code === '23505' ? 409 : 500);
  if (!data) return bad('Not found', 404);
  return NextResponse.json({ row: data });
}

/** DELETE — hard delete if unused; otherwise hide it (so old bills keep their history) or explain why not. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const def = ENTITIES[params.entity];
  if (!def) return bad('Unknown type', 404);
  const supabase = createAdminClient();

  const usage = def.inUse ? await def.inUse(supabase, params.id) : null;
  if (usage === 'deactivate') {
    await supabase.from(def.table).update({ active: false }).eq('id', params.id);
    return NextResponse.json({ ok: true, deactivated: true });
  }
  if (usage) return bad(usage, 409);

  const { error } = await supabase.from(def.table).delete().eq('id', params.id);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
