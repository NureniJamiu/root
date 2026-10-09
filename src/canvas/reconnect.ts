import type { Edge } from 'reactflow';
import { hasCycle } from '../data';
import type { Canvas, Position, Side, UUID } from '../data';

export interface ReparentResolution {
  childId: UUID;
  parentId: UUID;
  sourceSide?: Side;
  targetSide?: Side;
  sourcePinned?: boolean;
  targetPinned?: boolean;
}

export type ConnectionLike = {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null | undefined;
  targetHandle?: string | null | undefined;
};

/**
 * Extracts Side ('top' | 'right' | 'bottom' | 'left') from any handle ID.
 */
export function handleIdToSide(handleId?: string | null): Side | null {
  if (!handleId) return null;
  if (handleId.includes('left')) return 'left';
  if (handleId.includes('right')) return 'right';
  if (handleId.includes('top')) return 'top';
  if (handleId.includes('bottom')) return 'bottom';
  return null;
}

/**
 * Automatic side selection rule:
 * - A connector always attaches to the sides of its two nodes that face each other.
 * - If node B is to the right of node A, the connector leaves A's right side and enters B's left side.
 * - If B is below A, it leaves A's bottom and enters B's top.
 * - The same applies for left and above.
 * - When nodes are diagonal to each other, choose the side along the larger distance (horizontal vs vertical).
 */
export function computeFacingSides(
  sourcePos: Position,
  targetPos: Position,
): { sourceSide: Side; targetSide: Side } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourceSide: 'right', targetSide: 'left' };
    } else {
      return { sourceSide: 'left', targetSide: 'right' };
    }
  } else {
    if (dy >= 0) {
      return { sourceSide: 'bottom', targetSide: 'top' };
    } else {
      return { sourceSide: 'top', targetSide: 'bottom' };
    }
  }
}

/**
 * Resolves the connection sides taking pinning into account.
 * Pinned ends keep their chosen side; unpinned ends follow the automatic rule.
 */
export function resolveConnectionSides(
  sourcePos: Position,
  targetPos: Position,
  connection?: {
    sourceSide?: Side | null | undefined;
    targetSide?: Side | null | undefined;
    sourcePinned?: boolean | null | undefined;
    targetPinned?: boolean | null | undefined;
  },
): { sourceSide: Side; targetSide: Side } {
  const automatic = computeFacingSides(sourcePos, targetPos);

  const sourceSide =
    connection?.sourcePinned && connection.sourceSide
      ? connection.sourceSide
      : automatic.sourceSide;

  const targetSide =
    connection?.targetPinned && connection.targetSide
      ? connection.targetSide
      : automatic.targetSide;

  return { sourceSide, targetSide };
}

