/**
 * Subscription tiers. Limits are enforced on-device for UX and must also be
 * enforced by the AI server (see server/src/quota.ts) since the device can't
 * be trusted with billing.
 */

export type PlanId = 'free' | 'pro' | 'business';

export interface Plan {
  id: PlanId;
  /** Monthly price in USD, used for display until store prices load. */
  priceUsd: number;
  maxItems: number;
  aiActionsPerMonth: number;
  forecasting: boolean;
  multiStore: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: 'free', priceUsd: 0, maxItems: 100, aiActionsPerMonth: 20, forecasting: true, multiStore: false },
  pro: { id: 'pro', priceUsd: 14.99, maxItems: Infinity, aiActionsPerMonth: 600, forecasting: true, multiStore: false },
  business: { id: 'business', priceUsd: 49.99, maxItems: Infinity, aiActionsPerMonth: 3000, forecasting: true, multiStore: true },
};

export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function canUseAi(plan: Plan, usedThisMonth: number): boolean {
  return usedThisMonth < plan.aiActionsPerMonth;
}

export function canAddItem(plan: Plan, itemCount: number): boolean {
  return itemCount < plan.maxItems;
}
