# Root Dashboard & Canvas Audit

_Date: 2026-10-09. Scope: the signed-in workbench (`/dashboard`): shell, canvas, node cards, inspector, editor, persistence, and the projects API._

Each finding names the file, the evidence and a suggested fix. Severity:

- **P0**: loses or corrupts user data
- **P1**: a feature that is visibly broken or misleading
- **P2**: correctness or maintainability debt
- **P3**: polish

---

## 0. What changed in this pass (UI shell)

These are already done and are not counted as open findings below.

| Before | After |
|---|---|
| Zoom / Fit / Root / Auto Layout appeared **three times**: header, canvas ribbon, bottom-right HUD | One floating canvas toolbar (bottom-center): Select/Pan mode, zoom −/%/+ (click % to reset to 100%), Fit, Center on main idea, Tidy layout. [CanvasView.tsx](src/canvas/CanvasView.tsx) |
| The sidebar toggle was in the header, and a second "open" button floated over the canvas | The sidebar collapses from its own top row. When it is collapsed, the expand toggle and logo appear at the far left of the header |
| The inspector toggle was in the middle of the header's right cluster. A floating "open" button covered the canvas ribbon (it clipped "Auto Layout"), and the inspector had a third close button inside it | One toggle at the far right of the header, directly above the inspector |
| The avatar and "Sign out" sat in the header; the sidebar footer showed "1 project saved" | The sidebar footer has **Sign out**, with the user profile beneath it (initials avatar, name, email) |
| Sidebar rows used index numbers ("01.") and a badge chip | Rows show title, idea count and relative "updated" time. The active row has a cobalt rule. Delete asks for confirmation inline ("Delete?") |
| TOPIC/FINDING/… chips looked like filters but did nothing | They are now a **Highlight** control: other card types fade to 25% |
| "Guide" button did nothing | It opens a popover with how-to text and real shortcuts |
| Fake telemetry ribbon ("16.2ms", "<16ms") and status bar | Removed |
| React Flow's default Backspace delete removed cards from the view only (the store was unchanged, so cards came back on the next edit) | Disabled. Del/Backspace now opens the real delete prompt for the selected idea |
| Clicking *anywhere* outside the inspector (header, sidebar, zoom buttons) closed it, fighting the toggle | Selecting an idea opens the inspector. Only the toggle closes it. Clicking the canvas just deselects. The open/closed state is always persisted |
| The header title draft went stale after switching projects | The draft re-syncs with the active project's title |
| "Add Idea" always branched from the root | It branches from the **selected** idea (or the root if nothing is selected). The tooltip says which one |

Files touched: `src/app/App.tsx`, `src/layout/AppHeader.tsx`, `src/layout/StructuralIndexRail.tsx`, `src/layout/panelIcons.tsx` (new), `src/canvas/CanvasView.tsx`, and two test files. `tsc -b` is clean and all 141 unit tests pass.

---

## 1. P0: data loss / corruption

### 1.1 Switching projects can overwrite the target project with the previous canvas
[App.tsx `handleSelectProject`](src/app/App.tsx) calls `setActiveProjectId(id)` **before** the new canvas is fetched. The sync effect (`[canvas, activeProjectId]`) then fires with the *new* id and the *old* canvas:

- Immediately: the sidebar entry for project B takes project A's title and node count.
- After 500 ms: if `fetchProject(id)` has not resolved yet (slow network, cold server), `updateProjectApi(B, canvasOfA)` writes A's graph into B.

`handleDeleteProject` has the same pattern.

**Fix:** set `activeProjectId` and the canvas together, only after the fetch resolves. Or key the sync on a `loadedProjectId` that is only set once the canvas for that id is in the store. Also refuse to save when `canvas.id !== activeProjectId`.

### 1.2 Initial load can save an empty canvas over a real project
On mount, `setActiveProjectId(activeId)` runs while the store still holds `emptyCanvas()`. If `fetchProject` takes more than 500 ms, the debounced sync PUTs `{ title: '', nodes: [] }` for that project. The server accepts an empty title because it checks `body.title !== undefined`.

