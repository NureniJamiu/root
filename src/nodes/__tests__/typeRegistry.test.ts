/**
 * Registry property test (M0 plan S4): every type the canvas accepts has a
 * style, a label, stages and an AI guide, belongs to exactly one picker
 * group, and declares only fields the generated editor can show.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ENABLED_NODE_TYPE_IDS,
  ENABLED_TYPES_BY_FAMILY,
  NODE_FAMILIES,
  NODE_TYPES,
  STAGE_IDS,
  familyTypes,
  fieldChoices,
  nodeTypeLabel,
  nodeTypeSchema,
} from '../../data';
import { PALETTE, typeColorToken, typeStyles } from '../typeStyles';

const tokensCss = readFileSync(resolve(__dirname, '../../theme/tokens.css'), 'utf8');

describe('node-type registry: every enabled type is complete', () => {
  it.each(ENABLED_NODE_TYPE_IDS)('%s has a style, label, stages, guide and family', (type) => {
    const def = NODE_TYPES[type];
    expect(typeStyles[type]).toBeDefined();
    expect(Object.values(PALETTE)).toContain(typeStyles[type].border);
    expect(nodeTypeLabel(type).trim()).not.toBe('');
    expect(def.stages.length).toBeGreaterThan(0);
    for (const stage of def.stages) expect(STAGE_IDS).toContain(stage);
    expect(def.aiGuide.trim()).not.toBe('');
    expect(Object.keys(NODE_FAMILIES)).toContain(def.family);
    // The colour token exists in both themes.
    const token = typeColorToken(type);
    expect(tokensCss.match(new RegExp(`--${token}:`, 'g'))?.length).toBe(2);
  });

  it.each(ENABLED_NODE_TYPE_IDS)('%s declares only optional choice fields, all shown by the editor', (type) => {
    const shape = NODE_TYPES[type].fields.shape as Record<string, z.ZodTypeAny>;
    const shown = fieldChoices(type).map((f) => f.key);
    expect(shown).toEqual(Object.keys(shape));
    for (const schema of Object.values(shape)) expect(schema.safeParse(undefined).success).toBe(true);
  });

  it('the canvas accepts every registry type', () => {
    expect([...nodeTypeSchema.options].sort()).toEqual(Object.keys(NODE_TYPES).sort());
  });

  it('every enabled type sits in exactly one picker group, general family first', () => {
    const grouped = ENABLED_TYPES_BY_FAMILY.flatMap((g) => g.types);
    expect([...grouped].sort()).toEqual([...ENABLED_NODE_TYPE_IDS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(ENABLED_TYPES_BY_FAMILY[0]?.family).toBe('general');
    expect(ENABLED_TYPES_BY_FAMILY.map((g) => g.label)).toEqual(['General', 'Problem framing']);
  });

  it('familyTypes lists the types of the same family, in picker order', () => {
    expect(familyTypes('question')).toEqual(['topic', 'finding', 'question', 'conclusion']);
    expect(familyTypes('hypothesis')).toEqual(['problem', 'objective', 'research-question', 'hypothesis', 'variable']);
  });
});
