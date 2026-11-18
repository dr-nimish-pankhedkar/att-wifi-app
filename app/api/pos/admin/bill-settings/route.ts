export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';

/** PATCH { title, footer, address, phone, fssai, review_url } — what appears on bills. */
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
    bill_address: (body.address ?? '').toString().slice(0, 300) || null,
    bill_phone: (body.phone ?? '').toString().slice(0, 30) || null,
    bill_fssai: (body.fssai ?? '').toString().slice(0, 30) || null,
    review_url: /^https?:\/\//.test(body.review_url ?? '') ? body.review_url.toString().slice(0, 300) : null,
  }).eq('id', row.id);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true });
}