**Fix:** the same guard as 1.1. Also never PUT before the first successful load.

### 1.3 Saves can be lost or arrive out of order
- `updateProjectApi` failures are only `console.warn`ed. The user still sees "Saved automatically" ([NodeInspectorRail.tsx](src/layout/NodeInspectorRail.tsx)).
- The sync effect's cleanup clears the pending timer on unmount and on project switch, so the last ≤500 ms of edits are dropped. Nothing flushes on `beforeunload` for the **API** (the `beforeunload` flush in `persistence/middleware.ts` only writes localStorage).
- PUTs are not sequenced, so two in flight can land out of order.

**Fix:** a small save queue: one in-flight request, coalesce the latest payload, flush on switch/unmount (`navigator.sendBeacon` or `fetch(..., { keepalive: true })` on unload), and show a real saved/saving/error indicator.

### 1.4 The localStorage canvas is not per-user
`installPersistenceMiddleware` still mirrors every canvas to `root-mvp:canvas` ([middleware.ts](src/persistence/middleware.ts)). `loadInitialCanvas()` then seeds new projects from that key ([App.tsx](src/app/App.tsx) initialize). On a shared browser, user B's first project can be created from user A's last canvas. The one-time "legacy migration" also uploads `root-mvp:projects` into whichever account happens to sign in first.

**Fix:** remove the canvas mirror now that SQLite is the source of truth. If you want offline recovery, key it by user id. Drop or gate the legacy migration.

---

## 2. P1: broken or misleading features

### 2.1 The inspector shows fabricated data
[NodeInspectorRail.tsx](src/layout/NodeInspectorRail.tsx):
- The collapsed-branch view always shows **3** Key Points, **2** Open Questions, **2** Takeaways, **4** References, plus four hardcoded links (youtube/notion/medium/drive).
- "Saved References & Links" always shows `youtube.com/watch?v=creative-habits`. There is no `links` field in the data model.
- The image caption is always "1920x1080 • Visual Asset • 1.2 MB". The header says "N FILE" but only the first image is shown.
- `CREATED: 2025-02-14` and `UPDATED: Just now` are hardcoded; the node has real `createdAt`/`updatedAt`.
- "+ Add Image (Upload, Paste, or Drop)": the inspector only supports click-to-upload.
- "Focus on This Branch Only" opens the editor; it doesn't focus anything.
- "Expand All Under Branch (N Ideas)" calls `setCollapsed(id, false)`, which expands **one** level ([mutators.ts](src/data/mutators.ts) `setCollapsed`). Collapsed descendants stay collapsed.
- The drag footer shows a disabled "Repositioning Active..." button and a spinning ↻.

**Fix:** compute the metrics from `descendants` grouped by `type`. Remove the references UI until a `links` field exists. Render every image with real dimensions (`naturalWidth`) and byte size. Format real timestamps.

### 2.2 The seeded demo tree overlaps itself and is triggered unexpectedly
`handleCreateRoot` ([App.tsx](src/app/App.tsx)) places three children at fixed offsets (−140, +40, +280). Real cards are 200–330 px tall, so they stack on top of each other. You can see this in the current UI: the Finding card's image sits under the Conclusion card.

It is also triggered by:
- pressing **N**,
- clicking **Add Idea** on an empty canvas,
- an empty premise,
- the "Content Plan" template.

All four inject marketing copy ("3x higher retention", "73% completion") into the user's project. The other three templates only set a title. The code finds the new nodes by array index (`nodes[1..3]`) inside nested `setTimeout(0)`s.

**Fix:** make the demo explicit (a "Load example" template only), build it as one canvas transform, and run `computeTreeLayout` / `computeChildPosition` on it. An empty premise should create a blank root.

### 2.3 New children don't account for real card height
`computeChildPosition` / `computeTreeLayout` ([placement.ts](src/canvas/placement.ts)) assume a fixed card size, but cards grow with body text and images. Auto Layout can still produce overlaps.

