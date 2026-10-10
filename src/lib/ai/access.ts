/**
 * Who may run what: the models a person can use given their plan and the keys
 * that exist, and which model and key a call runs on.
 *
 * Pure functions over plain data, so the rules are tested without a database
 * or a network.
 */

import type { AiModelOption } from './contracts';
import { chooseModel, findModel } from './models';
import type { AiModel, AiProvider, ModelRole } from './models';
import { planAllows } from './plans';
import type { Plan } from './plans';

export interface AccessInput {
  readonly catalog: readonly AiModel[];
  readonly plan: Plan;
  /** Providers the app has a key for. */
  readonly appProviders: ReadonlySet<AiProvider>;
  /** Providers the person added their own key for. */
  readonly ownProviders: ReadonlySet<AiProvider>;
}

/**
 * Every model with whether it can run (some key exists) and whether the plan
 * locks it. A premium model is unlocked by a paid plan, or by the person's
 * own key for its provider (then they pay the provider, not us).
 */
export function modelOptions(input: AccessInput): AiModelOption[] {
  const premiumOnPlan = planAllows(input.plan, 'models.premium');
  return input.catalog.map((m) => {
    const own = input.ownProviders.has(m.provider);
    return {
      ...m,
      available: own || input.appProviders.has(m.provider),
      locked: m.tier === 'premium' && !premiumOnPlan && !own,
    };
  });
}

export function usableModels(input: AccessInput): AiModel[] {
  return modelOptions(input)
    .filter((m) => m.available && !m.locked)
    .map((m) => findModel(input.catalog, m.id)!);
}

export interface ModelDefaults {
  readonly userModelId: string | null;
  readonly fastModelId: string | null;
  readonly smartModelId: string | null;
}

/** The model a call in `role` runs on, or null when nothing is usable. */
export function resolveModel(input: AccessInput, defaults: ModelDefaults, role: ModelRole): AiModel | null {
  return chooseModel(usableModels(input), {
    userModelId: defaults.userModelId,
    roleDefaultId: role === 'smart' ? defaults.smartModelId : defaults.fastModelId,
    appDefaultId: defaults.fastModelId,
  });
}

/** The person's own key wins over the app's, so their calls are not counted. */
export function keySourceFor(model: AiModel, input: AccessInput): 'own' | 'app' | null {
  if (input.ownProviders.has(model.provider)) return 'own';
  if (input.appProviders.has(model.provider)) return 'app';
  return null;
}
