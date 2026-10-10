/**
 * The AI features themselves: the prompt for each, the call, and the clean-up
 * of what comes back. Every function takes an AI SDK `LanguageModel`, so it
 * runs on any provider and knows nothing about HTTP, databases or plans.
 *
 * Uses only `fetch`-based SDK calls (no Node APIs), so it can run on other
 * JavaScript runtimes too.
 */

import { generateText, Output, streamText } from 'ai';
import type { LanguageModel } from 'ai';

import { NODE_BODY_MAX, NODE_TITLE_MAX } from '../../data/limits';
import { describeBranch, describeExpandContext } from './context';
import { draftOutputSchema, ideaSuggestionsSchema } from './contracts';
import type {
  DraftOutput,
  DraftRequest,
  ExpandRequest,
  IdeaSuggestion,
  MapRequest,
  RewriteRequest,
} from './contracts';

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface AiCallResult<T> {
  readonly output: T;
  readonly usage: TokenUsage;
}

/** A request that cannot be answered as asked (for example, an unknown idea). */
export class AiInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiInputError';
  }
}

/** Most ideas a topic map may suggest. */
export const MAP_IDEAS_MAX = 16;
/** Most ideas one expansion may suggest. */
export const EXPAND_IDEAS_MAX = 6;

const TYPES_GUIDE = `Each idea has a type:
- topic: a subject or theme that organises other ideas
- finding: something learned, observed or supported by evidence
- question: an open question worth investigating
- conclusion: a judgement drawn from findings`;

const STYLE_GUIDE = `Write titles as short, specific statements or questions (under 12 words), not single vague words.
Notes are one to three plain sentences that say why the idea matters or what to look into.
Never invent statistics, quotes or sources; when evidence is needed, phrase the idea as a question instead.
Write in the same language as the material you are given.`;