**Fix:** feed measured sizes from React Flow (`node.width/height` via `useNodes`/`onNodesChange` `dimensions` changes) into layout.

### 2.4 The "branch" count means different things in different places
The header uses `branchCount` = number of distinct parents. The root card says "3 Branches" (= its children). Same project, header says "1 branch". Pick one definition (edges, i.e. `nodes.length - 1`, is the most intuitive) and use it everywhere.

### 2.5 Node short IDs collide
`N-${id.slice(0, 2).toUpperCase()}` gives only 256 values, so collisions are likely after about 20 ideas. Every root is labeled `ROOT-01`. These IDs appear in the inspector's "Connect under" dropdown, where collisions make choices ambiguous.

**Fix:** use a per-canvas sequence number stored on the node, or show titles instead.

### 2.6 The E2E suite targets an app that no longer exists
The `e2e/*.spec.ts` tests `goto('/')` and expect `btn-create-root`, but `/` is now the landing page and `/dashboard` requires sign-in. They also clear localStorage to "start fresh", which no longer resets anything because data is in SQLite. I inferred this from reading the specs; I did not run Playwright.

**Fix:** add an auth fixture (register or log in through the API, store `storageState`), point the tests at `/dashboard`, and reset through the projects API.

### 2.7 Deleting a project fails silently
`deleteProjectApi(idToDelete)` is not awaited and its result is ignored. The sidebar removes the project even if the server refused, and it comes back on reload. (Delete now asks for inline confirmation, see §0.)

### 2.8 New project names can repeat
`Project ${projects.length + 1}` repeats after a deletion (delete "Project 2" out of 3, and the next new one is "Project 3" again).

---

## 3. P2: correctness and architecture debt

| # | Issue | Where | Suggested fix |
|---|---|---|---|
| 3.1 | Writes that bypass `canvasActions`: Auto Layout and title rename call `useCanvasStore.setState` directly. No `canvasSchema` validation, and the title rename doesn't bump `updatedAt` | `CanvasView.handleAutoLayout`, `App` `onTitleChange` | Add `canvasActions.applyLayout(canvas)` and `canvasActions.setTitle(title)` |
| 3.2 | Every `NodeCard` subscribes to the **whole** canvas (`useCanvasStore((s) => s.canvas)`) to count children, so every keystroke re-renders every card | [NodeCard.tsx](src/nodes/NodeCard.tsx) | Select a derived `childCount` / `hasCollapsedChildren` with a shallow-equal selector |
| 3.3 | The inspector and connections list run `canvas.nodes.filter(...)` / `find` repeatedly per render, and `hasCycle` once per option in the parent `<select>` (O(n²)) | NodeInspectorRail | Build a children index once with `useMemo` |
| 3.4 | `rfNodes` is mirrored into local state and re-synced in an effect. The drag path already re-derives from the store each frame | CanvasView | Use React Flow's controlled `nodes` plus `onNodesChange` for position only, and drop the mirror |
| 3.5 | Images are stored as base64 inside the canvas JSON, and the **whole** canvas (all images) is PUT on every edit (debounced 500 ms). With a 2 MB per-image cap and a 50 MB body limit, a few images make every keystroke a multi-MB upload | `projects-api`, `server.ts` | Store images separately (blob table or object storage) and reference them by id. Consider PATCH/diff saves |
| 3.6 | No server-side validation: `canvas`, `nodeCount` and `id` are trusted from the client. The server should validate with the same `canvasSchema` (zod) and compute `nodeCount` itself | [server.ts](server.ts) | Share `src/data/schema.ts` with the server |
| 3.7 | `PUT /api/projects/:id` upserts with a client-chosen id. This works, but it hides "project not found" mistakes (e.g. a save after a delete recreates the project) | server.ts | Make PUT update-only (404 when missing) and keep creation on POST |
| 3.8 | The auth client calls `http://localhost:3001` directly while projects go through the Vite proxy (`/api`). Mixed origins will break in production | [auth-client.ts](src/lib/auth-client.ts) | Use a relative base URL (same origin) behind the proxy or reverse proxy |
| 3.9 | `db = new Database('./auth.db')` resolves relative to the process cwd. An empty, untracked `database.sqlite` sits in the repo root | [db.ts](src/lib/db.ts) | Resolve the path from config, delete `database.sqlite` and add it to `.gitignore` |
| 3.10 | Debug leftovers: `console.log` in `handleConnect`/`handleReconnect`, and `window.__ROOT_CANVAS_STORE__` / `__ROOT_CANVAS_ACTIONS__` exposed in production builds | CanvasView, App | Remove them, or gate them behind `import.meta.env.DEV` |
| 3.11 | Inconsistent limits: the inspector title caps at 128 chars, the editor at 200 | NodeInspectorRail vs NodeEditor | One constant in `data/` |
| 3.12 | The data-layer docs and comments still describe "localStorage persistence (R8.x)" while the real path is SQLite; the PRD lists auth/cloud sync as out of scope | `persistence/*`, PRD.md | Update the PRD and docs to the current architecture |
| 3.13 | Unused or dead surface: `CanvasViewControls.zoomPercent` and most of `onControlsReady` are now used only for `fitView` after a project switch. `StructuralIndexRail.isOpen` and `NodeInspectorRail.isOpen` are unused | | Trim them |
| 3.14 | `App.tsx` has ~985 lines mixing the toast system, error boundary, project CRUD, seeding and layout. It still has 8 lint errors (`any`, empty catches) | App.tsx | Split into `useProjects()` (CRUD + save queue), `useSeedCanvas()`, `Toasts`, and `AppShell` |

