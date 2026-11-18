export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';

/** PATCH { title, footer } — the heading and closing message on WhatsApp bills. */
export async function PATCH(request: NextRequest) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body) return bad('Invalid body');
  const supabase = createAdminClient();
  const { data: row } = await supabase.from('settings').select('id').limit(1).maybeSingle();
  if (!row) return bad('Settings not found', 404);
  const { error } = await supabase.from('settings').update({
    bill_title: (body.title ?? '').toString().slice(0, 80) || null,
    bill_footer: (body.footer ?? '').toString().slice(0, 1000) || null,
  }).eq('id', row.id);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
