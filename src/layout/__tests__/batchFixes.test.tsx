import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../AppHeader';
import { StructuralIndexRail } from '../StructuralIndexRail';
import { NodeInspectorRail } from '../NodeInspectorRail';
import { CanvasView } from '../../canvas/CanvasView';
import { useCanvasStore, emptyCanvas } from '../../data';

// Mock reactflow styles
vi.mock('reactflow/dist/style.css', () => ({}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('Batch Fixes Verification', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
  });
  it('Projects rail (formerly StructuralIndexRail) renders Projects header, close button, and blue New Project button', () => {
    const handleClose = vi.fn();
    const handleNewProject = vi.fn();
    const handleSelectProject = vi.fn();

    render(
      <StructuralIndexRail
        nodeCount={3}
        onClose={handleClose}
        onNewProject={handleNewProject}
        onSelectProject={handleSelectProject}
        projects={[
          { id: 'p1', title: 'Biology Research', nodeCount: 3 },
          { id: 'p2', title: 'Cognitive Science', nodeCount: 0 },
        ]}
        activeProjectId="p1"
      />
    );

    expect(screen.getByText('Projects')).toBeInTheDocument();

    const closeBtn = screen.getByTestId('btn-close-projects');
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    const newProjectBtn = screen.getByTestId('btn-new-project');
    expect(newProjectBtn).toBeInTheDocument();
    // Verify blue background styling
    expect(newProjectBtn.className).toContain('bg-[#0051c3]');

    fireEvent.click(newProjectBtn);
    expect(handleNewProject).toHaveBeenCalledTimes(1);

    const project2Item = screen.getByTestId('project-item-p2');
    fireEvent.click(project2Item);
    expect(handleSelectProject).toHaveBeenCalledWith('p2');
  });

  it('NodeInspectorRail renders close button and calls onClose to slide right', () => {
    const handleClose = vi.fn();

    render(
      <NodeInspectorRail
        onClose={handleClose}
      />
    );

    expect(screen.getByText('Node Inspector')).toBeInTheDocument();
    const closeBtn = screen.getByTestId('btn-close-inspector');
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('AppHeader renders RootLogo, sidebar toggle, inspector toggle, and functional Pan/Fit/Root buttons', () => {
    const onTogglePan = vi.fn();
    const onToggleSidebar = vi.fn();
    const onToggleInspector = vi.fn();
    const onFitView = vi.fn();
    const onCenterRoot = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();

    const { rerender } = render(
      <AppHeader
        title="My Canvas"
        nodeCount={5}
        branchCount={2}
        zoomPercent={120}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitView={onFitView}
        onCenterRoot={onCenterRoot}
        onAddNode={vi.fn()}
        isPanActive={false}
        onTogglePan={onTogglePan}
        isSidebarOpen={true}
        onToggleSidebar={onToggleSidebar}
        isInspectorOpen={true}
        onToggleInspector={onToggleInspector}
      />
    );

    // RootLogo has aria-label="Root"
    expect(screen.getByLabelText('Root')).toBeInTheDocument();

    // Verify Pan button
    const panBtn = screen.getByTestId('btn-pan');
    expect(panBtn).toHaveTextContent('Pan');
    fireEvent.click(panBtn);
    expect(onTogglePan).toHaveBeenCalledTimes(1);

    // Verify Fit and Root
    const fitBtn = screen.getByTestId('btn-fit');
    fireEvent.click(fitBtn);
    expect(onFitView).toHaveBeenCalledTimes(1);

    const rootBtn = screen.getByTestId('btn-root');
    fireEvent.click(rootBtn);
    expect(onCenterRoot).toHaveBeenCalledTimes(1);

    // Verify Sidebar & Inspector toggle buttons
    const sidebarToggle = screen.getByTestId('btn-toggle-sidebar');
    fireEvent.click(sidebarToggle);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);

    const inspectorToggle = screen.getByTestId('btn-toggle-inspector');
    fireEvent.click(inspectorToggle);
    expect(onToggleInspector).toHaveBeenCalledTimes(1);

    // Verify active Pan state
    rerender(
      <AppHeader
        title="My Canvas"
        nodeCount={5}
        branchCount={2}
        zoomPercent={120}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFitView={onFitView}
        onCenterRoot={onCenterRoot}
        onAddNode={vi.fn()}
        isPanActive={true}
        onTogglePan={onTogglePan}
        isSidebarOpen={true}
        onToggleSidebar={onToggleSidebar}
        isInspectorOpen={true}
        onToggleInspector={onToggleInspector}
      />
    );
    expect(screen.getByTestId('btn-pan')).toHaveTextContent('Panning');
  });

  it('CanvasView does not contain any coordinate labels (COORD:)', () => {
    useCanvasStore.setState({
      canvas: emptyCanvas(),
      selection: { nodeId: null },
      editor: { openNodeId: null },
      deletePrompt: { nodeId: null },
      viewport: { x: 123.4, y: 567.8, zoom: 1.5 },
    });

    const { container } = render(<CanvasView />);

    // Must not contain any COORD: text
    expect(container.textContent).not.toContain('COORD:');
    expect(container.textContent).not.toContain('Cartesian Orthographic');
  });
});