/**
 * Resolves child and parent IDs and connection sides when connecting two nodes.
 * Enforces:
 *  1. No self-connections (source !== target).
 *  2. No duplicate connections between the same pair of points.
 *  3. Root node cannot be a child.
 *  4. Neither node can be a child of its own descendant (no cycles).
 *  5. Handle directional intent (left/top incoming; right/bottom outgoing).
 *  6. Spatial position (left node is parent, right node is child).
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

  let resolvedParentId: UUID;
  let resolvedChildId: UUID;

  // Rule 1: Root cannot be a child
  if (nodeA.parentId === null && nodeB.parentId !== null) {
    resolvedParentId = nodeA.id;
    resolvedChildId = nodeB.id;
  } else if (nodeB.parentId === null && nodeA.parentId !== null) {
    resolvedParentId = nodeB.id;
    resolvedChildId = nodeA.id;
  } else {
    // Rule 2: Prevent cycles
    const aIntoBHasCycle = hasCycle(canvas, nodeA.id, nodeB.id);
    const bIntoAHasCycle = hasCycle(canvas, nodeB.id, nodeA.id);

    if (aIntoBHasCycle && !bIntoAHasCycle) {
      resolvedParentId = nodeA.id;
      resolvedChildId = nodeB.id;
    } else if (bIntoAHasCycle && !aIntoBHasCycle) {
      resolvedParentId = nodeB.id;
      resolvedChildId = nodeA.id;
    } else if (aIntoBHasCycle && bIntoAHasCycle) {
      return null;
    } else {
      // Rule 3: Handle directions & intent
      const sourceIsIncoming = sourceHandle?.includes('left') || sourceHandle?.includes('top') || sourceHandle === 'target';
      const sourceIsOutgoing = sourceHandle?.includes('right') || sourceHandle?.includes('bottom');
      const targetIsIncoming = targetHandle?.includes('left') || targetHandle?.includes('top');
      const targetIsOutgoing = targetHandle?.includes('right') || targetHandle?.includes('bottom') || targetHandle === 'source';

      if (sourceIsIncoming && !sourceIsOutgoing) {
        resolvedParentId = nodeB.id;
        resolvedChildId = nodeA.id;
      } else if (targetIsOutgoing && !targetIsIncoming) {
        resolvedParentId = nodeB.id;
        resolvedChildId = nodeA.id;
      } else if (sourceIsOutgoing && !sourceIsIncoming) {
        resolvedParentId = nodeA.id;
        resolvedChildId = nodeB.id;
      } else if (targetIsIncoming && !targetIsOutgoing) {
        resolvedParentId = nodeA.id;
        resolvedChildId = nodeB.id;
      } else if (nodeA.position.x < nodeB.position.x) {
        // Rule 4: Spatial orientation fallback
        resolvedParentId = nodeA.id;
        resolvedChildId = nodeB.id;
      } else if (nodeB.position.x < nodeA.position.x) {
        resolvedParentId = nodeB.id;
        resolvedChildId = nodeA.id;
      } else {
        // Rule 5: Default fallback
        resolvedParentId = nodeA.id;
        resolvedChildId = nodeB.id;
      }
    }
  }

  // Determine attached sides on parent and child
  const parentNode = canvas.nodes.find((n) => n.id === resolvedParentId)!;
  const childNode = canvas.nodes.find((n) => n.id === resolvedChildId)!;

  const rawSourceSide = handleIdToSide(sourceHandle);
  const rawTargetSide = handleIdToSide(targetHandle);

  const facing = computeFacingSides(parentNode.position, childNode.position);
  const sourceSide: Side =
    source === resolvedParentId
      ? rawSourceSide ?? facing.sourceSide
      : rawTargetSide ?? facing.sourceSide;

  const targetSide: Side =
    source === resolvedParentId
      ? rawTargetSide ?? facing.targetSide
      : rawSourceSide ?? facing.targetSide;

  // Prevent duplicate connection between the exact same pair of points
  if (childNode.parentId === resolvedParentId) {
    const existingSourceSide = childNode.sourceSide ?? facing.sourceSide;
    const existingTargetSide = childNode.targetSide ?? facing.targetSide;
    if (existingSourceSide === sourceSide && existingTargetSide === targetSide) {
      return null;
    }
  }

  return {
    childId: resolvedChildId,
    parentId: resolvedParentId,
    sourceSide,
    targetSide,
    sourcePinned: false,
    targetPinned: false,
  };
}

/**
 * Resolves child and parent IDs when reconnecting an existing edge.
 *
 * In Root canvas, edges are directed: oldEdge.source is parent, oldEdge.target is child.
 * When an edge updater is dragged, one endpoint moves to a new node (`otherId`),
 * OR to a different connection point on the same node.
 */
