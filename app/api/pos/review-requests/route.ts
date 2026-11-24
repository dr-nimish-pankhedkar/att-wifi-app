export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePosUser, unauthorized } from '@/lib/pos/auth';

const ASK_AGAIN_AFTER_DAYS = 90; // never pester the same person more than once a quarter

/**
 * GET ?days=4 — unique customers billed in the last N days who should get a Google-review request:
 * not asked in the last 90 days, and nobody who tapped "Needs improvement" on a recent bill.
 */
export async function GET(request: NextRequest) {
  if (!(await requirePosUser(request))) return unauthorized();
  const days = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get('days')) || 4));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const supabase = createAdminClient();

  const [{ data: orders, error }, { data: st }] = await Promise.all([
    supabase.from('orders').select('customer_id, settled_at, feedback_rating, customers(id, name, phone, visits, review_asked_at)')
      .eq('status', 'settled').not('customer_id', 'is', null).gte('settled_at', since).order('settled_at', { ascending: false }).limit(2000),
    supabase.from('settings').select('company_name, bill_title, review_url').limit(1).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const askCutoff = Date.now() - ASK_AGAIN_AFTER_DAYS * 86400_000;
  const unhappy = new Set((orders ?? []).filter((o) => o.feedback_rating === 'improve').map((o) => o.customer_id));
  const seen = new Map<string, { id: string; name: string | null; phone: string; visits: number; last_visit: string }>();
  let skipped = 0;
  for (const o of orders ?? []) {
    const c = (Array.isArray(o.customers) ? o.customers[0] : o.customers) as { id: string; name: string | null; phone: string; visits: number; review_asked_at: string | null } | null;
    if (!c || seen.has(c.id)) continue;
    if (unhappy.has(c.id) || (c.review_asked_at && new Date(c.review_asked_at).getTime() > askCutoff)) { skipped++; seen.set(c.id, null as never); continue; }
    seen.set(c.id, { id: c.id, name: c.name, phone: c.phone, visits: c.visits, last_visit: o.settled_at as string });
  }
  return NextResponse.json({
    days, skipped, cafe: st?.bill_title || st?.company_name || '', review_url: st?.review_url ?? '',
    customers: Array.from(seen.values()).filter(Boolean),
  });
}

/** POST { customer_id } — mark as asked (called when the WhatsApp message is opened). */
export async function POST(request: NextRequest) {
  if (!(await requirePosUser(request))) return unauthorized();
  const { customer_id } = await request.json().catch(() => ({}));
  if (typeof customer_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(customer_id)) return NextResponse.json({ error: 'Bad customer' }, { status: 400 });
  const { error } = await createAdminClient().from('customers').update({ review_asked_at: new Date().toISOString() }).eq('id', customer_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
