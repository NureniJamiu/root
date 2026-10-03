import { describe, it, expect } from 'vitest';
import { emptyCanvas, addRoot, addChild, reparentChild } from '../../data/mutators';
import type { Edge } from 'reactflow';
import { determineReparent, determineReconnect } from '../reconnect';

describe('determineReparent', () => {
  it('prevents Root node from becoming a child when connecting with Root', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 500, y: 300 } });
    const childId = canvas.nodes[1]!.id;

    // Drag from child to root
    const res1 = determineReparent(canvas, {
      source: childId,
      target: rootId,
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
    expect(res1).toEqual({ childId, parentId: rootId });

    // Drag from root to child
    const res2 = determineReparent(canvas, {
      source: rootId,
      target: childId,
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
    expect(res2).toEqual({ childId, parentId: rootId });
  });

  it('prevents cycle when connecting an ancestor to a descendant', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 300, y: 100 } });
    const pId = canvas.nodes[1]!.id;

    canvas = addChild(canvas, pId, { position: { x: 600, y: 100 } });
    const cId = canvas.nodes[2]!.id;

    // Making pId a child of cId would create a cycle.
    // determineReparent must resolve cId as child and pId as parent.
    const res = determineReparent(canvas, {
      source: cId,
      target: pId,
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
    expect(res).toEqual({ childId: cId, parentId: pId });
  });

  it('respects incoming left handle as child seeking parent', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 600, y: 200 } });
    const nodeA = canvas.nodes[1]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 600, y: 500 } });
    const nodeB = canvas.nodes[2]!.id;

    // Drag from nodeA's left incoming handle to nodeB
    const res = determineReparent(canvas, {
      source: nodeA,
      target: nodeB,
      sourceHandle: 'target-left',
      targetHandle: 'source-right',
    });
    expect(res).toEqual({ childId: nodeA, parentId: nodeB });
  });

  it('uses spatial left to right orientation as fallback for siblings', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 400, y: 200 } });
    const leftSibling = canvas.nodes[1]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 700, y: 200 } });
    const rightSibling = canvas.nodes[2]!.id;

    const res = determineReparent(canvas, {
      source: rightSibling,
      target: leftSibling,
      sourceHandle: undefined,
      targetHandle: undefined,
    });
    expect(res).toEqual({ childId: rightSibling, parentId: leftSibling });
  });

  it('returns null for self connections or missing nodes', () => {
    const canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    expect(determineReparent(canvas, { source: rootId, target: rootId })).toBeNull();
    expect(determineReparent(canvas, { source: rootId, target: 'non-existent' })).toBeNull();
  });
});

describe('determineReconnect', () => {
  it('reconnects an existing node back to Root when edge updater is dropped on Root', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 400, y: 100 } });
    const parent1 = canvas.nodes[1]!.id;

    canvas = addChild(canvas, parent1, { position: { x: 700, y: 100 } });
    const childId = canvas.nodes[2]!.id;

    const oldEdge: Edge = {
      id: `e:${parent1}->${childId}`,
      source: parent1,
      target: childId,
    };

    // User drags edge updater to Root
    const resA = determineReconnect(canvas, oldEdge, {
      source: rootId,
      target: childId,
    });
    expect(resA).toEqual({ childId, parentId: rootId });

    const resB = determineReconnect(canvas, oldEdge, {
      source: parent1,
      target: rootId,
    });
    expect(resB).toEqual({ childId, parentId: rootId });
  });

  it('reconnects node to a previous parent node that it was connected to before', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 300, y: 100 } });
    const p1Id = canvas.nodes[1]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 300, y: 400 } });
    const p2Id = canvas.nodes[2]!.id;

    canvas = addChild(canvas, p1Id, { position: { x: 600, y: 100 } });
    const childId = canvas.nodes[3]!.id;

    // Node was initially under p1, then reparented to p2
    canvas = reparentChild(canvas, childId, p2Id);

    const oldEdge: Edge = {
      id: `e:${p2Id}->${childId}`,
      source: p2Id,
      target: childId,
    };

    // Now user reconnects edge back to p1
    const res = determineReconnect(canvas, oldEdge, {
      source: p1Id,
      target: childId,
    });
    expect(res).toEqual({ childId, parentId: p1Id });
  });

  it('returns null if no external node is targeted', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 300, y: 100 } });
    const childId = canvas.nodes[1]!.id;

    const oldEdge: Edge = {
      id: `e:${rootId}->${childId}`,
      source: rootId,
      target: childId,
    };

    const res = determineReconnect(canvas, oldEdge, {
      source: rootId,
      target: childId,
    });
    expect(res).toBeNull();
  });
});
