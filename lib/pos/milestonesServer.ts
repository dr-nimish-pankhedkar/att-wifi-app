import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseMilestones, type CustomerReward, type MilestoneProgress, type MilestoneRule } from './milestones';

/** IST calendar day, so two bills on the same day count as one visit. */
const istDay = (iso: string | Date) => new Date(iso).toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];

export async function getMilestones(supabase: SupabaseClient): Promise<MilestoneRule[]> {
  const { data } = await supabase.from('settings').select('milestones').limit(1).maybeSingle();
  return normaliseMilestones(data?.milestones);
}

async function visitDays(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase.from('orders').select('id, settled_at')
    .eq('customer_id', customerId).eq('status', 'settled').not('settled_at', 'is', null)
    .order('settled_at', { ascending: false }).limit(2000);
  return (data ?? []).map((o) => ({ id: o.id as string, day: istDay(o.settled_at as string) }));
}

async function lastRewardDays(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase.from('customer_rewards').select('rule_id, created_at')
    .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(500);
  const m = new Map<string, string>();
  for (const r of data ?? []) if (!m.has(r.rule_id)) m.set(r.rule_id, istDay(r.created_at));
  return m;
}

/** Visits that count towards a rule: days after its last reward, inside its time window. */
function countFor(rule: MilestoneRule, days: string[], lastReward: string | undefined, today: string) {
  const from = rule.within_days ? istDay(new Date(Date.now() - (rule.within_days - 1) * 86400_000)) : '';
  return new Set(days.filter((d) => d <= today && (!lastReward || d > lastReward) && (!from || d >= from))).size;
}

export async function getProgress(supabase: SupabaseClient, customerId: string): Promise<{ progress: MilestoneProgress[]; pending: CustomerReward[] }> {
  const [rules, visits, last, { data: pending }] = await Promise.all([
    getMilestones(supabase), visitDays(supabase, customerId), lastRewardDays(supabase, customerId),
    supabase.from('customer_rewards').select('id, rule_id, rule_name, reward, created_at, status').eq('customer_id', customerId).eq('status', 'earned').order('created_at'),
  ]);
  const today = istDay(new Date());
  const days = visits.map((v) => v.day);
  return {
    progress: rules.filter((r) => r.enabled).map((rule) => ({ rule, count: countFor(rule, days, last.get(rule.id), today) })),
    pending: (pending ?? []) as CustomerReward[],
  };
}

/** Run after a bill is settled. Only the first bill of the day counts as a new visit. */
export async function awardMilestones(supabase: SupabaseClient, customerId: string, orderId: string): Promise<CustomerReward[]> {
  const rules = (await getMilestones(supabase)).filter((r) => r.enabled);
  if (!rules.length) return [];
  const today = istDay(new Date());
  const visits = await visitDays(supabase, customerId);
  if (visits.some((v) => v.id !== orderId && v.day === today)) return [];
  const last = await lastRewardDays(supabase, customerId);
  const days = visits.map((v) => v.day);
  const rows = rules.filter((rule) => countFor(rule, days, last.get(rule.id), today) >= rule.visits)
    .map((rule) => ({ customer_id: customerId, order_id: orderId, rule_id: rule.id, rule_name: rule.name, reward: rule.reward }));
  if (!rows.length) return [];
  const { data } = await supabase.from('customer_rewards').insert(rows).select('id, rule_id, rule_name, reward, created_at, status');
  return (data ?? []) as CustomerReward[];
}
