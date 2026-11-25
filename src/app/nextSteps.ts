/**
 * The next-steps panel (M0 plan D10): what to do next in the stage in focus,
 * built only from the graph, so it never guesses. Rule issues come first
 * (each points at a card), then the cards a stage usually starts with that
 * the project does not have yet. AI-written recommendations are a later
 * addition to the same panel. Pure.
 */
import { stageStates } from '../data';
import type { Canvas, NodeType, RuleId, StageId, UUID } from '../data';

export type NextStepAction =
  | { readonly kind: 'add'; readonly type: NodeType; readonly label: string }
  | { readonly kind: 'show'; readonly nodeId: UUID; readonly label: string }
  | { readonly kind: 'write'; readonly label: string };

export interface NextStep {
  /** Stable within a list, for keys and test ids. */
  readonly id: string;
  readonly text: string;
  readonly action?: NextStepAction;
}

/** Most steps shown at once. */
export const NEXT_STEPS_MAX = 5;

/** How each rule's issues read as a step: one card, then several. */
const ISSUE_TEXT: Record<RuleId, readonly [string, (n: number) => string]> = {
  'conclusion-unbacked': ['A conclusion has no evidence behind it.', (n) => `${n} conclusions have no evidence behind them.`],
  'conclusion-open-question': ['A conclusion rests on an open question.', (n) => `${n} conclusions rest on open questions.`],
  'finding-dangling': ['A finding is not used in your argument.', (n) => `${n} findings are not used in your argument.`],
  'rq-without-objective': [
    'A research question is not linked to an objective.',
    (n) => `${n} research questions are not linked to an objective.`,
  ],
  'objective-without-rq': [
    'No research question addresses an objective.',
    (n) => `No research question addresses ${n} of your objectives.`,
  ],
  'objective-off-problem': [
    'An objective does not address the problem statement.',
    (n) => `${n} objectives do not address the problem statement.`,
  ],
  'hypothesis-without-variable': ['A hypothesis names no variables.', (n) => `${n} hypotheses name no variables.`],
  'relation-invalid': ["A card has a connector that doesn't fit.", (n) => `${n} cards have connectors that don't fit.`],
};

/** The cards a stage usually starts with, and how to ask for each. */
const STARTERS: Partial<Record<StageId, ReadonlyArray<{ type: NodeType; text: string; label: string }>>> = {
  topic: [{ type: 'topic', text: 'Name what you want to research.', label: 'Add topic' }],
  problem: [
    { type: 'problem', text: 'Write the problem your research responds to.', label: 'Add problem statement' },
    { type: 'objective', text: 'State what the research sets out to achieve.', label: 'Add objective' },
    { type: 'research-question', text: 'Ask the questions the study will answer.', label: 'Add research question' },
  ],
  literature: [{ type: 'finding', text: 'Record what your reading shows, one finding per card.', label: 'Add finding' }],
  data: [{ type: 'finding', text: 'Record what your data shows as findings.', label: 'Add finding' }],
  interpretation: [{ type: 'conclusion', text: 'Draw a conclusion from your findings.', label: 'Add conclusion' }],
};

/** Stages with no workspace of their own yet, and what to do meanwhile. */
const LATER: Partial<Record<StageId, NextStep>> = {
  framework: { id: 'later-framework', text: 'A theoretical framework workspace comes in a later release.' },
  methodology: { id: 'later-methodology', text: 'A methodology workspace comes in a later release.' },
  data: { id: 'later-data', text: 'A data collection and analysis workspace comes in a later release.' },
  documentation: {
    id: 'later-documentation',
    text: 'Draft your document from the canvas in Write view.',
    action: { kind: 'write', label: 'Open Write view' },
  },
};

/**
 * The steps for `focus`, or for the whole project when `focus` is null
 * (issues only: starters belong to a stage).
 */
export function nextSteps(c: Canvas, focus: StageId | null): NextStep[] {
  const states = stageStates(c);
  const issues = focus === null ? states.flatMap((s) => s.issues) : (states.find((s) => s.stage === focus)?.issues ?? []);
  const steps: NextStep[] = [];

  // One step per rule, pointing at the first card it flagged. Issues a card
  // shares between stages are counted once.
  const byRule = new Map<RuleId, UUID[]>();
  for (const issue of issues) {
    const subject = issue.nodeIds[0];
    if (subject === undefined) continue;
    const list = byRule.get(issue.ruleId) ?? byRule.set(issue.ruleId, []).get(issue.ruleId)!;
    if (!list.includes(subject)) list.push(subject);
  }
  for (const [ruleId, nodeIds] of byRule) {
    const [one, many] = ISSUE_TEXT[ruleId];
    steps.push({
      id: `issue-${ruleId}`,
      text: nodeIds.length === 1 ? one : many(nodeIds.length),
      action: { kind: 'show', nodeId: nodeIds[0]!, label: 'Show' },
    });
  }

  if (focus !== null) {
    const present = new Set(c.nodes.map((n) => n.type));
    for (const s of STARTERS[focus] ?? []) {
      if (present.has(s.type)) continue;
      steps.push({ id: `add-${s.type}`, text: s.text, action: { kind: 'add', type: s.type, label: s.label } });
    }
    const later = LATER[focus];
    if (later) steps.push(later);
  }

  return steps.slice(0, NEXT_STEPS_MAX);
}
