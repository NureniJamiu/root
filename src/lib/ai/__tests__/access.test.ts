import { describe, expect, it } from 'vitest';

import { keySourceFor, modelOptions, resolveModel, usableModels } from '../access';
import type { AccessInput } from '../access';
import { chooseModel, estimateCostMicros, findModel, modelCatalog } from '../models';
import type { AiProvider } from '../models';
import { cheapestPlanFor, planAllows } from '../plans';

const catalog = modelCatalog();
const input = (plan: 'free' | 'pro', app: AiProvider[], own: AiProvider[] = []): AccessInput => ({
  catalog,
  plan,
  appProviders: new Set(app),
  ownProviders: new Set(own),
});
const defaults = { userModelId: null, fastModelId: 'google:gemini-3.8-flash', smartModelId: 'google:gemini-3.5-flash-lite' };

describe('plans', () => {
  it('keeps drafting and premium models on Pro', () => {
    expect(planAllows('free', 'ai.map')).toBe(true);
    expect(planAllows('free', 'ai.draft')).toBe(false);
    expect(planAllows('pro', 'models.premium')).toBe(true);
    expect(cheapestPlanFor('ai.draft')).toBe('pro');
    expect(cheapestPlanFor('ai.expand')).toBe('free');
  });
});

describe('model access', () => {
  it('lists models without a key as unavailable', () => {
    const opts = modelOptions(input('pro', ['google']));
    expect(opts.find((m) => m.id === 'google:gemini-3.8-flash')).toMatchObject({ available: true, locked: false });
    expect(opts.find((m) => m.provider === 'anthropic')).toMatchObject({ available: false });
  });

  it('locks premium models on Free unless the person brings a key', () => {
    expect(modelOptions(input('free', ['anthropic'])).find((m) => m.provider === 'anthropic')?.locked).toBe(true);
    expect(modelOptions(input('free', [], ['anthropic'])).find((m) => m.provider === 'anthropic')?.locked).toBe(false);
  });

  it('uses the role default, then the person’s pick when allowed', () => {
    const access = input('pro', ['google', 'anthropic']);
    expect(resolveModel(access, defaults, 'fast')?.id).toBe('google:gemini-3.8-flash');
    expect(resolveModel(access, defaults, 'smart')?.id).toBe('google:gemini-3.5-flash-lite');
    const picked = { ...defaults, userModelId: 'anthropic:claude-opus-5-5' };
    expect(resolveModel(access, picked, 'fast')?.id).toBe('anthropic:claude-opus-5-5');
    // On Free the premium pick is ignored.
    expect(resolveModel(input('free', ['google', 'anthropic']), picked, 'fast')?.id).toBe('google:gemini-3.8-flash');
  });

  it('falls back to any usable model, or none', () => {
    expect(resolveModel(input('free', ['openrouter']), defaults, 'fast')?.provider).toBe('openrouter');
    expect(resolveModel(input('free', []), defaults, 'fast')).toBeNull();
    expect(usableModels(input('free', []))).toEqual([]);
  });

  it('prefers the person’s own key', () => {
    const model = findModel(catalog, 'google:gemini-3.8-flash')!;
    expect(keySourceFor(model, input('free', ['google'], ['google']))).toBe('own');
    expect(keySourceFor(model, input('free', ['google']))).toBe('app');
    expect(keySourceFor(model, input('free', []))).toBeNull();
  });

  it('picks with chooseModel in order and estimates cost', () => {
    const usable = catalog.slice(0, 2);
    expect(chooseModel(usable, { userModelId: 'nope', roleDefaultId: usable[1]!.id, appDefaultId: null })).toBe(usable[1]);
    const opus = findModel(catalog, 'anthropic:claude-opus-5-5')!;
    expect(estimateCostMicros(opus, { inputTokens: 1_000, outputTokens: 100 })).toBe(6_000);
    expect(estimateCostMicros(catalog[0]!, { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });

  it('reads OpenRouter and Ollama models from settings', () => {
    const ids = modelCatalog({ openrouterModel: 'x/y:free', ollamaModel: 'qwen3' }).map((m) => m.id);
    expect(ids).toContain('openrouter:x/y:free');
    expect(ids).toContain('ollama:qwen3');
  });
});
