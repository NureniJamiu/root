/**
 * Canvas schema v2 migration (M0 plan D7): legacy `parentId` → v1 → v2.
 *
 * Old canvases must open with the same cards, the same connectors and the
 * same evidence badges as before; only the new fields are added, with no
 * meaning inferred (`related-to`, `unrecorded`).
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { issuesByNode } from '../rules';
import { CANVAS_SCHEMA_VERSION, canvasSchema, migrateCanvas, migrateLegacyCanvas } from '../schema';
import type { Canvas, Edge, Node } from '../types';
import { arbCanvas, toV1 } from './arbitraries';
import { V1_FIXTURES, evidenceSeed } from './fixtures/v1Canvases';

type Loose = Record<string, unknown> & { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };

/** The v1 canvas a fixture stands for (legacy `parentId` canvases resolved to edges). */
function asV1(fixture: unknown): Loose {
  return migrateLegacyCanvas(fixture) as Loose;
}

function parse(input: unknown): Canvas {
  const result = canvasSchema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join('; '));
  return result.data;
}

/** Evidence issues as plain sorted entries, for comparison. */
function issuesOf(c: Canvas): Array<[string, unknown]> {
  return [...issuesByNode(c).entries()].sort(([a], [b]) => a.localeCompare(b));
}

const withoutV2Node = ({ fields: _f, provenance: _p, ...rest }: Node) => rest;
const withoutV2Edge = ({ relationType: _r, provenance: _p, ...rest }: Edge) => rest;

const fixtures = Object.entries(V1_FIXTURES);

describe('every v1 fixture migrates and parses', () => {
  test.each(fixtures)('%s', (_name, fixture) => {
    const v1 = asV1(fixture);
    const canvas = parse(fixture);

    expect(canvas.schemaVersion).toBe(CANVAS_SCHEMA_VERSION);
    // The cards and connectors are exactly what they were.
    expect(canvas.nodes.map(withoutV2Node)).toStrictEqual(v1.nodes);
    expect(canvas.edges.map(withoutV2Edge)).toStrictEqual(
      v1.edges.map((e) => ({ sourcePinned: false, targetPinned: false, ...e })),
    );
    // The new fields carry no invented meaning.
    for (const n of canvas.nodes) {
      expect(n.fields).toStrictEqual({});
      expect(n.provenance).toStrictEqual({ origin: 'unrecorded', edited: false });
    }
    for (const e of canvas.edges) {
      expect(e.relationType).toBe('related-to');
      expect(e.provenance).toStrictEqual({ origin: 'unrecorded', edited: false });
    }
    expect(canvas).not.toHaveProperty('workspace');
  });

  test('keeps the id, title, timestamp, sources, image captions and hidden connectors', () => {
    const canvas = parse(V1_FIXTURES.everyFieldSeed);
    expect(canvas).toMatchObject({
      id: V1_FIXTURES.everyFieldSeed.id,
      title: V1_FIXTURES.everyFieldSeed.title,
      updatedAt: V1_FIXTURES.everyFieldSeed.updatedAt,
    });
    expect(canvas.nodes[1]!.source?.doi).toBe('10.1016/S0896-6273(02)00746-8');
    expect(canvas.nodes[1]!.images[0]).toMatchObject({ caption: 'A bar chart of recall after sleep.', text: 'Recall +20%' });
    expect(canvas.edges[0]!.hidden).toBe(true);
  });
});

describe('migration is idempotent', () => {
  test.each(fixtures)('%s', (_name, fixture) => {
    const once = migrateCanvas(fixture);
    expect(migrateCanvas(once)).toStrictEqual(once);
    expect(parse(once)).toStrictEqual(parse(fixture));
  });

  test('migrate(migrate(x)) = migrate(x) for any v1 canvas', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        const once = migrateCanvas(toV1(c));
        expect(migrateCanvas(once)).toStrictEqual(once);
      }),
      { numRuns: 100 },
    );
  });

  test('a v2 canvas is returned untouched', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        expect(migrateCanvas(c)).toBe(c);
      }),
      { numRuns: 100 },
    );
  });

  test('a v1 canvas comes back as the same canvas with the new fields added', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        const migrated = parse(toV1(c));
        expect(migrated.nodes.map(withoutV2Node)).toStrictEqual(c.nodes.map(withoutV2Node));
        expect(migrated.edges.map(withoutV2Edge)).toStrictEqual(c.edges.map(withoutV2Edge));
      }),
      { numRuns: 100 },
    );
  });
});

