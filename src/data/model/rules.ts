/**
 * The rule-engine contract (M0 plan D8). Types only; the engine itself lands
 * in `src/data/rules/`.
 *
 * Rules are pure, deterministic functions over a minimal graph view that both
 * the stored `Canvas` and the AI `PromptCanvas` can satisfy, so the client
 * badges and the server review report the same issues.
 */

import type { UUID } from '../types';
import type { NodeTypeId } from './nodeTypes';
import type { RelationId } from './relations';

export interface GraphView {
  readonly nodes: readonly { readonly id: UUID; readonly type: NodeTypeId; readonly title: string }[];
  /** `id` is absent on prompt canvases, which send edges without ids. */
  readonly edges: readonly {
    readonly id?: UUID;
    readonly source: UUID;
    readonly target: UUID;
    readonly relationType: RelationId;
  }[];
}

/** The M0 rules. Results carry the id and version of the rule that found them. */
export const RULE_IDS = [
  // Ported from today's evidence checks.
  'conclusion-unbacked',
  'conclusion-open-question',
  'finding-dangling',
  // New in M0.
  'rq-without-objective',
  'objective-without-rq',
  'hypothesis-without-variable',
  'objective-off-problem',
  'relation-invalid',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

/** A rule's finding: deterministic, so it is a derived result with its own provenance. */
export interface Issue {
  readonly ruleId: RuleId;
  readonly ruleVersion: number;
  /** The card the issue is about first, then any cards it points at. */
  readonly nodeIds: readonly UUID[];
  readonly edgeIds: readonly UUID[];
  readonly label: string;
  readonly hint: string;
}

export interface Rule {
  readonly id: RuleId;
  /** Bumped whenever what the rule fires on changes. */
  readonly version: number;
  run(graph: GraphView): Issue[];
}
