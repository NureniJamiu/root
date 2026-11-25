/**
 * Provenance stamping (M0 plan D6): the mutators are the only write path.
 * New ideas and connectors are the researcher's unless the caller passes
 * provenance built with the constructors; editing an AI idea marks it edited.
 */

import { beforeEach, describe, expect, test } from 'vitest';

import { aiProvenance } from '../model';
import { addChild, addImage, addNode, connect, emptyCanvas, moveNode, updateEdge, updateNode } from '../mutators';
import { canvasActions, useCanvasStore } from '../store';

const RESEARCHER = { origin: 'researcher', edited: false };
const AI = aiProvenance({ feature: 'ai.map', model: 'Test model', acceptedAt: '2024-01-01T00:00:00.000Z' });

describe('mutators stamp provenance', () => {
  test('addNode: the researcher, empty fields', () => {
    const c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    expect(c.schemaVersion).toBe(2);
    expect(c.nodes[0]).toMatchObject({ fields: {}, provenance: RESEARCHER });
  });

  test('addChild: the researcher on the idea and on its connector, which is related-to', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = addChild(c, c.nodes[0]!.id, { position: { x: 400, y: 0 } });
    expect(c.nodes[1]!.provenance).toStrictEqual(RESEARCHER);
    expect(c.edges[0]).toMatchObject({ relationType: 'related-to', provenance: RESEARCHER });
  });

  test('connect: the researcher, related-to', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = addNode(c, { position: { x: 400, y: 0 }, type: 'finding' });
    c = connect(c, { source: c.nodes[0]!.id, target: c.nodes[1]!.id, sourceSide: 'right', targetSide: 'left' });
    expect(c.edges[0]).toMatchObject({ relationType: 'related-to', provenance: RESEARCHER });
  });

  test('given provenance is used for the idea and its connector', () => {
    let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    c = addChild(c, c.nodes[0]!.id, { position: { x: 400, y: 0 }, title: 'Suggested', provenance: AI });
    expect(c.nodes[1]).toMatchObject({ title: 'Suggested', provenance: AI });
    expect(c.edges[0]!.provenance).toStrictEqual(AI);
  });
});

describe('editing an AI idea marks it edited', () => {
  const aiCanvas = () => {
    const c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    return addChild(c, c.nodes[0]!.id, { position: { x: 400, y: 0 }, provenance: AI });
  };

  test('changing its text does; moving it does not', () => {
    const c = aiCanvas();
    const id = c.nodes[1]!.id;
    expect(moveNode(c, id, { x: 10, y: 10 }).nodes[1]!.provenance).toStrictEqual(AI);
    const edited = updateNode(c, id, { title: 'Mine now' }).nodes[1]!.provenance;
    expect(edited).toStrictEqual({ ...AI, edited: true });
  });

  test('adding an image does', () => {
    const c = aiCanvas();
    const image = { id: crypto.randomUUID(), dataUrl: 'data:image/png;base64,AA', addedAt: '2024-01-01T00:00:00.000Z' };
    expect(addImage(c, c.nodes[1]!.id, image).nodes[1]!.provenance.edited).toBe(true);
  });

  test('a researcher idea stays as it was', () => {
    const c = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    expect(updateNode(c, c.nodes[0]!.id, { body: 'notes' }).nodes[0]!.provenance).toStrictEqual(RESEARCHER);
  });

  test('re-attaching an AI connector to another card does; moving an end to another side does not', () => {
    let c = aiCanvas();
    c = addNode(c, { position: { x: 800, y: 0 } });
    const edge = c.edges[0]!;
    const sides = updateEdge(c, edge.id, { ...edge, sourceSide: 'bottom' });
    expect(sides.edges[0]!.provenance).toStrictEqual(AI);
    const moved = updateEdge(c, edge.id, { ...edge, target: c.nodes[2]!.id });
    expect(moved.edges[0]!.provenance).toStrictEqual({ ...AI, edited: true });
    expect(moved.edges[0]!.relationType).toBe('related-to');
  });
});

describe('store actions stamp the researcher', () => {
  beforeEach(() => canvasActions.loadCanvas(emptyCanvas()));

  test('addNode, addChild, createIdea and connect', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    const root = useCanvasStore.getState().canvas.nodes[0]!.id;
    canvasActions.addChild(root, { x: 400, y: 0 });
    canvasActions.createIdea({ position: { x: 0, y: 400 }, title: 'From a document' });
    const ids = useCanvasStore.getState().canvas.nodes.map((n) => n.id);
    canvasActions.connect({ source: ids[2]!, target: ids[1]!, sourceSide: 'right', targetSide: 'left' });
    const { nodes, edges } = useCanvasStore.getState().canvas;
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    for (const item of [...nodes, ...edges]) expect(item.provenance).toStrictEqual(RESEARCHER);
  });
});
