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
import { resolveRefs } from './citations';
import { describeBranch, describeExpandContext, describeOverview } from './context';
import { draftOutputSchema, ideaSuggestionsSchema, reviewOutputSchema, tidyOutputSchema } from './contracts';
import type {
  AskRequest,
  CaptureRequest,
  DraftOutput,
  DraftRequest,
  ExpandRequest,
  IdeaSuggestion,
  MapRequest,
  PromptCanvas,
  ReviewIssue,
  RewriteRequest,
  TidyRequest,
  TidySuggestion,
} from './contracts';
import { neighbours } from './project-content';
import type { NumberedContext } from './project-content';

type AskTurn = NonNullable<AskRequest['history']>[number];

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

/**
 * How long models think before answering. Thinking models (Gemini 3 thinks
 * hard by default) can take minutes on free tiers; suggestions and rewrites
 * need little of it, drafts a bit more.
 */
const QUICK_REASONING = 'low';
const DRAFT_REASONING = 'medium';

/** A tiny call that proves a model and key work, for AI settings. */
export async function pingModel(model: LanguageModel, signal?: AbortSignal): Promise<string> {
  const result = await generateText({
    model,
    prompt: 'Reply with the single word OK.',
    maxRetries: 0,
    reasoning: 'minimal',
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
    reasoning: QUICK_REASONING,
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
    reasoning: QUICK_REASONING,
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
    reasoning: DRAFT_REASONING,
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
    reasoning: QUICK_REASONING,
    ...(hooks.signal ? { abortSignal: hooks.signal } : {}),
    onFinish: ({ totalUsage }) => hooks.onUsage?.(toUsage(totalUsage)),
    onError: ({ error }) => hooks.onError?.(error),
  });
}

/* -------------------------------------------------------------------------- */
/* Ask your project                                                           */
/* -------------------------------------------------------------------------- */

/** Earlier turns of a conversation included with a question. */
const ASK_HISTORY_MAX = 4;

/**
 * Stream an answer to a question about the project. `context` is the
 * numbered material (see `numberChunks`); the answer cites it as `[[I3]]`.
 */
export function streamAnswer(
  model: LanguageModel,
  req: { readonly question: string; readonly history?: readonly AskTurn[] | undefined; readonly context: string },
  hooks: {
    readonly onUsage?: (usage: TokenUsage) => void;
    readonly signal?: AbortSignal;
  } = {},
) {
  const history = (req.history ?? [])
    .slice(-ASK_HISTORY_MAX)
    .map((t) => `Researcher: ${t.question}\nYou: ${t.answer.replace(/\[\[[^\]]*\]\]/g, '').slice(0, 2_000)}`)
    .join('\n\n');
  return streamText({
    model,
    system: `You answer questions about a research project in Root, a tool where ideas sit on a canvas and documents are written from them.
Answer only from the project material you are given. Each idea and passage has a reference such as I3 (an idea) or D2 (a document passage).
Cite the material every time you use it: put its reference in double brackets right after the words that rely on it, like [[I3]] or [[I3]][[D2]]. Only cite references that appear in the material.
If the material does not answer the question, say so plainly, say what is missing, and suggest an idea or question the researcher could add. Never invent facts, numbers, quotes or sources.
Be concise: short paragraphs or a short "-" list. No headings. Write in the same language as the question.`,
    prompt: `${req.context}${history ? `\n\nThe conversation so far:\n${history}` : ''}\n\nQuestion: ${req.question}`,
    maxRetries: 1,
    reasoning: QUICK_REASONING,
    ...(hooks.signal ? { abortSignal: hooks.signal } : {}),
    onFinish: ({ totalUsage }) => hooks.onUsage?.(toUsage(totalUsage)),
  });
}

/* -------------------------------------------------------------------------- */
/* Gap check                                                                  */
/* -------------------------------------------------------------------------- */

/** Most issues a gap check reports from the model. */
export const REVIEW_ISSUES_MAX = 12;

