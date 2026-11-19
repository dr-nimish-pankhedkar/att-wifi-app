export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad, requirePosAdmin, unauthorized } from '@/lib/pos/auth';
import { cleanPhone } from '@/lib/pos/loyalty';
import { getBalance, upsertCustomer } from '@/lib/pos/loyaltyServer';

/** POST { phone, name?, points (+/-), note } — manual points correction by an admin. */
export async function POST(request: NextRequest) {
  const admin = await requirePosAdmin(request);
  if (!admin) return unauthorized();
  const b = await request.json().catch(() => null);
  const phone = cleanPhone(b?.phone);
  const points = Math.round(Number(b?.points) * 100) / 100;
  if (!phone) return bad('Enter a valid 10-digit mobile number');
  if (!points) return bad('Enter points to add (or a negative number to remove)');
  if (!b?.note?.toString().trim()) return bad('Add a short reason');
  const supabase = createAdminClient();
  const customerId = await upsertCustomer(supabase, phone, b.name);
  if (points < 0 && (await getBalance(supabase, customerId)) + points < 0) return bad('That would make the balance negative');
  const { error } = await supabase.from('loyalty_ledger').insert({
    customer_id: customerId, kind: 'adjust', points, source: 'admin', note: `${b.note.toString().slice(0, 150)} — ${admin.name}`,
  });
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true, balance: await getBalance(supabase, customerId) });
}
