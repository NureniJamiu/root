/**
 * Plans and what they unlock: the one place a paywall decides anything.
 *
 * Every gated route asks `planAllows(plan, feature)` on the server; the
 * browser asks the same question only to show an upgrade hint, never to
 * protect anything. Billing (who is on which plan) is not decided here: a
 * plan is stored per user and defaults to `AI_DEFAULT_PLAN`.
 *
 * Dependency-free so the server and the browser share it.
 */

export const PLANS = ['free', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

/** Everything a plan can unlock. Future paid features join this list. */
export const FEATURES = [
  /** Turn a topic into a starting map of ideas. */
  'ai.map',
  /** Suggest connected ideas for one idea. */
  'ai.expand',
  /** Rewrite, shorten, expand or continue selected document text. */
  'ai.rewrite',
  /** Write a whole document from a branch of the canvas. */
  'ai.draft',
  /** Use premium models (such as Claude) on the app's keys. */
  'models.premium',
] as const;
export type Feature = (typeof FEATURES)[number];

/** The AI features, i.e. the ones that spend a monthly AI action. */
export type AiFeature = Extract<Feature, `ai.${string}`>;

export interface PlanDefinition {
  readonly label: string;
  readonly features: readonly Feature[];
  /** AI actions per calendar month on the app's keys. Own-key calls are not counted. */
  readonly monthlyActions: number;
}

export const PLAN_DEFINITIONS: Record<Plan, PlanDefinition> = {
  free: {
    label: 'Free',
    features: ['ai.map', 'ai.expand', 'ai.rewrite'],
    monthlyActions: 30,
  },
  pro: {
    label: 'Pro',
    features: ['ai.map', 'ai.expand', 'ai.rewrite', 'ai.draft', 'models.premium'],
    monthlyActions: 1000,
  },
};

export function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && (PLANS as readonly string[]).includes(value);
}

export function planAllows(plan: Plan, feature: Feature): boolean {
  return PLAN_DEFINITIONS[plan].features.includes(feature);
}

/** The plan that unlocks `feature` most cheaply, for upgrade hints. */
export function cheapestPlanFor(feature: Feature): Plan | null {
  return PLANS.find((p) => planAllows(p, feature)) ?? null;
}

export const FEATURE_LABELS: Record<Feature, string> = {
  'ai.map': 'Map a topic',
  'ai.expand': 'Expand an idea',
  'ai.rewrite': 'Rewrite text',
  'ai.draft': 'Draft with AI',
  'models.premium': 'Premium models',
};