/**
 * Root's own checks, which need no model: conclusions with no finding
 * connected to them.
 */
export function ruleIssues(canvas: PromptCanvas): ReviewIssue[] {
  const links = neighbours(canvas);
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  return canvas.nodes
    .filter((n) => n.type === 'conclusion')
    .filter((n) => !(links.get(n.id) ?? []).some((id) => byId.get(id)?.type === 'finding'))
    .slice(0, 8)
    .map((n) => ({
      kind: 'unsupported' as const,
      message: `“${n.title.trim() || 'Untitled idea'}” is a conclusion with no finding connected to it.`,
      suggestion: 'Connect the findings that support it, or add a question for the evidence still needed.',
      sources: [{ kind: 'idea' as const, ideaId: n.id }],
      rule: true,
    }));
}

/** Ask the model for weak spots in the project; issues cite what they are about. */
export async function reviewProject(
  model: LanguageModel,
  context: NumberedContext,
  signal?: AbortSignal,
): Promise<AiCallResult<ReviewIssue[]>> {
  const result = await generateText({
    model,
    output: Output.object({ schema: reviewOutputSchema }),
    system: `You review a research project for weak spots, the way a careful supervisor would.
Each idea and passage has a reference such as I3 (an idea) or D2 (a document passage).
Report only real problems, most important first, at most ${REVIEW_ISSUES_MAX}:
- unsupported: a conclusion or claim that the findings do not support, or support only weakly
- uncited: a document passage that makes a factual claim without citing any idea or source
- contradiction: two ideas or passages that disagree (cite both)
- gap: an obvious open question or missing piece of evidence the project should address
For each, give refs (the references it is about), message (one sentence saying what is wrong) and suggestion (one sentence saying what to do).
Return an empty list if the project has no real problems. Never invent facts. Write in the same language as the project.`,
    prompt: context.text,
    maxRetries: 1,
    reasoning: DRAFT_REASONING,
    ...(signal ? { abortSignal: signal } : {}),
  });
  const issues: ReviewIssue[] = [];
  for (const issue of result.output.issues) {
    if (issues.length >= REVIEW_ISSUES_MAX) break;
    const message = issue.message.trim();
    if (!message) continue;
    const sources = issue.refs.flatMap((r) => resolveRefs(r, context.refs));
    // Everything but a gap must point at something real.
    if (sources.length === 0 && issue.kind !== 'gap') continue;
    issues.push({ kind: issue.kind, message, suggestion: issue.suggestion.trim(), sources, rule: false });
  }
  return { output: issues, usage: toUsage(result.usage) };
}

/* -------------------------------------------------------------------------- */
/* Make ideas from text                                                       */
/* -------------------------------------------------------------------------- */

/** Most ideas made from one selection. */
export const CAPTURE_IDEAS_MAX = 8;

export async function captureIdeas(
  model: LanguageModel,
  req: CaptureRequest,
  signal?: AbortSignal,
): Promise<AiCallResult<IdeaSuggestion[]>> {
  const result = await generateText({
    model,
    output: Output.object({ schema: ideaSuggestionsSchema }),
    system: `You turn a passage from a research document into ideas for a canvas.
Return between 2 and ${CAPTURE_IDEAS_MAX} ideas that capture the passage's distinct points: its claims as findings, its open issues as questions, its judgements as conclusions, and the subject they share as a topic when there is one.
Connect them: give each idea a parent (another idea's key) when it follows from or supports it; the first idea's parent is null.
Use only what the passage says. Do not repeat ideas that are already on the canvas.
Give each idea a short unique key such as "i1", "i2".
${TYPES_GUIDE}
${STYLE_GUIDE}`,
    prompt: `${req.documentTitle ? `Document: ${req.documentTitle}\n\n` : ''}Passage:\n${req.text}\n\nAlready on the canvas:\n${describeOverview(req.canvas)}`,
    maxRetries: 1,
    reasoning: QUICK_REASONING,
    ...(signal ? { abortSignal: signal } : {}),
  });
  return {
    output: cleanSuggestions(result.output.ideas, { max: CAPTURE_IDEAS_MAX, anchorAll: false }),
    usage: toUsage(result.usage),
  };
}

