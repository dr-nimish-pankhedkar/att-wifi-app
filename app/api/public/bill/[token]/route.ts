export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const RATINGS = ['loved', 'okay', 'improve'];

/** POST { rating, comment? } — customer feedback from the public bill page. */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  if (!/^[0-9a-f]{16}$/.test(params.token)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || !RATINGS.includes(body.rating)) return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders').select('id, status, settled_at').eq('public_token', params.token).maybeSingle();
  if (!order || order.status !== 'settled') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.settled_at && Date.now() - new Date(order.settled_at).getTime() > 14 * 86400_000) {
    return NextResponse.json({ error: 'Feedback for this bill is closed' }, { status: 410 });
  }

  const { error } = await supabase.from('orders').update({
    feedback_rating: body.rating,
    feedback_comment: body.comment ? body.comment.toString().trim().slice(0, 500) : null,
    feedback_at: new Date().toISOString(),
  }).eq('id', order.id);
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
