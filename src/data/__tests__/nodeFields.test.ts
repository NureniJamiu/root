/**
 * Per-type fields (M0 plan S4): `node.fields` is validated by the type's
 * registry schema, and retyping keeps the fields the new type also defines
 * and drops the rest, as one undo step.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { fieldsForType } from '../model';
import { addNode, emptyCanvas, updateNode } from '../mutators';
import { canvasSchema } from '../schema';
import { canvasActions, useCanvasStore } from '../store';
import type { Canvas, NodeType } from '../types';

function withNode(type: NodeType, fields: Record<string, unknown>): Canvas {
  const c = addNode(emptyCanvas(), { position: { x: 0, y: 0 }, type });
  return { ...c, nodes: c.nodes.map((n) => ({ ...n, fields })) };
}

const parsedFields = (c: Canvas): Record<string, unknown> | null => {
  const r = canvasSchema.safeParse(c);
  return r.success ? r.data.nodes[0]!.fields : null;
};

describe('per-type field validation', () => {
  it.each([
    ['objective', { scope: 'general' }],
    ['objective', { scope: 'specific' }],
    ['hypothesis', { form: 'null', direction: 'directional' }],
    ['hypothesis', { form: 'alternative', direction: 'non-directional' }],
    ['variable', { role: 'moderator', measurementLevel: 'ordinal' }],
    ['problem', {}],
    ['research-question', {}],
  ] as const)('%s accepts %j', (type, fields) => {
    expect(parsedFields(withNode(type, fields))).toEqual(fields);
  });

  it.each([
    ['objective', { scope: 'broad' }],
    ['hypothesis', { form: 'maybe' }],
    ['hypothesis', { direction: 'up' }],
    ['variable', { role: 'cause' }],
    ['variable', { measurementLevel: 'continuous' }],
  ] as const)('%s rejects %j', (type, fields) => {
    expect(canvasSchema.safeParse(withNode(type, fields)).success).toBe(false);
  });

  it('drops keys the type does not define', () => {
    expect(parsedFields(withNode('objective', { scope: 'general', role: 'dependent' }))).toEqual({ scope: 'general' });
    expect(parsedFields(withNode('research-question', { scope: 'general' }))).toEqual({});
  });

  it('fieldsForType keeps the defined keys with accepted values only', () => {
    expect(fieldsForType('variable', { role: 'control', measurementLevel: 'x', scope: 'general' })).toEqual({
      role: 'control',
    });
    expect(fieldsForType('topic', { scope: 'general' })).toEqual({});
  });
});

describe('retyping', () => {
  it('keeps the fields the new type defines and drops the rest', () => {
    const c = withNode('variable', { role: 'dependent', measurementLevel: 'ratio' });
    const id = c.nodes[0]!.id;
    expect(updateNode(c, id, { type: 'variable' }).nodes[0]!.fields).toEqual({
      role: 'dependent',
      measurementLevel: 'ratio',
    });
    expect(updateNode(c, id, { type: 'hypothesis' }).nodes[0]!.fields).toEqual({});
    // Fields patched with the type are trimmed to the new type.
    expect(
      updateNode(c, id, { type: 'hypothesis', fields: { role: 'dependent', form: 'null' } }).nodes[0]!.fields,
    ).toEqual({ form: 'null' });
  });

  it('leaves fields alone when neither type nor fields change', () => {
    const c = withNode('objective', { scope: 'specific' });
    expect(updateNode(c, c.nodes[0]!.id, { title: 'New' }).nodes[0]!.fields).toEqual({ scope: 'specific' });
  });

  describe('through the store', () => {
    const canvas = (): Canvas => useCanvasStore.getState().canvas;

    beforeEach(() => {
      canvasActions.loadCanvas(emptyCanvas());
    });

    it('saving a retype with new fields is one undo step', () => {
      canvasActions.addNode({ x: 0, y: 0 });
      const id = canvas().nodes[0]!.id;
      canvasActions.saveNodeEdits(id, { title: 'Aim', body: '', type: 'objective', fields: { scope: 'general' }, images: [] });
      expect(canvas().nodes[0]!.fields).toEqual({ scope: 'general' });

      canvasActions.saveNodeEdits(id, {
        title: 'Aim',
        body: '',
        type: 'variable',
        fields: { scope: 'general', role: 'independent' },
        images: [],
      });
      expect(canvas().nodes[0]!.type).toBe('variable');
      expect(canvas().nodes[0]!.fields).toEqual({ role: 'independent' });

      canvasActions.undo();
      expect(canvas().nodes[0]!.type).toBe('objective');
      expect(canvas().nodes[0]!.fields).toEqual({ scope: 'general' });
    });

    it('a field change alone is saved, and saving the same values adds no undo step', () => {
      canvasActions.addNode({ x: 0, y: 0 });
      const id = canvas().nodes[0]!.id;
      canvasActions.saveNodeEdits(id, { title: '', body: '', type: 'hypothesis', images: [] });
      canvasActions.saveNodeEdits(id, { title: '', body: '', type: 'hypothesis', fields: { form: 'null' }, images: [] });
      expect(canvas().nodes[0]!.fields).toEqual({ form: 'null' });
      canvasActions.saveNodeEdits(id, { title: '', body: '', type: 'hypothesis', fields: { form: 'null' }, images: [] });
      canvasActions.undo();
      expect(canvas().nodes[0]!.fields).toEqual({});
      expect(canvas().nodes[0]!.type).toBe('hypothesis');
    });

    it('the hover-toolbar retype (updateNode) is one undo step', () => {
      canvasActions.addNode({ x: 0, y: 0 });
      const id = canvas().nodes[0]!.id;
      canvasActions.saveNodeEdits(id, { title: '', body: '', type: 'objective', fields: { scope: 'specific' }, images: [] });
      canvasActions.updateNode(id, { type: 'research-question' });
      expect(canvas().nodes[0]!.fields).toEqual({});
      canvasActions.undo();
      expect(canvas().nodes[0]!.type).toBe('objective');
      expect(canvas().nodes[0]!.fields).toEqual({ scope: 'specific' });
    });
  });
});
