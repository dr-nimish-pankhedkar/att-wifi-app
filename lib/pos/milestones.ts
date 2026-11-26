/** Visit milestones ("every 5th visit", "5 visits in 7 days") — rules live in settings.milestones. */
export interface MilestoneRule {
  id: string;
  name: string;          // e.g. "Regular’s treat"
  visits: number;        // visits needed
  within_days: number;   // 0 = no time limit (every Nth visit)
  reward: string;        // e.g. "Free cutting chai"
  enabled: boolean;
}

export interface MilestoneProgress { rule: MilestoneRule; count: number }
export interface CustomerReward { id: string; rule_id: string; rule_name: string; reward: string; created_at: string; status: 'earned' | 'given' }

export function normaliseMilestones(raw: unknown): MilestoneRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((r, i) => {
    const o = (r ?? {}) as Partial<MilestoneRule>;
    return {
      id: (o.id ?? '').toString().slice(0, 40) || `rule${i + 1}`,
      name: (o.name ?? '').toString().slice(0, 60) || `Milestone ${i + 1}`,
      visits: Math.min(100, Math.max(2, Math.round(Number(o.visits) || 5))),
      within_days: Math.min(365, Math.max(0, Math.round(Number(o.within_days) || 0))),
      reward: (o.reward ?? '').toString().slice(0, 120) || 'Free treat',
      enabled: o.enabled !== false,
    };
  });
}

export const describeRule = (r: MilestoneRule) =>
  r.within_days ? `${r.visits} visits within ${r.within_days} days` : `every ${r.visits}th visit`;