---

## 4. P3: design-system drift and polish

- **Off-palette colors:** `NodeEditor` and the toast still use `#ff3c00` (from the previous design system) as the accent and warning color. DESIGN.md uses cobalt `#0051c3` for action and `#de5052`/`#ba1a1a` for warnings.
- **Shadows:** DESIGN.md has a zero-shadow mandate, but there are still `shadow-sm` on the drag badge and `boxShadow: 0 4px 16px` on toasts.
- **Card chrome:** cards show "SELECTED" / "DRAGGING ACTIVE" pills plus a 2 px border plus a cobalt top bar, three signals for one state. The drag badge text "Grid [Grid 20px]" repeats itself. Keep the border, drop the pills.
- **Body text truncation:** card bodies are cut at 160 characters mid-word with "…". Use a CSS line clamp (3 lines) instead.
- **Hover toolbar:** six 22 px buttons appear on hover in a tight row next to the type badge. "Add image" just opens the editor. Consider fewer buttons (add, edit, collapse, more ⋯).
- **Edge semantics:** question edges are dashed and others solid, but there is no legend. The Guide popover could explain this.
- **Accessibility:** project rows are `div role="button"` that contain another button. Node cards are not keyboard-focusable for selection. Handles are only visible on hover. Several icon-only buttons in the inspector lack `aria-label` (image remove "✕").
- **Empty state:** the empty-canvas card says "STEP 01" with no step 2. The title input caps at 120 characters while the node allows 128/200.
- **No undo/redo:** deleting a subtree is irreversible apart from the confirmation prompt. A history stack on `canvasActions` would be cheap given the pure mutators.
- **Responsiveness:** the header's right cluster (Highlight chips + Guide + Add Idea) needs about 700 px. Below ~1100 px total width with both panes open, the canvas becomes very narrow. Consider auto-collapsing the inspector under a breakpoint.

---

## 5. Suggested order of work

1. **Save pipeline** (§1.1–1.4, §2.7): one `useProjects` hook with load-then-activate, a sequenced save queue, a flush on switch/unload, and a real save indicator. This removes every P0.
2. **Honest inspector** (§2.1, §2.5): replace the fabricated data with real derived values.
3. **Seeding and layout** (§2.2, §2.3): explicit example template, and measured-size layout.
4. **E2E suite** (§2.6) with auth fixtures, so the above stays fixed.
5. Server validation and image storage (§3.5–3.7), then the P2/P3 cleanups.
