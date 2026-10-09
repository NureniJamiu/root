import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCanvas, addNode } from '../../data/mutators';
import { useCanvasStore } from '../../data/store';
import { NodeInspectorRail } from '../../layout/NodeInspectorRail';
import { NodeCard } from '../../nodes';
import type { NodeCardData } from '../../nodes';

// Mock reactflow
vi.mock('reactflow', () => {
  const Position: Record<string, string> = {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  };

  function Handle({ position, type }: { position: string; type: string }) {
    return <div data-testid={`handle-${type}-${position}`} />;
  }

  return {
    Handle,
    Position,
    applyNodeChanges: (_changes: unknown[], nodes: unknown[]) => nodes,
  };
});

describe('Card handles, dragging badge and inspector telemetry', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      canvas: emptyCanvas(),
      selection: { nodeId: null, edgeId: null },
      editor: { openNodeId: null },
      deletePrompt: { nodeId: null },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  describe('NodeCard Handle orientation and Dragging states', () => {
    it('mounts a source and a target handle on every side so connectors can attach anywhere', () => {
      const canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
      const rootId = canvas.nodes[0]!.id;
      useCanvasStore.setState({ canvas });

      const data: NodeCardData = { nodeId: rootId };
      // Cast through unknown to satisfy NodeProps
      render(
        <NodeCard
          id={rootId}
          data={data}
          selected={false}
          type="research"
          zIndex={0}
          isConnectable={false}
          xPos={0}
          yPos={0}
          dragging={false}
        />
      );

      for (const side of ['top', 'right', 'bottom', 'left']) {
        expect(screen.getByTestId(`handle-target-${side}`)).toBeInTheDocument();
        expect(screen.getByTestId(`handle-source-${side}`)).toBeInTheDocument();
      }
    });

    it('renders the delta badge (and no status pill) when data.isDragging is true', () => {
      const canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
      const rootId = canvas.nodes[0]!.id;
      useCanvasStore.setState({ canvas });

      const data: NodeCardData = {
        nodeId: rootId,
        isDragging: true,
        dx: 85,
        dy: -40,
      };

      render(
        <NodeCard
          id={rootId}
          data={data}
          selected={false}
          type="research"
          zIndex={0}
          isConnectable={false}
          xPos={0}
          yPos={0}
          dragging={true}
        />
      );

      expect(screen.getByText(/dx:\s*\+85px,\s*dy:\s*-40px/)).toBeInTheDocument();
      expect(screen.getByText('Shift snaps')).toBeInTheDocument();
      // The border carries the state; there are no SELECTED / DRAGGING pills.
      expect(screen.queryByText('DRAGGING ACTIVE')).not.toBeInTheDocument();
      expect(screen.queryByText('SELECTED')).not.toBeInTheDocument();
    });
  });

  describe('NodeInspectorRail classification switching and live drag telemetry', () => {
    it('allows one-click classification type switching', () => {
      const canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
      const rootId = canvas.nodes[0]!.id;
      useCanvasStore.setState({
        canvas,
        selection: { nodeId: rootId, edgeId: null },
      });

      render(<NodeInspectorRail />);

      // Switch to finding
      const findingBtn = screen.getByRole('button', { name: 'Finding' });
      fireEvent.click(findingBtn);

      expect(useCanvasStore.getState().canvas.nodes[0]!.type).toBe('finding');

      // Switch to question
      const questionBtn = screen.getByRole('button', { name: 'Question' });
      fireEvent.click(questionBtn);

      expect(useCanvasStore.getState().canvas.nodes[0]!.type).toBe('question');
    });

    it('displays live coordinates, delta and snapping telemetry when dragging', () => {
      const canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
      const rootId = canvas.nodes[0]!.id;
      useCanvasStore.setState({
        canvas,
        selection: { nodeId: rootId, edgeId: null },
      });

      const dragInfo = {
        nodeId: rootId,
        startX: 450,
        startY: 210,
        currentX: 535,
        currentY: 170,
        dx: 85,
        dy: -40,
      };

      render(<NodeInspectorRail dragInfo={dragInfo} />);

      expect(screen.getByText('X: 535 Y: 170')).toBeInTheDocument();
      expect(screen.getByText('+85 / -40')).toBeInTheDocument();
      expect(screen.getByText('Off (hold Shift)')).toBeInTheDocument();
      expect(screen.getByText(/Moving idea/)).toBeInTheDocument();
    });
  });
});
