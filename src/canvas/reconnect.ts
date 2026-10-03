import type { Edge } from 'reactflow';
import { hasCycle } from '../data';
import type { Canvas, UUID } from '../data';

export interface ReparentResolution {
  childId: UUID;
  parentId: UUID;
}

export type ConnectionLike = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null | undefined;
  targetHandle?: string | null | undefined;
};

/**
 * Resolves child and parent IDs when connecting two nodes.
 * Enforces tree invariants:
 *  1. Root node cannot be a child.
 *  2. Neither node can be a child of its own descendant (no cycles).
 *  3. Handle directional intent (left/top are incoming ports; right/bottom are outgoing ports).
 *  4. Spatial position (left node is parent, right node is child).
 *  5. Default fallback (target is child of source).
 */
export function determineReparent(
  canvas: Canvas,
  connection: ConnectionLike,
): ReparentResolution | null {
  const { source, target, sourceHandle, targetHandle } = connection;
  if (!source || !target || source === target) return null;

  const nodeA = canvas.nodes.find((n) => n.id === source);
  const nodeB = canvas.nodes.find((n) => n.id === target);
  if (!nodeA || !nodeB) return null;

  // Rule 1: Root cannot be a child
  if (nodeA.parentId === null) {
    return { childId: nodeB.id, parentId: nodeA.id };
  }
  if (nodeB.parentId === null) {
    return { childId: nodeA.id, parentId: nodeB.id };
  }

  // Rule 2: Prevent cycles
  const aIntoBHasCycle = hasCycle(canvas, nodeA.id, nodeB.id);
  const bIntoAHasCycle = hasCycle(canvas, nodeB.id, nodeA.id);

  if (aIntoBHasCycle && !bIntoAHasCycle) {
    return { childId: nodeB.id, parentId: nodeA.id };
  }
  if (bIntoAHasCycle && !aIntoBHasCycle) {
    return { childId: nodeA.id, parentId: nodeB.id };
  }
  if (aIntoBHasCycle && bIntoAHasCycle) {
    return null;
  }

  // Rule 3: Handle directions & intent
  // In a tree layout:
  // - 'left' or 'top': incoming connector (child seeking parent)
  // - 'right' or 'bottom': outgoing connector (parent branching to child)
  const sourceIsIncoming = sourceHandle?.includes('left') || sourceHandle?.includes('top') || sourceHandle === 'target';
  const sourceIsOutgoing = sourceHandle?.includes('right') || sourceHandle?.includes('bottom');
  const targetIsIncoming = targetHandle?.includes('left') || targetHandle?.includes('top');
  const targetIsOutgoing = targetHandle?.includes('right') || targetHandle?.includes('bottom') || targetHandle === 'source';

  // If source handle is incoming, nodeA is seeking a parent
  if (sourceIsIncoming && !sourceIsOutgoing) {
    return { childId: nodeA.id, parentId: nodeB.id };
  }
  // If target handle is outgoing, nodeB is offering a parent
  if (targetIsOutgoing && !targetIsIncoming) {
    return { childId: nodeA.id, parentId: nodeB.id };
  }
  // If source handle is outgoing, nodeA is offering a parent
  if (sourceIsOutgoing && !sourceIsIncoming) {
    return { childId: nodeB.id, parentId: nodeA.id };
  }
  // If target handle is incoming, nodeB is seeking a parent
  if (targetIsIncoming && !targetIsOutgoing) {
    return { childId: nodeB.id, parentId: nodeA.id };
  }

  // Rule 4: Spatial orientation fallback (left node is parent, right node is child)
  if (nodeA.position.x < nodeB.position.x) {
    return { childId: nodeB.id, parentId: nodeA.id };
  }
  if (nodeB.position.x < nodeA.position.x) {
    return { childId: nodeA.id, parentId: nodeB.id };
  }

  // Rule 5: Default fallback
  return { childId: nodeB.id, parentId: nodeA.id };
}

/**
 * Resolves child and parent IDs when reconnecting an existing edge.
 *
 * In Root canvas, edges are directed: oldEdge.source is parent, oldEdge.target is child.
 * When an edge updater is dragged, one endpoint moves to a new node (`otherId`),
 * while the other endpoint stays attached.
 */
export function determineReconnect(
  canvas: Canvas,
  oldEdge: Edge,
  newConnection: ConnectionLike,
): ReparentResolution | null {
  if (!newConnection.source || !newConnection.target) return null;

  const originalChildId = oldEdge.target;
  const originalParentId = oldEdge.source;

  // The other node involved in the reconnection (the new node connected to)
  const otherId = [newConnection.source, newConnection.target].find(
    (id) => id !== originalChildId && id !== originalParentId,
  );

  if (!otherId) {
    return null;
  }

  const otherNode = canvas.nodes.find((n) => n.id === otherId);
  if (!otherNode) return null;

  // If otherNode is root, it can never be a child.
  // Therefore originalChildId is reconnecting to otherNode as its new parent.
  if (otherNode.parentId === null) {
    return { childId: originalChildId, parentId: otherId };
  }

  // If making otherNode a child of originalParentId would create a cycle:
  // otherNode cannot be child of originalParentId.
  // Therefore originalChildId is reconnecting to otherNode as its new parent.
  if (hasCycle(canvas, otherId, originalParentId)) {
    return { childId: originalChildId, parentId: otherId };
  }

  // Check which end of the edge was dragged:
  // If the parent end was dragged to otherId, user wants otherId as the new parent.
  const parentEndMoved =
    (newConnection.target === originalChildId && newConnection.source === otherId) ||
    (newConnection.source === originalChildId && newConnection.target === otherId);

  if (parentEndMoved) {
    if (!hasCycle(canvas, originalChildId, otherId)) {
      return { childId: originalChildId, parentId: otherId };
    }
  }

  // If the child end was dragged to otherId:
  const childEndMoved =
    (newConnection.target === otherId && newConnection.source === originalParentId) ||
    (newConnection.source === otherId && newConnection.target === originalParentId);

  if (childEndMoved) {
    // If otherNode is to the left of originalChild, user likely intends to reconnect originalChild to otherNode
    const originalChild = canvas.nodes.find((n) => n.id === originalChildId);
    if (originalChild && otherNode.position.x <= originalChild.position.x && !hasCycle(canvas, originalChildId, otherId)) {
      return { childId: originalChildId, parentId: otherId };
    }
    // Otherwise otherNode becomes child of originalParentId if valid
    if (!hasCycle(canvas, otherId, originalParentId)) {
      return { childId: otherId, parentId: originalParentId };
    }
  }

  // General fallbacks:
  if (!hasCycle(canvas, originalChildId, otherId)) {
    return { childId: originalChildId, parentId: otherId };
  }
  if (!hasCycle(canvas, otherId, originalParentId)) {
    return { childId: otherId, parentId: originalParentId };
  }

  return null;
}
