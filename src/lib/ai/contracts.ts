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

/** One earlier turn of an Ask conversation, so follow-up questions make sense. */
export const askTurnSchema = z.object({
  question: z.string().max(2_000),
  answer: z.string().max(8_000),
});

export const askRequestSchema = z.object({
  projectId: z.string().uuid(),
  question: z.string().trim().min(1).max(2_000),
  /** Earlier turns, oldest first; only the last few are sent to the model. */
  history: z.array(askTurnSchema).max(10).optional(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

export const reviewRequestSchema = z.object({
  projectId: z.string().uuid(),
});
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export const captureRequestSchema = z.object({
  text: z.string().trim().min(1).max(8_000),
  documentTitle: z.string().max(200).optional(),
  /** The canvas, so new ideas fit what is already there and do not repeat it. */
  canvas: promptCanvasSchema,
});
export type CaptureRequest = z.infer<typeof captureRequestSchema>;

export const tidyRequestSchema = z.object({
  canvas: promptCanvasSchema,
});
export type TidyRequest = z.infer<typeof tidyRequestSchema>;

export const researchRequestSchema = z.object({
  /** The question card to research. */
  focusId: z.string().uuid(),
  canvas: promptCanvasSchema,
  guidance: z.string().max(500).optional(),
});
export type ResearchRequest = z.infer<typeof researchRequestSchema>;

/** Most ideas one walkthrough script covers. */
export const SCRIPT_STEPS_MAX = 80;

export const scriptRequestSchema = z.object({
  canvas: promptCanvasSchema,
  /** The ideas in the order they are presented. */
  steps: z.array(z.string().uuid()).min(1).max(SCRIPT_STEPS_MAX),
  guidance: z.string().max(500).optional(),
});
export type ScriptRequest = z.infer<typeof scriptRequestSchema>;

/** Most images described in one request. */
export const DESCRIBE_IMAGES_MAX = 6;
/** Largest image accepted for description (browsers shrink them first). */
export const DESCRIBE_IMAGE_MAX_CHARS = 1_500_000;

export const describeRequestSchema = z.object({
  /** The idea the images belong to, for context. */
  ideaTitle: z.string().max(NODE_TITLE_MAX).optional(),
  images: z
    .array(
      z.object({
        id: z.string().uuid(),
        dataUrl: z
          .string()
          .max(DESCRIBE_IMAGE_MAX_CHARS)
          .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'Images must be PNG, JPEG, WebP or GIF.'),
      }),
    )
    .min(1)
    .max(DESCRIBE_IMAGES_MAX),
});
export type DescribeRequest = z.infer<typeof describeRequestSchema>;

/** Features whose suggestions the person accepts or not, for accept rates. */
export const FEEDBACK_FEATURES = ['ai.map', 'ai.expand', 'ai.capture', 'ai.rewrite', 'ai.tidy', 'ai.research'] as const;
export type FeedbackFeature = (typeof FEEDBACK_FEATURES)[number];

export const feedbackRequestSchema = z.object({
  feature: z.enum(FEEDBACK_FEATURES),
  /** Suggestions shown. */
  offered: z.number().int().min(0).max(100),
  /** Suggestions kept. */
  accepted: z.number().int().min(0).max(100),
});
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

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

/**
 * What a gap check finds. `refs` name ideas ("I3") and document passages
 * ("D2") from the numbered context the model was given.
 */
export const REVIEW_KINDS = ['unsupported', 'uncited', 'contradiction', 'gap'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const reviewOutputSchema = z.object({
  issues: z.array(
    z.object({
      kind: z.enum(REVIEW_KINDS),
      refs: z.array(z.string()),
      message: z.string(),
      suggestion: z.string(),
    }),
  ),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

/** Tidy suggestions as the model writes them, with ideas named by ref ("I3"). */
export const tidyOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      kind: z.enum(['retype', 'retitle', 'connect']),
      ref: z.string(),
      /** retype: the better type. */
      type: nodeTypeSchema.nullable(),
      /** retitle: the better title. */
      title: z.string().nullable(),
      /** connect: the idea to connect to (ref is the one it leads from). */
      to: z.string().nullable(),
      reason: z.string(),
    }),
  ),
});
export type TidyOutput = z.infer<typeof tidyOutputSchema>;

/** The searches a research run plans before it looks anything up. */
export const researchPlanSchema = z.object({
  queries: z.array(z.string()),
});

/** Findings written from what the searches found; `sources` are refs ("S2"). */
export const researchOutputSchema = z.object({
  findings: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      /** finding: backed by sources. question: something the sources leave open. */
      type: z.enum(['finding', 'question']),
      sources: z.array(z.string()),
    }),
  ),
});
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

/** Speaker notes as the model writes them, with ideas named by ref ("I3"). */
export const scriptOutputSchema = z.object({
  opening: z.string(),
  steps: z.array(z.object({ ref: z.string(), note: z.string() })),
  closing: z.string(),
});

/** What each image shows, by ref ("P1"). */
export const describeOutputSchema = z.object({
  images: z.array(z.object({ ref: z.string(), caption: z.string(), text: z.string() })),
});

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

export interface ResearchResponse extends SuggestionsResponse {
  /** What was searched for. */
  readonly queries: string[];
  /** Sources the findings were written from. */
  readonly sourcesRead: number;
  /** Where it looked, for people ("Wikipedia", "OpenAlex", "the web"). */
  readonly searched: string[];
}

/** Speaker notes for a walkthrough: an opening, a note per idea, a closing. */
export interface SpeakerScript {
  readonly opening: string;
  readonly steps: Array<{ readonly ideaId: string; readonly note: string }>;
  readonly closing: string;
}

export interface ScriptResponse extends AiResultMeta {
  readonly script: SpeakerScript;
}

export interface ImageDescription {
  readonly imageId: string;
  readonly caption: string;
  readonly text: string;
}

export interface DescribeResponse extends AiResultMeta {
  readonly descriptions: ImageDescription[];
}

export interface DraftResponse extends AiResultMeta {
  readonly draft: DraftOutput;
}

/** Something an answer or a finding points at: an idea, or a passage of a document. */
export type AiSource =
  | { readonly kind: 'idea'; readonly ideaId: string }
  | { readonly kind: 'doc'; readonly documentId: string; readonly blockId: string | null };

export interface ReviewIssue {
  readonly kind: ReviewKind;
  readonly message: string;
  readonly suggestion: string;
  readonly sources: AiSource[];
  /** Found by Root's own rules rather than by the model. */
  readonly rule: boolean;
}

export interface ReviewResponse extends AiResultMeta {
  readonly issues: ReviewIssue[];
}

export type TidySuggestion =
  | { readonly kind: 'retype'; readonly ideaId: string; readonly type: z.infer<typeof nodeTypeSchema>; readonly reason: string }
  | { readonly kind: 'retitle'; readonly ideaId: string; readonly title: string; readonly reason: string }
  | { readonly kind: 'connect'; readonly sourceId: string; readonly targetId: string; readonly reason: string };

export interface TidyResponse extends AiResultMeta {
  readonly suggestions: TidySuggestion[];
}

/** How often suggestions were kept this month, per feature. */
export interface AcceptRate {
  readonly feature: FeedbackFeature;
  readonly offered: number;
  readonly accepted: number;
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
  /** Suggestions kept this month, per feature. */
  readonly acceptRates: AcceptRate[];
  /** Ask can search by meaning (an embedding model and key exist), not only by words. */
  readonly semanticSearch: boolean;
  /** Where research looks things up ("Wikipedia", "OpenAlex", "the web"); empty when it is off. */
  readonly researchSources: string[];
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
