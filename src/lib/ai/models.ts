/**
 * The models Root can run its AI features on, and how one is chosen.
 *
 * Shared by the server (which resolves a model for every AI call) and the
 * browser (which lists the choices in AI settings). Dependency-free so it runs
 * anywhere: no provider SDKs, no Node APIs.
 *
 * A model id is `provider:model`, e.g. `google:gemini-3.8-flash`. Which models
 * a person can use depends on three things:
 *   - a key for its provider exists (the server's, or the person's own),
 *   - their plan allows its tier (premium models need a paid plan, unless the
 *     person brings their own key),
 *   - it can do what the feature needs (every listed model returns structured
 *     output, so today that is all of them).
 */

export const AI_PROVIDERS = ['google', 'anthropic', 'openrouter', 'ollama'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Providers a person can add their own API key for (Ollama runs locally and needs none). */
export const KEYED_PROVIDERS = ['google', 'anthropic', 'openrouter'] as const satisfies readonly AiProvider[];
export type KeyedProvider = (typeof KEYED_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  google: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter',
  ollama: 'Ollama (local)',
};

export type ModelTier = 'standard' | 'premium';

export interface AiModel {
  /** `provider:model`. */
  readonly id: string;
  readonly provider: AiProvider;
  /** The provider's own model id. */
  readonly model: string;
  readonly label: string;
  /** One line shown under the label in settings. */
  readonly description: string;
  /** Premium models need a paid plan, or the person's own key. */
  readonly tier: ModelTier;
  /**
   * List price in US dollars per million tokens, when known, used to estimate
   * what a call cost. `null` for free tiers and unknown prices.
   */
  readonly price: { readonly input: number; readonly output: number } | null;
}

/** Settings the model list depends on (read from the server environment). */
export interface ModelEnv {
  readonly openrouterModel?: string | undefined;
  readonly ollamaModel?: string | undefined;
}

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-oss-120b:free';
export const DEFAULT_OLLAMA_MODEL = 'llama3.2';

/** Every model Root knows about, in the order settings lists them. */
export function modelCatalog(env: ModelEnv = {}): AiModel[] {
  const openrouter = env.openrouterModel?.trim() || DEFAULT_OPENROUTER_MODEL;
  const ollama = env.ollamaModel?.trim() || DEFAULT_OLLAMA_MODEL;
  return [
    {
      id: 'google:gemini-3.8-flash',
      provider: 'google',
      model: 'gemini-3.8-flash',
      label: 'Gemini 3.8 Flash',
      description: 'Fast and capable. Free tier available.',
      tier: 'standard',
      price: null,
    },
    {
      id: 'google:gemini-3.1-pro-preview',
      provider: 'google',
      model: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro (preview)',
      description: 'Stronger writing and reasoning. Needs a Google key with billing on; no free tier.',
      tier: 'premium',
      price: null,
    },
    {
      id: 'google:gemini-3.5-flash-lite',
      provider: 'google',
      model: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash-Lite',
      description: 'Quickest and lightest. Free tier available.',
      tier: 'standard',
      price: null,
    },
    {
      id: 'anthropic:claude-opus-5-5',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      description: 'Most capable for drafting and analysis.',
      tier: 'premium',
      price: { input: 4, output: 20 },
    },
    {
      id: 'anthropic:claude-sonnet-5-5',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      description: 'Fast and strong, at half the price of Opus.',
      tier: 'premium',
      price: { input: 2, output: 10 },
    },
    {
      id: `openrouter:${openrouter}`,
      provider: 'openrouter',
      model: openrouter,
      label: `OpenRouter: ${openrouter}`,
      description: 'Any model on OpenRouter, including free ones.',
      tier: 'standard',
      price: null,
    },
    {
      id: `ollama:${ollama}`,
      provider: 'ollama',
      model: ollama,
      label: `Ollama: ${ollama}`,
      description: 'Runs on your own machine. Nothing leaves it.',
      tier: 'standard',
      price: null,
    },
  ];
}

export function findModel(catalog: readonly AiModel[], id: string | null | undefined): AiModel | undefined {
  return id ? catalog.find((m) => m.id === id) : undefined;
}

/** Estimated cost of a call in millionths of a dollar, or `null` when the price is unknown. */
export function estimateCostMicros(
  model: AiModel,
  usage: { readonly inputTokens: number; readonly outputTokens: number },
): number | null {
  if (!model.price) return null;
  return Math.round(usage.inputTokens * model.price.input + usage.outputTokens * model.price.output);
}

/** Two kinds of work, so each can default to a model suited to it. */
export type ModelRole = 'fast' | 'smart';

export interface ModelChoice {
  /** The person's own pick in settings, if any. */
  readonly userModelId: string | null;
  /** The app's default for this kind of work. */
  readonly roleDefaultId: string | null;
  /** The app's overall default. */
  readonly appDefaultId: string | null;
}

/**
 * The model to use: the person's pick when they may use it, else the app's
 * default for the role, else the app's default, else the first usable model.
 */
export function chooseModel(usable: readonly AiModel[], choice: ModelChoice): AiModel | null {
  for (const id of [choice.userModelId, choice.roleDefaultId, choice.appDefaultId]) {
    const hit = findModel(usable, id);
    if (hit) return hit;
  }
  return usable[0] ?? null;
}
