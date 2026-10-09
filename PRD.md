# Product Requirements Document: Root (MVP)

## 1. Overview

**Product name (working):** Root
**Owner:** Jamiu
**Purpose:** A canvas-based, node-driven tool for conducting and presenting non-linear research. Instead of writing linear notes, the user creates connected nodes (a tree/graph structure) to branch findings from a central topic, capture supporting evidence, and later walk others through their reasoning visually.

**MVP philosophy:** Manual-only. No AI generation in v1. The data model must be simple and structured enough that an AI-generation feature can be added later without re-architecting (see Section 8).

## 2. Problem Statement

Linear note-taking (docs, plain text) doesn't reflect how research actually branches. The user wants to:
- Start from a root topic and branch into sub-findings as they emerge.
- Visually see how ideas connect.
- Use the same structure to present/walk through their reasoning later (e.g. screen-sharing).

## 3. MVP Goals

- Ship something that **works end-to-end** and looks **polished**, not a rough prototype.
- Support the core loop: create root node → branch child nodes → edit content → arrange visually → present.
- Keep the node data model AI-generation-ready from day one.

**Explicitly out of scope for MVP:**
- AI/LLM prompt-to-node generation
- Multi-user collaboration / real-time sync
- Real-time sync between devices or users (accounts and server-side saving are in: see 6.5)
- Mobile responsiveness (desktop-first)
- Export (PDF/image export) — nice-to-have, not MVP

## 4. Core User Flow

1. User signs in and opens the app to an empty canvas (or their last saved project).
2. User creates a root node (e.g. "Bones").
3. User clicks the node, hits the `+` control, adds a child node (e.g. "Organic minerals").
4. User repeats, building a tree outward in any direction.
5. User edits node content: title, body text, optional image(s).
6. User freely drags nodes to reposition, pans and zooms the canvas.
7. User collapses/expands a node's children via a toggle to declutter or focus during presentation.
8. Canvas state is saved automatically to the user's account so they can return later, from any browser.

## 5. Data Model

This is the contract the rest of the app is built around. Keep it flat and serializable (JSON) so it can later be produced by an AI step instead of manual clicks.

```
Node {
  id: string (uuid)
  parentId: string | null        // null = root node
  title: string
  body: string                   // plain text or lightweight rich text (MVP: plain text / basic markdown)
  images: string[]                // image URLs or base64 data URIs (MVP: local/in-memory)
  type: enum ["topic", "finding", "question", "conclusion"]  // drives node color/style
  position: { x: number, y: number }
  collapsed: boolean
  createdAt: timestamp
  updatedAt: timestamp
}

Canvas {
  id: string
  title: string
  nodes: Node[]
  updatedAt: timestamp
}
```

Notes for the dev agent:
- `type` is a simple enum for MVP — drives a color/accent on the node card. Don't over-build a tagging system yet.
- `parentId` (not an edges array) is sufficient for MVP since this is a tree, not a general graph. Multi-parent linking is a possible v2 feature, not MVP — but don't hard-code single-parent assumptions so deeply that it's painful to relax later.
- Connector lines between nodes are *derived* from `parentId` + `position`, not stored separately.

## 6. Functional Requirements (MVP)

### 6.1 Canvas
- Infinite (or very large bounded) pannable, zoomable canvas.
- Smooth zoom in/out (scroll wheel or pinch) and pan (click-drag on empty canvas / spacebar-drag).
- Visual connector lines (curved or elbow) from each node to its `parentId`, updating live as nodes are dragged.

### 6.2 Node creation & editing
- Create a root node when canvas is empty (e.g. "+ New Topic" button).
- Each node shows a small hover/select toolbar with:
  - `+` button → adds a child node attached to this node (auto-positioned nearby, user can drag after).
  - Edit affordance → inline-edit title and body text directly on the node.
  - Image upload → drag-and-drop or file picker, image renders inside the node.
  - Delete → removes node and prompts on children (see 6.4).
- Node body text supports basic formatting at minimum (bold/italic or basic markdown) — full rich text editor is not MVP.

### 6.3 Node collapse/expand (the "button" the user described)
- Each node with children shows a toggle control.
- Toggling hides/shows all descendant nodes and their connectors (not just direct children — collapsing a branch collapses the whole subtree).
- Collapsed state is part of node data and persists.

### 6.4 Deletion behavior
- Deleting a node with children must prompt: delete just this node (re-parent children to its parent) or delete this node and its whole subtree. Pick one sane default behavior and confirm with the user — don't silently orphan nodes.

### 6.5 Persistence
- Each signed-in user has their own projects, stored in SQLite behind the `/api/projects` API (the server validates every canvas with the same schema as the client).
- Auto-save the canvas on every change, debounced, through a sequenced save queue: one request at a time, latest state wins, retried on failure, flushed when switching projects or leaving the page. The UI shows whether the project is saved, saving, or not saved.
- A project becomes active only together with its own loaded canvas; nothing is saved before a project has loaded.
- Images are stored separately from the canvas document and referenced by id, so an edit does not re-upload them.
- Reload restores exact node positions, content, and collapsed states.
- `localStorage` holds UI preferences only (pane open/closed, last active project); it never holds canvas content.

### 6.6 Visual design
- This is a stated priority: the node cards, canvas background, connectors, and controls need a deliberate, cohesive visual design — not default/unstyled UI. Establish a small design system early (spacing, type scale, color palette per node `type`, shadow/elevation for selected nodes) rather than styling ad hoc per component.

## 7. Non-Functional Requirements

- Performance: canvas should stay smooth with at least 100–150 nodes on screen (pan/zoom/drag should not visibly lag).
- A small Express + SQLite API handles accounts (Better Auth) and projects; the React app talks to it on the same origin (the Vite dev proxy forwards `/api`).
- Codebase should cleanly separate: (a) node data model / state management, (b) canvas rendering/interaction layer, (c) node UI components — so a future AI-generation feature can plug into (a) without touching (b)/(c).

## 8. Future Extensions (not MVP, but the architecture should not block these)

- **AI generation:** prompt in a topic → AI returns a `Node[]` tree (same schema as above) → rendered on canvas exactly like manually-created nodes.
- **Presentation/walkthrough mode:** a guided sequential view that steps through nodes for screen-sharing, reusing the existing collapse/expand and positions.
- **Export:** PDF/PNG export of the canvas, or export to a shareable read-only link.
- **Citations/sources panel:** structured source/reference field per node, beyond a plain text mention.
- **Sharing and real-time collaboration:** accounts and server-side persistence exist; sharing a project with other people does not.

## 9. Suggested Tech Direction (non-binding)

Left flexible for the dev agent to decide based on constraints, but as a reference:
- Frontend: React + a canvas/graph interaction library (e.g. React Flow) rather than hand-rolled drag/zoom/pan logic, to move fast on the MVP.
- State: a Zustand store holds the open canvas; the server is the source of truth for saved projects.
- Styling: a utility CSS framework (e.g. Tailwind) paired with a deliberate design pass per Section 6.6 — avoid shipping default component-library looks.

## 10. Success Criteria for MVP

- User can go from an empty canvas to a multi-branch tree (root + at least 2 levels of children) with text and at least one image, entirely through the UI, with no data loss on reload.
- Collapse/expand works correctly on nested branches.
- The visual result looks intentionally designed, not like a generic diagramming tool default.