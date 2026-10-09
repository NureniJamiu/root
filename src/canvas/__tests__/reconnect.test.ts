import { describe, it, expect } from 'vitest';
import { emptyCanvas, addRoot, addChild, reparentChild } from '../../data/mutators';
import type { Edge } from 'reactflow';
import { determineReparent, determineReconnect, computeFacingSides, resolveConnectionSides } from '../reconnect';

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
    expect(res1).toMatchObject({ childId, parentId: rootId });

    // Drag from root to child
    const res2 = determineReparent(canvas, {
      source: rootId,
      target: childId,
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    });
    expect(res2).toMatchObject({ childId, parentId: rootId });
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
    expect(res).toMatchObject({ childId: cId, parentId: pId });
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
    expect(res).toMatchObject({ childId: nodeA, parentId: nodeB });
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
    expect(res).toMatchObject({ childId: rightSibling, parentId: leftSibling });
  });

  it('returns null for self connections or missing nodes', () => {
    const canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    expect(determineReparent(canvas, { source: rootId, target: rootId })).toBeNull();
    expect(determineReparent(canvas, { source: rootId, target: 'non-existent' })).toBeNull();
  });

  it('prevents duplicate connection between the same pair of points', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;
    // Child is at (500, 100) -> facing sides are right -> left
    canvas = addChild(canvas, rootId, { position: { x: 500, y: 100 } });
    const childId = canvas.nodes[1]!.id;

    // First connection: child already connected from right to left
    // Trying to connect again to the exact same pair of points (right to left)
    const duplicate = determineReparent(canvas, {
      source: rootId,
      target: childId,
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
    expect(duplicate).toBeNull();

    // Connecting to a DIFFERENT handle is allowed
    const differentHandle = determineReparent(canvas, {
      source: rootId,
      target: childId,
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    });
    expect(differentHandle).not.toBeNull();
    expect(differentHandle?.sourceSide).toBe('bottom');
    expect(differentHandle?.targetSide).toBe('top');
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
    expect(resA).toMatchObject({ childId, parentId: rootId });

    const resB = determineReconnect(canvas, oldEdge, {
      source: parent1,
      target: rootId,
    });
    expect(resB).toMatchObject({ childId, parentId: rootId });
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
    expect(res).toMatchObject({ childId, parentId: p1Id });
  });

  it('returns null if no external node is targeted and no handle changed', () => {
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

  it('moving connection end to a different side on the same node updates side and pins it', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    // Child is at (500, 100) -> facing sides are right -> left
    canvas = addChild(canvas, rootId, { position: { x: 500, y: 100 } });
    const childId = canvas.nodes[1]!.id;

    const oldEdge: Edge = {
      id: `e:${rootId}->${childId}`,
      source: rootId,
      target: childId,
    };

    // User drags target end to child's 'top' handle
    const resTargetMove = determineReconnect(canvas, oldEdge, {
      source: rootId,
      target: childId,
      sourceHandle: 'source-right',
      targetHandle: 'target-top',
    });

    expect(resTargetMove).not.toBeNull();
    expect(resTargetMove?.childId).toBe(childId);
    expect(resTargetMove?.parentId).toBe(rootId);
    expect(resTargetMove?.targetSide).toBe('top');
    expect(resTargetMove?.targetPinned).toBe(true);

    // User drags source end to parent's 'bottom' handle
    const resSourceMove = determineReconnect(canvas, oldEdge, {
      source: rootId,
      target: childId,
      sourceHandle: 'source-bottom',
      targetHandle: 'target-left',
    });

    expect(resSourceMove).not.toBeNull();
    expect(resSourceMove?.childId).toBe(childId);
    expect(resSourceMove?.parentId).toBe(rootId);
    expect(resSourceMove?.sourceSide).toBe('bottom');
    expect(resSourceMove?.sourcePinned).toBe(true);
  });

  it('prevents self-connection during reconnect', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 100, y: 100 } });
    const rootId = canvas.nodes[0]!.id;

    canvas = addChild(canvas, rootId, { position: { x: 500, y: 100 } });
    const childId = canvas.nodes[1]!.id;

    const oldEdge: Edge = {
      id: `e:${rootId}->${childId}`,
      source: rootId,
      target: childId,
    };

    // Connecting node to itself
    const res = determineReconnect(canvas, oldEdge, {
      source: childId,
      target: childId,
    });
    expect(res).toBeNull();
  });
});

describe('computeFacingSides and resolveConnectionSides', () => {
  it('chooses right -> left when child is to the right', () => {
    const parentPos = { x: 100, y: 100 };
    const childPos = { x: 500, y: 100 };
    expect(computeFacingSides(parentPos, childPos)).toEqual({
      sourceSide: 'right',
      targetSide: 'left',
    });
  });

  it('chooses left -> right when child is to the left', () => {
    const parentPos = { x: 500, y: 100 };
    const childPos = { x: 100, y: 100 };
    expect(computeFacingSides(parentPos, childPos)).toEqual({
      sourceSide: 'left',
      targetSide: 'right',
    });
  });

  it('chooses bottom -> top when child is below', () => {
    const parentPos = { x: 100, y: 100 };
    const childPos = { x: 100, y: 500 };
    expect(computeFacingSides(parentPos, childPos)).toEqual({
      sourceSide: 'bottom',
      targetSide: 'top',
    });
  });

  it('chooses top -> bottom when child is above', () => {
    const parentPos = { x: 100, y: 500 };
    const childPos = { x: 100, y: 100 };
    expect(computeFacingSides(parentPos, childPos)).toEqual({
      sourceSide: 'top',
      targetSide: 'bottom',
    });
  });

  it('chooses side along larger distance when nodes are diagonal', () => {
    const parentPos = { x: 100, y: 100 };
    // dx = 400, dy = 150 -> larger horizontal distance -> right to left
    expect(computeFacingSides(parentPos, { x: 500, y: 250 })).toEqual({
      sourceSide: 'right',
      targetSide: 'left',
    });

    // dx = 150, dy = 400 -> larger vertical distance -> bottom to top
    expect(computeFacingSides(parentPos, { x: 250, y: 500 })).toEqual({
      sourceSide: 'bottom',
      targetSide: 'top',
    });
  });

  it('pinned side preserves chosen side regardless of node movement', () => {
    const parentPos = { x: 100, y: 100 };
    const childPos = { x: 500, y: 100 }; // horizontally right

    // When child has targetSide 'top' and targetPinned = true
    const resolved = resolveConnectionSides(parentPos, childPos, {
      targetSide: 'top',
      targetPinned: true,
      sourcePinned: false,
    });

    // Parent is unpinned, so it follows automatic facing (right)
    // Child is pinned to top, so it keeps top
    expect(resolved.sourceSide).toBe('right');
    expect(resolved.targetSide).toBe('top');
  });
});
