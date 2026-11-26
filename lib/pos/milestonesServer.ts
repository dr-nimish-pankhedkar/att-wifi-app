import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseMilestones, type CustomerReward, type MilestoneProgress, type MilestoneRule } from './milestones';

/** IST calendar day, so two bills on the same day count as one visit. */
const istDay = (iso: string | Date) => new Date(iso).toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];

export async function getMilestones(supabase: SupabaseClient): Promise<MilestoneRule[]> {
  const { data } = await supabase.from('settings').select('milestones').limit(1).maybeSingle();
  return normaliseMilestones(data?.milestones);
}

async function visitDays(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase.from('orders').select('id, settled_at, total')
    .eq('customer_id', customerId).eq('status', 'settled').not('settled_at', 'is', null)
    .order('settled_at', { ascending: false }).limit(2000);
  return (data ?? []).map((o) => ({ id: o.id as string, day: istDay(o.settled_at as string), total: Number(o.total) }));
}

async function lastRewardDays(supabase: SupabaseClient, customerId: string) {
  const { data } = await supabase.from('customer_rewards').select('rule_id, created_at')
    .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(500);
  const m = new Map<string, string>();
  for (const r of data ?? []) if (!m.has(r.rule_id)) m.set(r.rule_id, istDay(r.created_at));
  return m;
}

type Visit = { id: string; day: string; total: number };

/** Visits that count towards a rule: days with a big-enough bill, after its last reward, inside its time window. */
function countFor(rule: MilestoneRule, visits: Visit[], lastReward: string | undefined, today: string) {
  const from = rule.within_days ? istDay(new Date(Date.now() - (rule.within_days - 1) * 86400_000)) : '';
  return new Set(visits.filter((v) => v.total >= rule.min_bill && v.day <= today && (!lastReward || v.day > lastReward) && (!from || v.day >= from)).map((v) => v.day)).size;
}

export async function getProgress(supabase: SupabaseClient, customerId: string): Promise<{ progress: MilestoneProgress[]; pending: CustomerReward[] }> {
  const [rules, visits, last, { data: pending }] = await Promise.all([
    getMilestones(supabase), visitDays(supabase, customerId), lastRewardDays(supabase, customerId),
    supabase.from('customer_rewards').select('id, rule_id, rule_name, reward, created_at, status').eq('customer_id', customerId).eq('status', 'earned').order('created_at'),
  ]);
  const today = istDay(new Date());
  return {
    progress: rules.filter((r) => r.enabled).map((rule) => ({ rule, count: countFor(rule, visits, last.get(rule.id), today) })),
    pending: (pending ?? []) as CustomerReward[],
  };
}

/** Run after a bill is settled. Only the first bill of the day counts as a new visit. */
export async function awardMilestones(supabase: SupabaseClient, customerId: string, orderId: string): Promise<CustomerReward[]> {
  const rules = (await getMilestones(supabase)).filter((r) => r.enabled);
  if (!rules.length) return [];
  const today = istDay(new Date());
  const visits = await visitDays(supabase, customerId);
  const thisBill = visits.find((v) => v.id === orderId);
  if (!thisBill) return [];
  const last = await lastRewardDays(supabase, customerId);
  // Only the first qualifying bill of the day can complete a milestone.
  const rows: { customer_id: string; order_id: string; rule_id: string; rule_name: string; reward: string }[] = [];
  for (const rule of rules) {
    if (thisBill.total < rule.min_bill) continue;
    if (visits.some((v) => v.id !== orderId && v.day === today && v.total >= rule.min_bill)) continue;
    const done = last.get(rule.id); // last time the whole trail was completed
    const count = countFor(rule, visits, done, today);
    if (count >= rule.visits) {
      rows.push({ customer_id: customerId, order_id: orderId, rule_id: rule.id, rule_name: rule.name, reward: rule.reward });
    } else if (rule.midway_at && count >= rule.midway_at) {
      const mid = last.get(`${rule.id}@mid`);
      if (!mid || (done && mid <= done)) {
        rows.push({ customer_id: customerId, order_id: orderId, rule_id: `${rule.id}@mid`, rule_name: `${rule.name} · visit ${rule.midway_at}`, reward: rule.midway_reward || rule.reward });
      }
    }
  }
  if (!rows.length) return [];
  const { data } = await supabase.from('customer_rewards').insert(rows).select('id, rule_id, rule_name, reward, created_at, status');
  return (data ?? []) as CustomerReward[];
}
