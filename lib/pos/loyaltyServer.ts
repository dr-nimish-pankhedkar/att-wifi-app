import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseLoyalty, type LoyaltyConfig } from './loyalty';

export async function getLoyaltyConfig(supabase: SupabaseClient): Promise<LoyaltyConfig> {
  const { data } = await supabase.from('settings').select('loyalty').limit(1).maybeSingle();
  return normaliseLoyalty(data?.loyalty);
}

export async function getBalance(supabase: SupabaseClient, customerId: string): Promise<number> {
  const { data } = await supabase.from('customer_balances').select('balance').eq('customer_id', customerId).maybeSingle();
  return Number(data?.balance ?? 0);
}

/** Find or create a customer by phone; fills/updates the name when one is given. */
export async function upsertCustomer(supabase: SupabaseClient, phone: string, name?: string | null) {
  const clean = name?.toString().trim().slice(0, 80) || null;
  const { data: existing } = await supabase.from('customers').select('id, name').eq('phone', phone).maybeSingle();
  if (existing) {
    if (clean && clean !== existing.name) await supabase.from('customers').update({ name: clean }).eq('id', existing.id);
    return existing.id as string;
  }
  const { data, error } = await supabase.from('customers').insert({ phone, name: clean }).select('id').single();
  if (error) {
    const { data: again } = await supabase.from('customers').select('id').eq('phone', phone).single(); // lost a race
    return again!.id as string;
  }
  return data.id as string;
}