describe('evidence issues on migrated canvases equal today’s', () => {
  test.each(fixtures)('%s', (_name, fixture) => {
    // Today's checks run straight on the stored v1 graph.
    const today = issuesOf(asV1(fixture) as unknown as Canvas);
    expect(issuesOf(parse(fixture))).toStrictEqual(today);
  });

  test('the evidence seed still raises the badges the e2e spec expects', () => {
    const canvas = parse(evidenceSeed);
    const [conclusion, question, finding] = canvas.nodes.map((n) => n.id) as [string, string, string];
    const kinds = (id: string) => (issuesByNode(canvas).get(id) ?? []).map((i) => i.ruleId);
    expect(kinds(conclusion)).toEqual(['conclusion-unbacked', 'conclusion-open-question']);
    expect(kinds(finding)).toEqual(['finding-dangling']);
    expect(kinds(question)).toEqual([]);
  });

  test('for any v1 canvas', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        const v1 = toV1(c);
        expect(issuesOf(parse(v1))).toStrictEqual(issuesOf(v1 as unknown as Canvas));
      }),
      { numRuns: 100 },
    );
  });
});

describe('schema v2', () => {
  const valid = parse(V1_FIXTURES.connectorSeed);

  test('requires provenance on nodes and edges once a canvas is v2', () => {
    const { provenance: _n, ...node } = valid.nodes[0]!;
    expect(canvasSchema.safeParse({ ...valid, nodes: [node, ...valid.nodes.slice(1)] }).success).toBe(false);
    const { provenance: _e, ...edge } = valid.edges[0]!;
    expect(canvasSchema.safeParse({ ...valid, edges: [edge] }).success).toBe(false);
  });

  test('requires a relation on every edge', () => {
    const { relationType: _r, ...edge } = valid.edges[0]!;
    expect(canvasSchema.safeParse({ ...valid, edges: [edge] }).success).toBe(false);
  });

  test('accepts only the types and relations the app exposes today', () => {
    const framing = { ...valid, nodes: valid.nodes.map((n, i) => (i === 0 ? { ...n, type: 'objective' } : n)) };
    expect(canvasSchema.safeParse(framing).success).toBe(true);
    const retyped = { ...valid, nodes: valid.nodes.map((n, i) => (i === 0 ? { ...n, type: 'methodology' } : n)) };
    expect(canvasSchema.safeParse(retyped).success).toBe(false);
    const related = { ...valid, edges: valid.edges.map((e) => ({ ...e, relationType: 'supports' })) };
    expect(canvasSchema.safeParse(related).success).toBe(false);
    expect(canvasSchema.safeParse({ ...valid, edges: valid.edges.map((e) => ({ ...e, relationType: 'causes' })) }).success).toBe(false);
  });

  test('drops fields the node type does not define', () => {
    const extra = { ...valid, nodes: valid.nodes.map((n) => ({ ...n, fields: { scope: 'general' } })) };
    expect(parse(extra).nodes.every((n) => Object.keys(n.fields).length === 0)).toBe(true);
  });

  test('rejects an unknown schema version instead of guessing', () => {
    expect(canvasSchema.safeParse({ ...valid, schemaVersion: 3 }).success).toBe(false);
  });

  test('keeps the workspace', () => {
    const workspace = { intake: { answer: 'has-topic', answeredAt: '2024-01-01T00:00:00.000Z' }, focusStage: 'problem' };
    expect(parse({ ...valid, workspace }).workspace).toStrictEqual(workspace);
  });
});
