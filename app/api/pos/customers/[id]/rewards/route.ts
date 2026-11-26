export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosUser, unauthorized } from '@/lib/pos/auth';
import { getProgress } from '@/lib/pos/milestonesServer';

const UUID = /^[0-9a-f-]{36}$/i;

/** GET — a customer's milestone progress + rewards earned but not yet given. */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requirePosUser(request))) return unauthorized();
  if (!UUID.test(params.id)) return bad('Bad customer');
  return NextResponse.json(await getProgress(createAdminClient(), params.id));
}

/** POST { reward_id } — mark a reward as given to the customer. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await requirePosUser(request);
  if (!actor) return unauthorized();
  const { reward_id } = await request.json().catch(() => ({}));
  if (!UUID.test(params.id) || typeof reward_id !== 'string' || !UUID.test(reward_id)) return bad('Bad request');
  const { error } = await createAdminClient().from('customer_rewards')
    .update({ status: 'given', given_at: new Date().toISOString(), given_by: actor.staffId })
    .eq('id', reward_id).eq('customer_id', params.id).eq('status', 'earned');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
