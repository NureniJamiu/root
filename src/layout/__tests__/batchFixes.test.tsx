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
    expect(newProjectBtn.className).toContain('bg-accent');

    fireEvent.click(newProjectBtn);
    expect(handleNewProject).toHaveBeenCalledTimes(1);

    const project2Item = screen.getByTestId('project-item-p2');
    fireEvent.click(project2Item);
    expect(handleSelectProject).toHaveBeenCalledWith('p2');
  });

  it('Projects rail footer shows sign out above the signed-in profile, and delete asks for confirmation', () => {
    const handleSignOut = vi.fn();
    const handleDelete = vi.fn();

    render(
      <StructuralIndexRail
        nodeCount={0}
        projects={[{ id: 'p1', title: 'Biology Research', nodeCount: 3 }]}
        activeProjectId="p1"
        onDeleteProject={handleDelete}
        user={{ name: 'Ada Lovelace', email: 'ada@example.com' }}
        onSignOut={handleSignOut}
      />
    );

    const signOut = screen.getByTestId('btn-sign-out');
    const profile = screen.getByTestId('rail-user-profile');
    expect(profile).toHaveTextContent('Ada Lovelace');
    expect(profile).toHaveTextContent('ada@example.com');
    expect(profile).toHaveTextContent('AL');
    // Profile sits beneath the sign out button
    expect(signOut.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(signOut);
    expect(handleSignOut).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('btn-delete-project-p1'));
    expect(handleDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('btn-confirm-delete-project-p1'));
    expect(handleDelete).toHaveBeenCalledWith('p1');
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

  it('AppHeader shows sidebar toggle + logo only while collapsed, and toggles the inspector', () => {
    const onToggleSidebar = vi.fn();
    const onToggleInspector = vi.fn();
    const onSelectTypeFilter = vi.fn();
    const onAddNode = vi.fn();

    const { rerender } = render(
      <AppHeader
        title="My Canvas"
        nodeCount={5}
        connectionCount={2}
        onAddNode={onAddNode}
        isSidebarOpen={true}
        onToggleSidebar={onToggleSidebar}
        isInspectorOpen={true}
        onToggleInspector={onToggleInspector}
        activeTypeFilter={null}
        onSelectTypeFilter={onSelectTypeFilter}
      />
    );

    // Sidebar open: the logo and expand toggle live in the sidebar, not the header
    expect(screen.queryByTestId('btn-toggle-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Root')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('btn-toggle-inspector'));
    expect(onToggleInspector).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('type-filter-select'), { target: { value: 'question' } });
    expect(onSelectTypeFilter).toHaveBeenCalledWith('question');

    fireEvent.click(screen.getByTestId('btn-add-idea'));
    expect(onAddNode).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('btn-guide'));
    expect(screen.getByTestId('guide-popover')).toBeInTheDocument();

    // Viewport controls no longer live in the header
    expect(screen.queryByTestId('btn-fit')).not.toBeInTheDocument();

    rerender(
      <AppHeader
        title="My Canvas"
        nodeCount={5}
        connectionCount={2}
        onAddNode={onAddNode}
        isSidebarOpen={false}
        onToggleSidebar={onToggleSidebar}
        isInspectorOpen={false}
        onToggleInspector={onToggleInspector}
      />
    );
    expect(screen.getByLabelText('Root')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-toggle-sidebar'));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('CanvasView toolbar is the single home for pan, zoom, fit, root and auto layout', () => {
    const onTogglePan = vi.fn();
    useCanvasStore.setState({
      canvas: emptyCanvas(),
      selection: { nodeId: null, edgeId: null },
      editor: { openNodeId: null },
      deletePrompt: { nodeId: null },
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    render(<CanvasView isPanActive={false} onTogglePan={onTogglePan} />);

    for (const id of ['btn-zoom-in', 'btn-zoom-out', 'btn-fit', 'btn-root', 'btn-auto-layout']) {
      expect(screen.getAllByTestId(id)).toHaveLength(1);
    }
    fireEvent.click(screen.getByTestId('btn-pan'));
    expect(onTogglePan).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('btn-pan')).toHaveAttribute('aria-pressed', 'false');
  });

  it('CanvasView does not contain any coordinate labels (COORD:)', () => {
    useCanvasStore.setState({
      canvas: emptyCanvas(),
      selection: { nodeId: null, edgeId: null },
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