function toUsage(usage: { inputTokens?: number | undefined; outputTokens?: number | undefined }): TokenUsage {
  return { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
}

/**
 * Make suggestions safe to place: unique keys, text within the canvas limits,
 * and parents that point at an earlier suggestion (so there are no cycles).
 * With `anchorAll`, every suggestion hangs directly from the idea being
 * expanded; otherwise every suggestion but the first hangs from something.
 */
export function cleanSuggestions(
  ideas: readonly IdeaSuggestion[],
  opts: { readonly max: number; readonly anchorAll: boolean },
): IdeaSuggestion[] {
  const out: IdeaSuggestion[] = [];
  const keys = new Set<string>();
  for (const idea of ideas) {
    if (out.length >= opts.max) break;
    const title = idea.title.replace(/\s+/g, ' ').trim().slice(0, NODE_TITLE_MAX);
    if (!title) continue;
    let key = idea.key.trim() || `i${out.length + 1}`;
    while (keys.has(key)) key = `${key}_`;
    keys.add(key);
    let parent = opts.anchorAll ? null : idea.parent;
    if (parent !== null && (!keys.has(parent) || parent === key)) parent = null;
    // A topic map is one tree: loose ideas hang from the first one.
    if (!opts.anchorAll && parent === null && out.length > 0) parent = out[0]!.key;
    out.push({ key, title, body: idea.body.trim().slice(0, NODE_BODY_MAX), type: idea.type, parent });
  }
  return out;
}

/** A tiny call that proves a model and key work, for AI settings. */
export async function pingModel(model: LanguageModel, signal?: AbortSignal): Promise<string> {
  const result = await generateText({
    model,
    prompt: 'Reply with the single word OK.',
    maxRetries: 0,
    ...(signal ? { abortSignal: signal } : {}),
  });
  return result.text.trim();
}

/* -------------------------------------------------------------------------- */
/* Topic to map                                                               */
/* -------------------------------------------------------------------------- */

export async function suggestMap(
  model: LanguageModel,
  req: MapRequest,
  signal?: AbortSignal,
): Promise<AiCallResult<IdeaSuggestion[]>> {
  const result = await generateText({
    model,
    output: Output.object({ schema: ideaSuggestionsSchema }),
    system: `You help a researcher start a visual research map: a tree of connected idea cards.
Given a topic, return 8 to ${MAP_IDEAS_MAX} ideas forming a tree.
The first idea is the topic itself (type "topic", parent null). Every other idea names its parent by key.
Go two or three levels deep: themes under the topic, then findings and open questions under each theme.
Give each idea a short unique key such as "i1", "i2".
${TYPES_GUIDE}
${STYLE_GUIDE}`,
    prompt: `Topic: ${req.topic}${req.guidance ? `\n\nWhat the researcher wants to focus on:\n${req.guidance}` : ''}`,
    maxRetries: 1,
    ...(signal ? { abortSignal: signal } : {}),
  });
  const ideas = cleanSuggestions(result.output.ideas, { max: MAP_IDEAS_MAX, anchorAll: false });
  if (ideas.length === 0) throw new AiInputError('The model returned no usable ideas.');
  return { output: ideas, usage: toUsage(result.usage) };
}

/* -------------------------------------------------------------------------- */
/* Expand this idea                                                           */
/* -------------------------------------------------------------------------- */

export async function suggestExpansion(
  model: LanguageModel,
  req: ExpandRequest,
  signal?: AbortSignal,
): Promise<AiCallResult<IdeaSuggestion[]>> {
  const context = describeExpandContext(req.canvas, req.focusId);
  if (context === null) throw new AiInputError('That idea is not on the canvas.');
  const result = await generateText({
    model,
    output: Output.object({ schema: ideaSuggestionsSchema }),
    system: `You help a researcher grow a visual research map of connected idea cards.
Suggest 3 to ${EXPAND_IDEAS_MAX} new ideas that connect directly from the idea to expand.
Good suggestions break it into parts, add the findings or evidence it needs, raise the questions it leaves open, or draw a conclusion it supports.
Do not repeat ideas that are already connected from it or elsewhere on the canvas. Set every parent to null.
Give each idea a short unique key such as "i1", "i2".
${TYPES_GUIDE}
${STYLE_GUIDE}`,
    prompt: `${context}${req.guidance ? `\n\nThe researcher asks for:\n${req.guidance}` : ''}`,
    maxRetries: 1,
    ...(signal ? { abortSignal: signal } : {}),
  });
  const ideas = cleanSuggestions(result.output.ideas, { max: EXPAND_IDEAS_MAX, anchorAll: true });
  if (ideas.length === 0) throw new AiInputError('The model returned no usable ideas.');
  return { output: ideas, usage: toUsage(result.usage) };
}

/* -------------------------------------------------------------------------- */
/* Draft with AI                                                              */
/* -------------------------------------------------------------------------- */

export async function draftDocument(
  model: LanguageModel,
  req: DraftRequest,
  signal?: AbortSignal,
): Promise<AiCallResult<DraftOutput>> {
  const branch = describeBranch(req.canvas, req.rootId);
  if (branch === null) throw new AiInputError('That idea is not on the canvas.');
  const result = await generateText({
    model,
    output: Output.object({ schema: draftOutputSchema }),
    system: `You turn a researcher's map of connected ideas into the prose of a research document.
You are given an outline: each line is an idea with its id, type, title and notes, indented under the idea it follows from.
Return:
- title: a clear document title.
- intro: one or two paragraphs that introduce the root idea and say what the document covers.
- sections: for each idea in the outline below the root that deserves prose, its id and one to three paragraphs about it.
Use only what the outline says. Where it gives no evidence, say what remains to be found instead of inventing facts, numbers, quotes or sources.
Cite an idea inline by writing [[<its id>]] right after the words that rely on it. Only cite ids from the outline.
Write plain Markdown paragraphs: no headings (the document adds them), no lists unless the notes are a list.
Write in the same language as the outline.`,
    prompt: `Outline:\n${branch.text}${req.guidance ? `\n\nThe researcher asks for:\n${req.guidance}` : ''}`,
    maxRetries: 1,
    ...(signal ? { abortSignal: signal } : {}),
  });
  const known = new Set(branch.ids);
  const seen = new Set<string>();
  const sections = result.output.sections.filter((s) => {
    if (!known.has(s.ideaId) || s.ideaId === branch.root.id || seen.has(s.ideaId) || !s.text.trim()) return false;
    seen.add(s.ideaId);
    return true;
  });
  return {
    output: { title: result.output.title.trim().slice(0, 200), intro: result.output.intro.trim(), sections },
    usage: toUsage(result.usage),
  };
}

/* -------------------------------------------------------------------------- */
/* Rewrite in the editor                                                      */
/* -------------------------------------------------------------------------- */

const REWRITE_INSTRUCTIONS: Record<RewriteRequest['action'], string> = {
  improve: 'Rewrite the selected text so it is clearer and reads better. Keep its meaning, facts and length about the same.',
  shorten: 'Rewrite the selected text to about half its length. Keep the key points and facts.',
  expand: 'Rewrite the selected text with more explanation and detail, about twice as long. Add no new facts, numbers or sources.',
  continue: 'Write the next one or two paragraphs that follow the selected text, in the same voice. Add no new facts, numbers or sources.',
};

/**
 * Stream rewritten text. Returns the SDK's stream result; `onUsage` is called
 * once the model finishes, with the tokens it used.
 */
export function streamRewrite(
  model: LanguageModel,
  req: RewriteRequest,
  hooks: {
    readonly onUsage?: (usage: TokenUsage) => void;
    readonly onError?: (error: unknown) => void;
    readonly signal?: AbortSignal;
  } = {},
) {
  const context = [
    req.title ? `Document title: ${req.title}` : '',
    req.before ? `Text before the selection:\n${req.before}` : '',
    `Selected text:\n${req.text}`,
    req.after ? `Text after the selection:\n${req.after}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return streamText({
    model,
    system: `You are a careful writing assistant inside a research document.
${REWRITE_INSTRUCTIONS[req.action]}
Return only the new text, as plain paragraphs separated by a blank line. No preamble, no quotes around it, no headings.
Keep any [[...]] citation markers you find, unchanged, next to the words they support.
Write in the same language as the selected text.`,
    prompt: context,
    maxRetries: 1,
    ...(hooks.signal ? { abortSignal: hooks.signal } : {}),
    onFinish: ({ totalUsage }) => hooks.onUsage?.(toUsage(totalUsage)),
    onError: ({ error }) => hooks.onError?.(error),
  });
}
