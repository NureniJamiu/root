# Implementation Plan: Root MVP

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Overview

Implementation is bottom-up so the pure Data Model Layer is provable before any UI exists:

1. Project bootstrap (Vite + React 18 + TypeScript, Tailwind wired to DESIGN.md tokens, Vitest + fast-check + RTL + Playwright, ESLint boundaries).
2. `data/` — types, Zod schema, tree utilities, pure mutators, serialization, Zustand store + `canvasActions`. Property tests (Properties 1–16) are written alongside each unit.
3. `persistence/` — debounced `localStorage` middleware, load path with Zod validation, raw-payload preservation, `beforeunload` flush.
4. `canvas/` — React Flow adapter (min/max zoom, `onlyRenderVisibleElements`, `research` node type, derived edges, drag-end position commit, initial child-position placement).
5. `nodes/` — `NodeCard` + hover toolbar + `typeStyles`, `CollapseBadge`, `NodeEditor` (title/body/images with 2 MB cap/type buttons), `DeletePrompt`.
6. `app/` — shell, empty-canvas affordance, ErrorBoundary, toast surface.
7. Cross-cutting: module-boundary import-graph test, Playwright e2e for the R14 walkthrough, performance bench.

Language: **TypeScript** (per design.md — React 18 + Vite + TypeScript).

## Tasks

- [x] 1. Bootstrap project and toolchain
  - [x] 1.1 Scaffold Vite + React 18 + TypeScript project
    - Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/app/App.tsx` (empty shell)
    - Add scripts: `dev`, `build`, `preview`, `lint`, `test`, `test:run`, `e2e`
    - Add dependencies: `react`, `react-dom`, `zustand`, `reactflow`, `zod`
    - Add dev dependencies: `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`
    - _Requirements: 10.1, 10.2, 10.3, 13.6_

  - [x] 1.2 Configure Tailwind CSS with DESIGN.md tokens
    - Add `tailwindcss`, `postcss`, `autoprefixer` dev deps
    - Create `tailwind.config.ts` encoding: `fontFamily.sans = ['Times', 'serif']`, palette `primary #0051c3`, `secondary #de5052`, `accent #521010`, neutrals `#404040 #000000 #595959 #ffffff #ebebeb`, `borderRadius.xs = '2px'`, `borderRadius.sm = '5px'`, `transitionDuration.DEFAULT = '150ms'`
    - Create `postcss.config.js`, `src/app/index.css` with Tailwind directives and base rule `body { font-family: Times, serif; }`
    - Import `index.css` from `src/main.tsx`
    - _Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8_

  - [x] 1.3 Configure testing toolchain
    - Add dev deps: `vitest`, `@vitest/ui`, `jsdom`, `fast-check`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@playwright/test`
    - Create `vitest.config.ts` (jsdom env, globals, setup file `src/test/setup.ts` importing `@testing-library/jest-dom`)
    - Create `playwright.config.ts` (chromium project, `webServer` running `npm run dev`, baseURL `http://localhost:5173`)
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 1.4 Configure ESLint with module boundaries
    - Add dev deps: `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react`, `eslint-plugin-boundaries` (or use `no-restricted-imports`)
    - Create `.eslintrc.cjs` with rules: `data/` cannot import from `canvas/`, `nodes/`, `reactflow`, `react`; `canvas/` cannot import from `nodes/*` internals; `nodes/` cannot import from `canvas/`
    - Add `lint` script and verify it runs cleanly on empty scaffold
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Data Model Layer — types and schema
  - [x] 2.1 Implement Zod schemas and inferred types
    - Create `src/data/schema.ts` with `nodeTypeSchema`, `positionSchema`, `imageEntrySchema`, `nodeSchema`, `canvasSchema` (with `superRefine` for: unique ids, exactly one root when non-empty, no dangling `parentId`, no cycles)
    - Create `src/data/types.ts` re-exporting `z.infer` types: `NodeType`, `ImageEntry`, `Position`, `Node`, `Canvas`, and a `UUID` alias
    - Create `src/data/ids.ts` (`newId()` wrapping `crypto.randomUUID()`) and `src/data/time.ts` (`now()` returning ISO 8601 string)
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 2.2 Write unit tests for canvasSchema.superRefine
    - Test rejects duplicate ids, missing root when non-empty, multiple roots, dangling `parentId`, cycles
    - Test accepts empty canvas and single-root canvas
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 3. Data Model Layer — tree utilities
  - [x] 3.1 Implement tree utilities
    - Create `src/data/tree.ts` with `childrenIndex`, `visibleNodeIds` (DFS from root, skipping subtrees whose ancestor is collapsed), `descendantCount`, `subtreeIds` (inclusive), `hasCycle(c, childId, newParentId)`, `rootNode`
    - _Requirements: 1.1, 6.2, 6.4, 6.5, 3.5_

  - [x] 3.2 Property test for visibility rule
    - **Property 1: Visibility rule** — for any canvas `c` and node `n`, `n ∈ visibleNodeIds(c)` iff every strict ancestor of `n` has `collapsed === false`
    - **Validates: Requirements 1.1, 6.2, 6.4**
    - Tag: `Feature: root-mvp, Property 1: <text>`; `fc.assert(..., { numRuns: 100 })`
    - _Requirements: 1.1, 6.2, 6.4_

  - [x] 3.3 Property test for descendantCount correctness
    - **Property 11: descendantCount correctness** — `descendantCount(c, id) === subtreeIds(c, id).size - 1`
    - **Validates: Requirements 6.5**
    - _Requirements: 6.5_

  - [x] 3.4 Property test for hasCycle correctness
    - **Property 14: hasCycle correctness** — `hasCycle(c, childId, newParentId) === true` iff `newParentId === childId || newParentId ∈ subtreeIds(c, childId)`
    - **Validates: Requirements 3.5**
    - _Requirements: 3.5_