export function determineReconnect(
  canvas: Canvas,
  oldEdge: Edge,
  newConnection: ConnectionLike,
): ReparentResolution | null {
  if (!newConnection.source || !newConnection.target) return null;
  if (newConnection.source === newConnection.target) return null;

  const originalChildId = oldEdge.target;
  const originalParentId = oldEdge.source;

  const originalChild = canvas.nodes.find((n) => n.id === originalChildId);
  const originalParent = canvas.nodes.find((n) => n.id === originalParentId);
  if (!originalChild || !originalParent) return null;

  // Case 1: Reconnecting to the SAME nodes (moving connector end to another side of same node)
  const isSamePair =
    (newConnection.source === originalParentId && newConnection.target === originalChildId) ||
    (newConnection.source === originalChildId && newConnection.target === originalParentId);

  if (isSamePair) {
    const rawSourceSide = handleIdToSide(newConnection.sourceHandle);
    const rawTargetSide = handleIdToSide(newConnection.targetHandle);

    const oldSourceSide = handleIdToSide(oldEdge.sourceHandle) ?? originalChild.sourceSide;
    const oldTargetSide = handleIdToSide(oldEdge.targetHandle) ?? originalChild.targetSide;

    const newParentSide =
      newConnection.source === originalParentId ? rawSourceSide : rawTargetSide;
    const newChildSide =
      newConnection.source === originalParentId ? rawTargetSide : rawSourceSide;

    // Check which end changed
    const sourceChanged = newParentSide !== null && newParentSide !== oldSourceSide;
    const targetChanged = newChildSide !== null && newChildSide !== oldTargetSide;

    if (!sourceChanged && !targetChanged) {
      // Nothing changed at all
      return null;
    }

    return {
      childId: originalChildId,
      parentId: originalParentId,
      sourceSide: newParentSide ?? oldSourceSide ?? 'right',
      targetSide: newChildSide ?? oldTargetSide ?? 'left',
      sourcePinned: sourceChanged ? true : originalChild.sourcePinned ?? false,
      targetPinned: targetChanged ? true : originalChild.targetPinned ?? false,
    };
  }

  // Case 2: Endpoint moved to a different node
  const otherId = [newConnection.source, newConnection.target].find(
    (id) => id !== originalChildId && id !== originalParentId,
  );

  if (!otherId) {
    return null;
  }

  const otherNode = canvas.nodes.find((n) => n.id === otherId);
  if (!otherNode) return null;

  const parentEndMoved =
    (newConnection.target === originalChildId && newConnection.source === otherId) ||
    (newConnection.source === originalChildId && newConnection.target === otherId);

  const childEndMoved =
    (newConnection.target === otherId && newConnection.source === originalParentId) ||
    (newConnection.source === otherId && newConnection.target === originalParentId);

  let newParentId = originalParentId;
  let newChildId = originalChildId;
  let sourcePinned = false;
  let targetPinned = false;

  if (parentEndMoved) {
    if (hasCycle(canvas, originalChildId, otherId)) return null;
    newParentId = otherId;
    newChildId = originalChildId;
    sourcePinned = true;
  } else if (childEndMoved) {
    if (otherNode.parentId === null) {
      // Root cannot be a child
      if (hasCycle(canvas, originalChildId, otherId)) return null;
      newParentId = otherId;
      newChildId = originalChildId;
      sourcePinned = true;
    } else {
      if (hasCycle(canvas, otherId, originalParentId)) return null;
      newParentId = originalParentId;
      newChildId = otherId;
      targetPinned = true;
    }
  } else {
    if (!hasCycle(canvas, originalChildId, otherId)) {
      newParentId = otherId;
      newChildId = originalChildId;
      sourcePinned = true;
    } else if (!hasCycle(canvas, otherId, originalParentId)) {
      newParentId = originalParentId;
      newChildId = otherId;
      targetPinned = true;
    } else {
      return null;
    }
  }

  const newParentNode = canvas.nodes.find((n) => n.id === newParentId)!;
  const newChildNode = canvas.nodes.find((n) => n.id === newChildId)!;
  const facing = computeFacingSides(newParentNode.position, newChildNode.position);

  const rawSourceSide = handleIdToSide(newConnection.sourceHandle);
  const rawTargetSide = handleIdToSide(newConnection.targetHandle);

  const sourceSide: Side =
    newConnection.source === newParentId
      ? rawSourceSide ?? facing.sourceSide
      : rawTargetSide ?? facing.sourceSide;

  const targetSide: Side =
    newConnection.source === newParentId
      ? rawTargetSide ?? facing.targetSide
      : rawSourceSide ?? facing.targetSide;

  return {
    childId: newChildId,
    parentId: newParentId,
    sourceSide,
    targetSide,
    sourcePinned,
    targetPinned,
  };
}
