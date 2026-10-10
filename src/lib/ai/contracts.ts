/**
 * The shapes that cross the wire for AI features: what the browser sends to
 * `/api/ai/*`, what the models must return, and what the server answers.
 *
 * One Zod schema per shape, shared by both sides so a request the browser
 * builds is exactly what the server validates. React-free and Node-free.
 */

import { z } from 'zod';

import { nodeTypeSchema } from '../../data/schema';
import { NODE_TITLE_MAX } from '../../data/limits';
import type { AiModel, AiProvider, KeyedProvider } from './models';
import type { AiFeature, Feature, Plan } from './plans';

/* -------------------------------------------------------------------------- */
/* Canvas context sent with a request                                         */
/* -------------------------------------------------------------------------- */

/** Longest idea notes sent to a model; the rest is cut (images are never sent). */
export const PROMPT_BODY_MAX = 2_000;
export const PROMPT_NODES_MAX = 600;

/** A canvas reduced to what a model needs: no images, positions or styling. */
export const promptCanvasSchema = z.object({
  title: z.string().max(200),
  nodes: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(NODE_TITLE_MAX),
        body: z.string().max(PROMPT_BODY_MAX),
        type: nodeTypeSchema,
      }),
    )
    .max(PROMPT_NODES_MAX),
  edges: z.array(z.object({ source: z.string().uuid(), target: z.string().uuid() })).max(PROMPT_NODES_MAX * 4),
});
export type PromptCanvas = z.infer<typeof promptCanvasSchema>;

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

export const mapRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  /** What the person already knows or wants to focus on. */
  guidance: z.string().max(1_000).optional(),
});
export type MapRequest = z.infer<typeof mapRequestSchema>;

export const expandRequestSchema = z.object({
  focusId: z.string().uuid(),
  canvas: promptCanvasSchema,
  guidance: z.string().max(500).optional(),
});
export type ExpandRequest = z.infer<typeof expandRequestSchema>;

export const draftRequestSchema = z.object({
  rootId: z.string().uuid(),
  canvas: promptCanvasSchema,
  guidance: z.string().max(500).optional(),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const REWRITE_ACTIONS = ['improve', 'shorten', 'expand', 'continue'] as const;
export type RewriteAction = (typeof REWRITE_ACTIONS)[number];

export const rewriteRequestSchema = z.object({
  action: z.enum(REWRITE_ACTIONS),
  text: z.string().trim().min(1).max(8_000),
  /** Text just before the selection, for tone and continuity. */
  before: z.string().max(2_000).optional(),
  after: z.string().max(2_000).optional(),
  title: z.string().max(200).optional(),
});
export type RewriteRequest = z.infer<typeof rewriteRequestSchema>;

export const settingsRequestSchema = z.object({
  modelId: z.string().max(200).nullable(),
});

export const keyRequestSchema = z.object({
  apiKey: z.string().trim().min(8).max(400),
});

/* -------------------------------------------------------------------------- */
/* What the models return                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One suggested idea. `key` is a short local name ("i1") so suggestions can
 * hang from each other; `parent` is another suggestion's key, or null.
 */
export const ideaSuggestionSchema = z.object({
  key: z.string().min(1).max(40),
  title: z.string().min(1),
  body: z.string(),
  type: nodeTypeSchema,
  parent: z.string().nullable(),
});
export type IdeaSuggestion = z.infer<typeof ideaSuggestionSchema>;

export const ideaSuggestionsSchema = z.object({
  ideas: z.array(ideaSuggestionSchema).min(1),
});
export type IdeaSuggestions = z.infer<typeof ideaSuggestionsSchema>;

/**
 * A drafted document: prose per idea of the branch. Text is Markdown; an idea
 * is cited inline as `[[<idea id>]]`.
 */
export const draftOutputSchema = z.object({
  title: z.string().min(1),
  intro: z.string(),
  sections: z.array(z.object({ ideaId: z.string(), text: z.string() })),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

/** Usage left this month, returned with every AI answer. */
export interface AiAllowance {
  readonly used: number;
  readonly limit: number;
  /** ISO time the count starts again. */
  readonly resetsAt: string;
}

export interface AiResultMeta {
  readonly model: { readonly id: string; readonly label: string };
  readonly allowance: AiAllowance;
  /** The call ran on the person's own key and was not counted. */
  readonly ownKey: boolean;
}

export interface SuggestionsResponse extends AiResultMeta {
  readonly ideas: IdeaSuggestion[];
}

export interface DraftResponse extends AiResultMeta {
  readonly draft: DraftOutput;
}

export interface AiModelOption extends AiModel {
  /** A key exists for its provider (the app's or the person's). */
  readonly available: boolean;
  /** The plan does not allow it (premium on the app's keys). */
  readonly locked: boolean;
}

export interface AiConfig {
  /** At least one model can be used right now. */
  readonly enabled: boolean;
  readonly plan: Plan;
  readonly planLabel: string;
  readonly features: Feature[];
  readonly allowance: AiAllowance;
  readonly models: AiModelOption[];
  /** The person's pick in settings, or null for the app default. */
  readonly selectedModelId: string | null;
  /** What actually runs for fast work (map, expand, rewrite) and for drafting. */
  readonly activeModels: { readonly fast: string | null; readonly smart: string | null };
  /** Providers the person added their own key for, with its last four characters. */
  readonly keys: Array<{ readonly provider: KeyedProvider; readonly last4: string }>;
  /** Providers the app itself has a key for. */
  readonly appProviders: AiProvider[];
}

/** One model checked by `POST /api/ai/test`. */
export interface AiTestResult {
  readonly role: 'fast' | 'smart';
  readonly modelId: string | null;
  readonly label: string | null;
  readonly ok: boolean;
  /** What the model answered, or why it failed, in words for the person. */
  readonly message: string;
  readonly ms: number;
}

/** The error codes `/api/ai` answers with, so the browser can explain them. */
export type AiErrorCode =
  | 'invalid'
  | 'upgrade'
  | 'quota'
  | 'rate-limit'
  | 'no-model'
  | 'provider'
  | 'bad-output';

export interface AiErrorBody {
  readonly error: string;
  readonly code: AiErrorCode;
  readonly feature?: AiFeature | 'models.premium';
}
