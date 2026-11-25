/**
 * The M0 contract in `src/data/model`: the type registry, the relation
 * validity map with `orient`, and the provenance shape.
 */
import { describe, expect, test } from 'vitest';

import {
  NODE_TYPE_IDS,
  NODE_TYPES,
  RELATION_IDS,
  RELATIONS,
  defaultRelation,
  fieldsSchemaFor,
  isRelationAllowed,
  orient,
  provenanceSchema,
} from '../model';
import type { NodeTypeId, RelationDefinition, RelationEndpoint } from '../model';

const ends = (e: RelationEndpoint): readonly NodeTypeId[] => (e === 'any' ? NODE_TYPE_IDS : [e]);

describe('node-type registry', () => {
  test('keeps the four pre-M0 type ids and adds the problem-framing family', () => {
    expect(NODE_TYPE_IDS).toEqual([
      'topic', 'question', 'finding', 'conclusion',
      'problem', 'objective', 'research-question', 'hypothesis', 'variable',
    ]);
    for (const id of NODE_TYPE_IDS) expect(NODE_TYPES[id].id).toBe(id);
  });

  test('every field is optional and unknown values are rejected', () => {
    for (const id of NODE_TYPE_IDS) expect(fieldsSchemaFor(id).safeParse({}).success).toBe(true);
    expect(fieldsSchemaFor('variable').parse({ role: 'dependent', measurementLevel: 'ratio' })).toEqual({
      role: 'dependent',
      measurementLevel: 'ratio',
    });
    expect(fieldsSchemaFor('hypothesis').safeParse({ form: 'maybe' }).success).toBe(false);
    expect(fieldsSchemaFor('objective').safeParse({ scope: 'specific' }).success).toBe(true);
  });
});

describe('relation validity map', () => {
  test('a relation lists each pair of different types in one orientation only', () => {
    for (const id of RELATION_IDS) {
      const allowed = new Set<string>();
      for (const p of (RELATIONS[id] as RelationDefinition).pairs) {
        if (p.symmetric) continue;
        for (const s of ends(p.subject)) for (const o of ends(p.object)) if (s !== o) allowed.add(`${s}>${o}`);
      }
      for (const key of allowed) {
        const [s, o] = key.split('>') as [string, string];
        expect(allowed.has(`${o}>${s}`), `${id}: ${key}`).toBe(false);
      }
    }
  });

  test('each pair of types has at most one default relation', () => {
    const defaults = new Map<string, string[]>();
    for (const id of RELATION_IDS) {
      for (const p of (RELATIONS[id] as RelationDefinition).pairs) {
        if (!p.default) continue;
        for (const s of ends(p.subject)) {
          for (const o of ends(p.object)) {
            const key = [s, o].sort().join('|');
            defaults.set(key, [...(defaults.get(key) ?? []), id]);
          }
        }
      }
    }
    for (const [key, ids] of defaults) expect(ids, key).toHaveLength(1);
  });

  test('defaults follow the map in either drawn direction, falling back to related-to', () => {
    expect(defaultRelation('research-question', 'objective')).toBe('addresses');
    expect(defaultRelation('objective', 'research-question')).toBe('addresses');
    expect(defaultRelation('finding', 'conclusion')).toBe('supports');
    expect(defaultRelation('objective', 'objective')).toBe('refines');
    expect(defaultRelation('finding', 'finding')).toBe('related-to');
    expect(defaultRelation('topic', 'question')).toBe('related-to');
  });

  test('related-to fits every pair; typed relations fit only their pairs', () => {
    for (const a of NODE_TYPE_IDS) for (const b of NODE_TYPE_IDS) expect(isRelationAllowed('related-to', a, b)).toBe(true);
    expect(isRelationAllowed('supports', 'conclusion', 'finding')).toBe(true);
    expect(isRelationAllowed('supports', 'question', 'finding')).toBe(false);
    expect(isRelationAllowed('contradicts', 'finding', 'finding')).toBe(true);
  });
});

describe('orient', () => {
  const types = new Map<string, NodeTypeId>([
    ['f', 'finding'], ['c', 'conclusion'], ['q', 'question'], ['o1', 'objective'], ['o2', 'objective'],
  ]);
  const typeOf = (id: string): NodeTypeId | undefined => types.get(id);

  test('reads the subject from the map, whichever way the connector was drawn', () => {
    expect(orient({ source: 'f', target: 'c', relationType: 'supports' }, typeOf)).toEqual({
      subject: 'f', object: 'c', reversed: false,
    });
    expect(orient({ source: 'c', target: 'f', relationType: 'supports' }, typeOf)).toEqual({
      subject: 'f', object: 'c', reversed: true,
    });
  });

  test('keeps the stored direction for same-type and symmetric relations', () => {
    expect(orient({ source: 'o2', target: 'o1', relationType: 'refines' }, typeOf)).toEqual({
      subject: 'o2', object: 'o1', reversed: false,
    });
    expect(orient({ source: 'c', target: 'q', relationType: 'related-to' }, typeOf)).toEqual({
      subject: 'c', object: 'q', reversed: false,
    });
  });

  test('returns null for a relation that does not fit, or an unknown endpoint', () => {
    expect(orient({ source: 'q', target: 'c', relationType: 'supports' }, typeOf)).toBeNull();
    expect(orient({ source: 'f', target: 'missing', relationType: 'related-to' }, typeOf)).toBeNull();
  });
});

describe('provenance', () => {
  test('accepts each origin and requires AI details only for ai', () => {
    expect(provenanceSchema.safeParse({ origin: 'researcher', edited: false }).success).toBe(true);
    expect(provenanceSchema.safeParse({ origin: 'unrecorded', edited: false }).success).toBe(true);
    expect(provenanceSchema.safeParse({ origin: 'ai', edited: false }).success).toBe(false);
    expect(
      provenanceSchema.safeParse({
        origin: 'ai',
        ai: { feature: 'ai.capture', model: 'Claude Sonnet', acceptedAt: '2026-11-25T10:00:00.000Z' },
        edited: true,
      }).success,
    ).toBe(true);
    expect(
      provenanceSchema.safeParse({
        origin: 'ai',
        ai: { feature: 'models.premium', model: 'x', acceptedAt: '2026-11-25T10:00:00.000Z' },
        edited: false,
      }).success,
    ).toBe(false);
    expect(provenanceSchema.safeParse({ origin: 'researcher' }).success).toBe(false);
  });
});
