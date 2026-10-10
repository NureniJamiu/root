/**
 * Building a callable model from a catalog entry and a key.
 *
 * The one file that knows which SDK package serves which provider. Every
 * provider here talks to its API over `fetch`, so this runs on Node and on
 * other JavaScript runtimes alike.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModel, LanguageModel } from 'ai';

import type { AiModel, AiProvider, ModelEnv } from './models';

/** Server settings for AI, read once from the environment. */
export interface AiEnv extends ModelEnv {
  /** The app's own key per provider. A provider without one needs the person's key. */
  readonly appKeys: Partial<Record<AiProvider, string>>;
  /** Where Ollama listens, when it is set up. */
  readonly ollamaBaseUrl: string | undefined;
  /** Default model for fast work (map, expand, rewrite), as `provider:model`. */
  readonly defaultModelId: string | undefined;
  /** Default model for longer writing (drafts). */
  readonly smartModelId: string | undefined;
  /**
   * The one embedding model the search index uses, as `provider:model`, or
   * null for word search only. Changing it re-embeds every project.
   */
  readonly embeddingModelId: string | null;
}

/** Providers that offer an embedding model Root can use. */
export const EMBEDDING_PROVIDERS = ['google'] as const;
export type EmbeddingProvider = (typeof EMBEDDING_PROVIDERS)[number];

/** Vector length stored per passage; smaller vectors keep the index light. */
export const EMBEDDING_DIMENSIONS = 768;

export function embeddingProviderOf(modelId: string | null): EmbeddingProvider | null {
  const provider = modelId?.split(':')[0];
  return (EMBEDDING_PROVIDERS as readonly string[]).includes(provider ?? '') ? (provider as EmbeddingProvider) : null;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readAiEnv(env: Record<string, string | undefined>): AiEnv {
  const ollamaBaseUrl = nonEmpty(env.OLLAMA_BASE_URL);
  const appKeys: Partial<Record<AiProvider, string>> = {};
  const google = nonEmpty(env.GOOGLE_GENERATIVE_AI_API_KEY);
  const anthropic = nonEmpty(env.ANTHROPIC_API_KEY);
  const openrouter = nonEmpty(env.OPENROUTER_API_KEY);
  if (google) appKeys.google = google;
  if (anthropic) appKeys.anthropic = anthropic;
  if (openrouter) appKeys.openrouter = openrouter;
  // Ollama needs no key; a base URL is what makes it available.
  if (ollamaBaseUrl) appKeys.ollama = 'ollama';
  return {
    appKeys,
    ollamaBaseUrl,
    openrouterModel: nonEmpty(env.OPENROUTER_MODEL),
    ollamaModel: nonEmpty(env.OLLAMA_MODEL),
    defaultModelId: nonEmpty(env.AI_DEFAULT_MODEL) ?? 'google:gemini-3.8-flash',
    smartModelId: nonEmpty(env.AI_SMART_MODEL) ?? 'google:gemini-3.8-flash',
    embeddingModelId: embeddingSetting(env.AI_EMBEDDING_MODEL),
  };
}

function embeddingSetting(value: string | undefined): string | null {
  const id = nonEmpty(value) ?? 'google:gemini-embedding-2';
  return id === 'none' || !embeddingProviderOf(id) ? null : id;
}

/** A callable embedding model for `modelId` (`provider:model`), or null when unsupported. */
export function embeddingModelFor(modelId: string, apiKey: string): EmbeddingModel | null {
  const [provider, ...rest] = modelId.split(':');
  const name = rest.join(':');
  if (provider === 'google' && name) return createGoogle({ apiKey }).embedding(name);
  return null;
}

/** A callable model for `model`, using `apiKey` (the app's or the person's). */
export function languageModelFor(model: AiModel, apiKey: string, env: AiEnv): LanguageModel {
  switch (model.provider) {
    case 'google':
      return createGoogle({ apiKey })(model.model);
    case 'anthropic':
      return createAnthropic({ apiKey })(model.model);
    case 'openrouter':
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: OPENROUTER_BASE_URL,
        apiKey,
        supportsStructuredOutputs: true,
        headers: { 'X-Title': 'Root' },
      })(model.model);
    case 'ollama': {
      const base = (env.ollamaBaseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
      return createOpenAICompatible({
        name: 'ollama',
        baseURL: base.endsWith('/v1') ? base : `${base}/v1`,
        supportsStructuredOutputs: true,
      })(model.model);
    }
  }
}