- [x] 4. Data Model Layer — pure mutators
  - [x] 4.1 Implement mutators
    - Create `src/data/mutators.ts` with `emptyCanvas`, `addRoot`, `addChild` (auto-expands collapsed parent per R3.4), `updateNode`, `addImage` (rejects data URLs > 2 MB by byte length), `removeImage`, `moveNode`, `setCollapsed`, `deleteNodeOnly` (reparents children to deleted node's parent), `deleteSubtree`
    - All mutators are pure, return new `Canvas`, stamp `updatedAt = now()`, and are guarded so invariant-breaking inputs return the input unchanged
    - _Requirements: 2.2, 3.1, 3.4, 3.5, 4.2, 4.3, 4.4, 4.5, 4.6, 5.2, 5.4, 6.1, 6.3, 7.1, 7.3, 7.4_

  - [x] 4.2 Shared fast-check arbitrary `arbCanvas`
    - Create `src/data/__tests__/arbitraries.ts` exporting `arbCanvas`, `arbNodeId(c)`, `arbParentChildPair(c)`, `arbNodeType`, `arbPosition`, `arbImageEntry`
    - `arbCanvas` builds a canvas by applying a random sequence of mutators to `emptyCanvas()`, guaranteeing structural validity and simultaneously exercising Property 15
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 4.3 Property test for addRoot postcondition
    - **Property 3: addRoot postcondition** — for any `Position` `p`, `addRoot(emptyCanvas(), {position: p})` yields a canvas with exactly one node with the required field values and `createdAt === updatedAt`
    - **Validates: Requirements 2.2**
    - _Requirements: 2.2_

  - [x] 4.4 Property test for addChild postcondition
    - **Property 4: addChild postcondition** — child count grows by 1, new node has `parentId`, type `topic`, empty content, `collapsed: false`, position `p`; parent's `collapsed` becomes `false`; result satisfies structural invariants
    - **Validates: Requirements 3.1, 3.4**
    - _Requirements: 3.1, 3.4_

  - [x] 4.5 Property test for updateNode preserves the patch
    - **Property 6: updateNode preserves the patch** — patched fields match, unpatched fields unchanged, `updatedAt` monotonic
    - **Validates: Requirements 4.2, 4.3, 4.6**
    - _Requirements: 4.2, 4.3, 4.6_

  - [x] 4.6 Property test for image add/remove round-trip
    - **Property 7: Image add/remove round-trip** — `removeImage(addImage(c, id, img), id, img.id).nodes[id].images` deep-equals `c.nodes[id].images`
    - **Validates: Requirements 4.4, 4.5**
    - _Requirements: 4.4, 4.5_

  - [x] 4.7 Property test for moveNode isolation
    - **Property 9: moveNode isolation** — target node's `position` updates; every other node's `position` is unchanged
    - **Validates: Requirements 5.2, 5.4**
    - _Requirements: 5.2, 5.4_

  - [x] 4.8 Property test for collapse round-trip
    - **Property 10: Collapse round-trip** — `setCollapsed(setCollapsed(c, id, true), id, false).nodes` deep-equals `c.nodes` modulo `updatedAt`
    - **Validates: Requirements 6.3**
    - _Requirements: 6.3_

  - [x] 4.9 Property test for deleteNodeOnly semantics
    - **Property 12: deleteNodeOnly semantics** — target absent, children reparented to target's parent, other parentIds unchanged, structural invariants hold
    - **Validates: Requirements 7.1, 7.3**
    - _Requirements: 7.1, 7.3_

  - [x] 4.10 Property test for deleteSubtree semantics
    - **Property 13: deleteSubtree semantics** — remaining ids equal `idsOf(c) \ subtreeIds(c, id)`, remaining nodes unchanged, structural invariants hold
    - **Validates: Requirements 7.4**
    - _Requirements: 7.4_

  - [x] 4.11 Property test for structural invariants under all mutator sequences
    - **Property 15: Structural invariants under all mutator sequences** — for any finite mutator sequence applied to `emptyCanvas()`, `canvasSchema.safeParse(c).success === true`
    - **Validates: Requirements 9.1, 9.2**
    - _Requirements: 9.1, 9.2_

  - [x] 4.12 Unit tests for mutator edge cases
    - `deleteNodeOnly` on a leaf equals `deleteSubtree` on the same leaf
    - `addImage` rejects a 2.5 MB data URL and returns the input canvas
    - `addChild` on unknown `parentId` returns the input canvas
    - `deleteNodeOnly` on root-with-children returns the input canvas
    - _Requirements: 4.4, 7.5_

- [x] 5. Data Model Layer — serialization and public surface
  - [x] 5.1 Implement serializeCanvas and parseCanvas
    - Create `src/data/serialize.ts` with `serializeCanvas(c): string` (stable field order) and `parseCanvas(raw): { ok: true; canvas } | { ok: false; error; raw }` using `canvasSchema.safeParse` and JSON try/catch
    - _Requirements: 8.2, 8.3, 8.5, 9.4, 9.5, 9.6_

  - [x] 5.2 Create data barrel `src/data/index.ts`
    - Re-export types, schemas, mutators, tree utilities, `emptyCanvas`, `serializeCanvas`, `parseCanvas`
    - This is the ONLY surface `canvas/`, `nodes/`, `persistence/`, and `app/` may import from `data/`
    - _Requirements: 10.4, 10.5_

  - [x] 5.3 Property test for serialization round-trip
    - **Property 16: Serialization round-trip** — `parseCanvas(serializeCanvas(c))` returns `{ ok: true, canvas: c' }` with `c'` deep-equal to `c`
    - **Validates: Requirements 6.6, 8.2, 8.3, 9.4, 9.5, 9.6, 14.3**
    - _Requirements: 6.6, 8.2, 8.3, 9.4, 9.5, 9.6, 14.3_

  - [x] 5.4 Unit tests for parseCanvas error paths
    - Malformed JSON → `{ ok: false }`
    - Valid JSON failing schema (duplicate ids, missing root, cycle, dangling parentId) → `{ ok: false }` with useful error string
    - _Requirements: 8.5, 9.4_

- [ ] 6. Data Model Layer — Zustand store and actions
  - [-] 6.1 Implement store and typed canvasActions
    - Create `src/data/store.ts` with `CanvasState` (`canvas`, `selection`, `editor`, `deletePrompt`, `viewport`) and `useCanvasStore`
    - Create `canvasActions` object exposing `addRoot`, `addChild`, `updateNode`, `addImage`, `removeImage`, `moveNode`, `setCollapsed`, `deleteNodeOnly`, `deleteSubtree`, `openEditor`, `closeEditor`, `openDeletePrompt`, `closeDeletePrompt`, `select`, `setViewport`
    - Every write invokes a mutator, then `canvasSchema.safeParse`s the result before committing; on failure the write is aborted and a `saveError` event is emitted
    - Re-export `useCanvasStore` and `canvasActions` from `src/data/index.ts`
    - _Requirements: 10.4, 10.5_

  - [~] 6.2 Unit tests for canvasActions dispatch
    - `canvasActions.addChild(parentId, p)` produces a store state with an additional node and a new `editor.openNodeId`
    - `canvasActions.deleteNodeOnly` on root with children is a no-op at the store level
    - _Requirements: 2.4, 3.3, 7.5_

- [ ] 7. Persistence layer
  - [~] 7.1 Implement debounced localStorage middleware and load path
    - Create `src/persistence/keys.ts` (`CANVAS_KEY = 'root-mvp:canvas'`, `RAW_KEY = 'root-mvp:canvas.raw'`)
    - Create `src/persistence/middleware.ts` — subscribes to `useCanvasStore` on `canvas` changes, debounces 500 ms, writes `serializeCanvas(canvas)` to `localStorage`; on `beforeunload`, flushes any pending timeout synchronously; catches `setItem` errors and surfaces via a `persistenceEvents` event bus
    - Create `src/persistence/load.ts` — `loadInitialCanvas()` reads `CANVAS_KEY`; if absent returns `emptyCanvas()`; on `parseCanvas` failure, writes the raw payload to `RAW_KEY`, emits a load error, returns `emptyCanvas()`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 12.3_

  - [~] 7.2 Integration tests for persistence timing
    - With `vi.useFakeTimers()`: fire three `updateNode` actions in rapid succession, advance 499 ms, assert `setItem` not called; advance 1 ms, assert exactly one `setItem` call
    - Fire a change, dispatch `beforeunload`, assert immediate synchronous `setItem`
    - Seed `localStorage` with `"{"`, run `loadInitialCanvas()`, assert `emptyCanvas()` returned, assert `RAW_KEY` contains original string, assert error event emitted
    - _Requirements: 8.1, 8.5, 8.6_

- [~] 8. Checkpoint — pure data core is complete and tested
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Canvas Layer — React Flow adapter
  - [~] 9.1 Implement CanvasView and useReactFlowGraph
    - Create `src/canvas/CanvasView.tsx` wrapping `<ReactFlowProvider>` + `<ReactFlow>` with `minZoom={0.25}`, `maxZoom={2.5}`, `nodesDraggable`, `nodesConnectable={false}`, `elementsSelectable`, `onlyRenderVisibleElements`
    - Register a single custom node type `'research'` that renders the exported `NodeCard` from `nodes/` (referenced via a small `nodeTypes` registration — no import of editor internals)
    - Create `src/canvas/useReactFlowGraph.ts` — subscribes to `useCanvasStore`, computes visible node set via `visibleNodeIds(canvas)`, derives RF `nodes` (mapping to `{ id, type:'research', position, data:{ nodeId } }`) and RF `edges` (derived from `parentId` restricted to visible pairs, `type:'default'`, stroke `#404040`, width 1)
    - Wire `onNodeDragStop` to `canvasActions.moveNode`; wire `onMove` to `canvasActions.setViewport`
    - Create `src/canvas/edgeStyles.ts` and `src/canvas/index.ts` exporting only `CanvasView`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.2, 5.3, 5.4, 12.2_

  - [~] 9.2 Implement initial child position placement
    - Create `src/canvas/placement.ts` with `computeChildPosition(canvas, parentId)` returning a `Position` offset from the parent such that the child's bounding box (at standard node width/height constants) does not intersect the parent's bounding box or any existing direct sibling's bounding box
    - Call site: `App`/toolbar action that dispatches `canvasActions.addChild` computes position from the current canvas before dispatching
    - _Requirements: 3.2_

  - [~] 9.3 Property test for initial child position non-overlap
    - **Property 5: Initial child position non-overlap** — for any canvas `c` and parent `p`, the child bounding box produced by `computeChildPosition(c, p.id)` does not intersect the parent's bbox nor any existing direct child's bbox
    - **Validates: Requirements 3.2**
    - _Requirements: 3.2_

  - [~] 9.4 Property test for edge derivation from parentId
    - **Property 2: Edge derivation from parentId** — the RF edge set produced by `useReactFlowGraph` equals `{ (p, k) | p, k ∈ visibleNodeIds(c) ∧ k.parentId === p.id }`, contains no duplicates, and contains no edges incident to hidden nodes
    - **Validates: Requirements 1.5**
    - Test `useReactFlowGraph` selector output directly (no React Flow render required)
    - _Requirements: 1.5_

  - [~] 9.5 Component test for React Flow config
    - Render `CanvasView`, assert `minZoom`, `maxZoom`, `onlyRenderVisibleElements` props via a test-only prop probe
    - _Requirements: 1.4, 12.2_

- [ ] 10. Node UI Layer — styles and card
  - [~] 10.1 Implement typeStyles and NodeCard shell
    - Create `src/nodes/typeStyles.ts` with the four `NodeType` → `{ border, background, text }` pairings from design.md §Data Models (topic/finding/question/conclusion), all colors drawn from the DESIGN.md palette
    - Create `src/nodes/NodeCard.tsx` — reads its node from `useCanvasStore` via memoized selector by `nodeId`, applies `typeStyles[node.type]`, renders `Header` (title text), `BodyPreview` (first N chars of body), `ImageThumbStrip` (thumbnails), `CollapseBadge` (only when collapsed), `HoverToolbar` (buttons for add-child, edit, add-image, cycle-type, delete)
    - Selection style: `border: 2px solid #0051c3` when selected; base border 1 px in type color; radius 5 px; no shadow
    - Create `src/nodes/ImageThumbStrip.tsx`, `src/nodes/CollapseBadge.tsx` (shows `descendantCount(canvas, id)`), `src/nodes/HoverToolbar.tsx`
    - Create `src/nodes/index.ts` exporting `NodeCard`, `NodeEditor`, `DeletePrompt`
    - _Requirements: 4.7, 6.5, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

  - [~] 10.2 Property test for typeStyles palette conformance
    - **Property 8: typeStyles palette conformance** — for every `NodeType t`, `typeStyles[t]` returns colors drawn from the DESIGN.md palette, and the four returned pairings are pairwise distinct
    - **Validates: Requirements 4.7**
    - _Requirements: 4.7, 11.3, 11.4_

  - [~] 10.3 Component test for NodeCard type rendering
    - Render `NodeCard` for each of the four types, snapshot the resulting class list, assert only palette-token classes appear
    - Render a collapsed node with N descendants, assert `CollapseBadge` shows N
    - _Requirements: 4.7, 6.5, 11.3, 11.4_

- [ ] 11. Node UI Layer — editor
  - [~] 11.1 Implement NodeEditor
    - Create `src/nodes/NodeEditor.tsx` — bound to `nodeId`; renders single-line `<input>` for title (`maxLength=200`, autoFocus), `<textarea>` for body (`maxLength=20000`, character counter turning `#de5052` in the last 200 chars), 4 type buttons (`topic | finding | question | conclusion`) styled per `typeStyles`, image drop zone + paste handler + file picker
    - Image handler: `FileReader.readAsDataURL`, rejects payloads > 2 MB with inline message "Images must be under 2 MB.", ignores non-image files (drop zone border flashes once), on success dispatches `canvasActions.addImage`
    - Text changes dispatch `canvasActions.updateNode({title})` / `({body})`; type button dispatches `updateNode({type})`; image delete dispatches `removeImage`
    - Close via Esc or click-away → `canvasActions.closeEditor()`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [~] 11.2 Component tests for NodeEditor
    - Renders with title field focused when opened (covers R2.4 / R3.3 focus behavior)
    - Typing title dispatches `updateNode({title})`
    - Dropping a 2.5 MB image is rejected with an inline message; canvas unchanged
    - Clicking each type button updates `node.type`
    - _Requirements: 2.4, 3.3, 4.1, 4.2, 4.3, 4.4, 4.6_

- [ ] 12. Node UI Layer — delete prompt
  - [~] 12.1 Implement DeletePrompt modal
    - Create `src/nodes/DeletePrompt.tsx` — reads target node from store; if node has zero children the modal is bypassed and delete happens immediately; otherwise renders two options: "Delete node only" and "Delete node and entire subtree"
    - Root-with-children constraint: when `node.parentId === null` and node has children, disable "Delete node only" (R7.5)
    - Cancel → `canvasActions.closeDeletePrompt()` leaves canvas unchanged; confirm → dispatches `deleteNodeOnly` or `deleteSubtree`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [~] 12.2 Component tests for DeletePrompt variants
    - Delete on leaf: no modal rendered, node removed immediately
    - Delete on parent: both options rendered; selecting "nodeOnly" reparents children; selecting "subtree" removes descendants
    - Delete on root with children: only subtree option enabled
    - Cancel: canvas snapshot unchanged
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 13. App shell
  - [~] 13.1 Implement App shell, toolbar, empty-canvas affordance, ErrorBoundary, toast surface
    - Create `src/app/ErrorBoundary.tsx` (class component) — catches render/effect errors, renders "Something went wrong. Your work has been saved." with a Reload button
    - Create `src/app/Toast.tsx` — minimal toast surface subscribed to `persistenceEvents` (load error, save error, image-too-large echo)
    - Create `src/app/Toolbar.tsx` — top chrome, shows canvas title
    - Create `src/app/CreateRootAffordance.tsx` — visible when `canvas.nodes.length === 0`; on activate calls `canvasActions.addRoot(viewportCenter)` and opens the editor with focus on title
    - Update `src/app/App.tsx` to: call `loadInitialCanvas()` on mount, install persistence middleware, wrap `<CanvasView />` + modals in `<ErrorBoundary>`, render `<Toast />`, render `<CreateRootAffordance />` when canvas is empty, render `<NodeEditor />` when `editor.openNodeId` is set, render `<DeletePrompt />` when `deletePrompt.nodeId` is set
    - _Requirements: 2.1, 2.3, 2.4, 8.4, 8.5_

  - [~] 13.2 Integration tests for App shell
    - Empty canvas: create-root affordance visible; after `addRoot`, affordance hidden and editor open with title focused (R2.1, R2.3, R2.4)
    - Load error surface: seed `localStorage` with `"{"`, mount `<App />`, assert error toast rendered and `RAW_KEY` preserved (R8.5)
    - _Requirements: 2.1, 2.3, 2.4, 8.4, 8.5_

- [ ] 14. Module-boundary import-graph test
  - [~] 14.1 Implement runtime import-graph test
    - Create `src/__tests__/module-boundaries.test.ts` — walks `src/` using `es-module-lexer` (or `@typescript-eslint/parser`) and asserts: no file under `src/data/` imports from `src/canvas/`, `src/nodes/`, `reactflow`, or `react`; no file under `src/canvas/` imports from `src/nodes/*` except the public `NodeCard` re-export; no file under `src/nodes/` imports from `src/canvas/`
    - This test guards against ESLint config drift
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 15. End-to-end Playwright tests (R14 walkthrough)
  - [~] 15.1 E2E: MVP walkthrough (build tree)
    - Create `e2e/mvp-walkthrough.spec.ts` — start with empty `localStorage`; click "Create root"; edit title and body; add a child, then a grandchild; edit each; drop an image into one node; assert final DOM shows all node cards with correct type styling and connectors between the correct pairs
    - _Requirements: 14.1_

  - [~] 15.2 E2E: Collapse and expand a subtree
    - Create `e2e/collapse-expand.spec.ts` — build a three-level tree; collapse the middle node; assert all descendants absent from the DOM and their connectors gone; expand; assert all descendants restored
    - _Requirements: 6.2, 6.4, 14.2_

  - [~] 15.3 E2E: Reload preserves state exactly
    - Create `e2e/reload-restore.spec.ts` — build the R14.1 tree; reload the page; assert every node's rendered title, body, image, type, position, and collapse state matches pre-reload state
    - _Requirements: 8.3, 14.3_

- [~] 16. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP. Property tests, unit tests, integration tests, and the module-boundary import-graph test are all optional in this sense — core implementation tasks (unstarred) never are.
- Each task references the specific sub-requirement clauses it satisfies for traceability.
- All 16 correctness properties from design.md are implemented as sub-tasks placed close to the code they validate; each uses `fast-check` with `numRuns: 100` and is tagged `Feature: root-mvp, Property N: <text>`.
- Property tests validate universal correctness across the input space; unit and integration tests pin down specific interactions, timing, and configuration.
- Testing pyramid: property tests over pure data core → unit tests for edge cases → component/integration tests → module-boundary test → Playwright e2e for R14.
- Language is TypeScript (per design.md — React 18 + Vite + TypeScript). No language choice is required.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1", "5.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "4.1", "5.4"] },
    { "id": 5, "tasks": ["4.2", "4.12", "5.2"] },
    { "id": 6, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "5.3", "6.1"] },
    { "id": 7, "tasks": ["6.2", "7.1", "10.1"] },
    { "id": 8, "tasks": ["7.2", "9.1", "9.2", "10.2", "10.3", "11.1", "12.1"] },
    { "id": 9, "tasks": ["9.3", "9.4", "9.5", "11.2", "12.2", "13.1"] },
    { "id": 10, "tasks": ["13.2", "14.1", "15.1", "15.2", "15.3"] }
  ]
}
```

## Workflow Completion

This workflow is complete once the artifacts above have been created. Implementation has not started.

To begin executing tasks:
- Open `.kiro/specs/root-mvp/tasks.md`
- Click "Start task" next to task items
