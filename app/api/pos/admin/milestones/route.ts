export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';
import { normaliseMilestones } from '@/lib/pos/milestones';
import { getMilestones } from '@/lib/pos/milestonesServer';

export async function GET(request: NextRequest) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  return NextResponse.json({ milestones: await getMilestones(createAdminClient()) });
}

/** PUT { milestones: MilestoneRule[] } */
export async function PUT(request: NextRequest) {
  if (!(await requirePosAdmin(request))) return unauthorized();
  const body = await request.json().catch(() => null);
  const milestones = normaliseMilestones(body?.milestones);
  if (new Set(milestones.map((m) => m.id)).size !== milestones.length) return bad('Each milestone needs a unique id');
  const supabase = createAdminClient();
  const { data: row } = await supabase.from('settings').select('id').limit(1).maybeSingle();
  if (!row) return bad('Settings not found', 404);
  const { error } = await supabase.from('settings').update({ milestones }).eq('id', row.id);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ milestones });
}
