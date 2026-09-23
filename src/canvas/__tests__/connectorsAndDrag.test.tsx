import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCanvas, addRoot, addChild, updateNode } from '../../data/mutators';
import { useCanvasStore } from '../../data/store';
import { deriveReactFlowGraph } from '../useReactFlowGraph';
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

describe('Connectors and Dragging Specifications', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      canvas: emptyCanvas(),
      selection: { nodeId: null },
      editor: { openNodeId: null },
      deletePrompt: { nodeId: null },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  describe('deriveReactFlowGraph connector styles', () => {
    it('applies dashed blue style for dragging target node, solid blue for selected, dashed gray for question, and solid gray for standard', () => {
      let canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
      const rootId = canvas.nodes[0]!.id;

      // Child 1: Question node
      canvas = addChild(canvas, rootId, { position: { x: 300, y: 0 } });
      const qId = canvas.nodes[1]!.id;
      canvas = updateNode(canvas, qId, { type: 'question' });

      // Child 2: Finding node
      canvas = addChild(canvas, rootId, { position: { x: 300, y: 100 } });
      const fId = canvas.nodes[2]!.id;
      canvas = updateNode(canvas, fId, { type: 'finding' });

      // Child 3: Conclusion node
      canvas = addChild(canvas, rootId, { position: { x: 300, y: 200 } });
      const cId = canvas.nodes[3]!.id;
      canvas = updateNode(canvas, cId, { type: 'conclusion' });

      // Case 1: Question node unselected
      const graphNormal = deriveReactFlowGraph(canvas);
      const qEdge = graphNormal.edges.find((e) => e.target === qId);
      expect(qEdge?.style?.stroke).toBe('#737785');
      expect(qEdge?.style?.strokeDasharray).toBe('4 4');

      const cEdge = graphNormal.edges.find((e) => e.target === cId);
      expect(cEdge?.style?.stroke).toBe('#737785');
      expect(cEdge?.style?.strokeDasharray).toBeUndefined();

      // Case 2: Selected finding node
      const graphSelected = deriveReactFlowGraph(canvas, { selectedNodeId: fId });
      const fEdge = graphSelected.edges.find((e) => e.target === fId);
      expect(fEdge?.style?.stroke).toBe('#0051c3');
      expect(fEdge?.style?.strokeDasharray).toBeUndefined();

      // Case 3: Dragging finding node
      const graphDragging = deriveReactFlowGraph(canvas, { draggingNodeId: fId });
      const fDraggingEdge = graphDragging.edges.find((e) => e.target === fId);
      expect(fDraggingEdge?.style?.stroke).toBe('#0051c3');
      expect(fDraggingEdge?.style?.strokeDasharray).toBe('5 4');
    });
  });

  describe('NodeCard Handle orientation and Dragging states', () => {
    it('mounts incoming handle on Left and outgoing handle on Right for horizontal tree', () => {
      const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
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

      expect(screen.getByTestId('handle-target-left')).toBeInTheDocument();
      expect(screen.getByTestId('handle-source-right')).toBeInTheDocument();
    });

    it('renders DRAGGING ACTIVE badge and delta tooltip when data.isDragging is true', () => {
      const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
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

      expect(screen.getByText('DRAGGING ACTIVE')).toBeInTheDocument();
      expect(screen.getByText(/dx:\s*\+85px,\s*dy:\s*-40px/)).toBeInTheDocument();
      expect(screen.getByText('Grid [Grid 20px]')).toBeInTheDocument();
    });
  });

  describe('NodeInspectorRail classification switching and live drag telemetry', () => {
    it('allows one-click classification type switching', () => {
      const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
      const rootId = canvas.nodes[0]!.id;
      useCanvasStore.setState({
        canvas,
        selection: { nodeId: rootId },
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

    it('displays live coordinates, delta, and 20px snapping telemetry when dragging', () => {
      const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
      const rootId = canvas.nodes[0]!.id;
      useCanvasStore.setState({
        canvas,
        selection: { nodeId: rootId },
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
      expect(screen.getByText('20px Grid')).toBeInTheDocument();
      expect(screen.getByText('Repositioning Active...')).toBeInTheDocument();
    });
  });
});