/* -------------------------------------------------------------------------- */
/* Tidy suggestions                                                           */
/* -------------------------------------------------------------------------- */

/** Most ideas shown to the model, and most suggestions kept. */
const TIDY_IDEAS_MAX = 150;
export const TIDY_SUGGESTIONS_MAX = 12;

export async function suggestTidy(
  model: LanguageModel,
  req: TidyRequest,
  signal?: AbortSignal,
): Promise<AiCallResult<TidySuggestion[]>> {
  const nodes = req.canvas.nodes.slice(0, TIDY_IDEAS_MAX);
  const refOf = new Map(nodes.map((n, i) => [n.id, `I${i + 1}`]));
  const idOf = new Map(nodes.map((n, i) => [`I${i + 1}`, n]));
  const connected = new Set<string>();
  const edgeLines: string[] = [];
  for (const e of req.canvas.edges) {
    const a = refOf.get(e.source);
    const b = refOf.get(e.target);
    if (!a || !b) continue;
    connected.add(`${e.source}|${e.target}`).add(`${e.target}|${e.source}`);
    edgeLines.push(`${a} → ${b}`);
  }
  const lines = nodes.map((n) => {
    const notes = n.body.trim().replace(/\s+/g, ' ').slice(0, 300);
    return `${refOf.get(n.id)}: [${n.type}] ${n.title.trim() || '(no title)'}${notes ? ` | notes: ${notes}` : ''}`;
  });
  const result = await generateText({
    model,
    output: Output.object({ schema: tidyOutputSchema }),
    system: `You help keep a research canvas tidy. Suggest only clear improvements, at most ${TIDY_SUGGESTIONS_MAX}, most useful first:
- retype: an idea whose type is clearly wrong (for example a question typed as a finding). Give the better type.
- retitle: an idea with no title or a vague one, where its notes say what it is about. Give a better title (under 12 words).
- connect: two related ideas that are not connected yet. ref is the idea it leads from, to the idea it leads to.
For every suggestion give a one-sentence reason. Leave type, title and to null when they do not apply.
Return an empty list when the canvas is already tidy. Write in the same language as the canvas.
${TYPES_GUIDE}`,
    prompt: `Ideas:\n${lines.join('\n')}\n\nConnectors:\n${edgeLines.join('\n') || '(none)'}`,
    maxRetries: 1,
    reasoning: QUICK_REASONING,
    ...(signal ? { abortSignal: signal } : {}),
  });

  const out: TidySuggestion[] = [];
  const seen = new Set<string>();
  for (const s of result.output.suggestions) {
    if (out.length >= TIDY_SUGGESTIONS_MAX) break;
    const node = idOf.get(s.ref.trim());
    if (!node) continue;
    const reason = s.reason.trim();
    if (s.kind === 'retype' && s.type && s.type !== node.type && !seen.has(`type:${node.id}`)) {
      seen.add(`type:${node.id}`);
      out.push({ kind: 'retype', ideaId: node.id, type: s.type, reason });
    } else if (s.kind === 'retitle' && !seen.has(`title:${node.id}`)) {
      const title = (s.title ?? '').replace(/\s+/g, ' ').trim().slice(0, NODE_TITLE_MAX);
      if (!title || title === node.title.trim()) continue;
      seen.add(`title:${node.id}`);
      out.push({ kind: 'retitle', ideaId: node.id, title, reason });
    } else if (s.kind === 'connect' && s.to) {
      const target = idOf.get(s.to.trim());
      if (!target || target.id === node.id || connected.has(`${node.id}|${target.id}`)) continue;
      connected.add(`${node.id}|${target.id}`).add(`${target.id}|${node.id}`);
      out.push({ kind: 'connect', sourceId: node.id, targetId: target.id, reason });
    }
  }
  return { output: out, usage: toUsage(result.usage) };
}
