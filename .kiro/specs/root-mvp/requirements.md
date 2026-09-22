# Requirements Document

## Introduction

Root MVP is a desktop-first, canvas-based, node-driven research tool that lets a single user manually construct, arrange, and present a hierarchical tree of research nodes on an infinite pannable and zoomable canvas. The MVP is manual-only — no AI generation is included — but the data model and code structure are designed so a future AI generation step can plug into the same shape and interfaces.

The core loop is: create a root node, branch child nodes, edit content (title, body, images), arrange the tree visually (pan, zoom, drag), collapse and expand branches to focus attention, and present. State is persisted locally on every change and fully restored on reload. The visual result must feel intentionally designed, following the design system defined in DESIGN.md.

## Glossary

- **Root_App**: The overall Root MVP application shell, responsible for coordinating the canvas, node editing, persistence, and UI chrome.
- **Canvas**: The infinite pannable and zoomable 2D surface on which nodes and connector lines are rendered. Also refers to the persisted top-level document (a Canvas record) containing an id, title, nodes, and updatedAt.
- **Canvas_View**: The runtime component that renders the Canvas surface and handles pan, zoom, and hit-testing.
- **Node**: A single research unit on the Canvas with id, parentId, title, body, images, type, position, collapsed state, and timestamps.
- **Root_Node**: The unique Node in a Canvas whose parentId is null. A Canvas has exactly one Root_Node.
- **Child_Node**: A Node whose parentId references another Node's id.
- **Subtree**: A Node together with all of its descendants (transitive children).
- **Node_Type**: One of the enum values "topic", "finding", "question", "conclusion". Drives node color and style.
- **Node_Editor**: The UI surface used to edit a Node's title, body, and images.
- **Connector**: A visual line drawn between a parent Node and each of its direct visible children, derived from parentId and Node positions (not a stored edge).
- **Collapse_State**: A boolean per Node indicating whether the Node's subtree is hidden from the Canvas_View.
- **Persistence_Layer**: The module responsible for serializing Canvas state to local storage and deserializing it on load.
- **Local_Storage**: The browser's localStorage API used as the persistence backend.
- **Data_Model_Layer**: The isolated module that owns the Canvas and Node types, mutations, and invariants. It has no dependency on rendering or interaction code.
- **Canvas_Layer**: The isolated module responsible for rendering the Canvas surface, connectors, pan, zoom, and drag interactions.
- **Node_UI_Layer**: The isolated module containing Node presentational components and the Node_Editor.
- **Design_System**: The visual language defined in DESIGN.md, including palette, typography (Times), spacing, radii, and transitions.
- **Debounce_Interval**: The delay between the last change and a persistence write, set to 500 milliseconds.
- **Delete_Prompt**: The confirmation prompt shown when the user deletes a Node that has at least one child.

## Requirements

### Requirement 1: Canvas Rendering and Navigation

**User Story:** As a researcher, I want an infinite canvas I can pan and zoom, so that I can arrange and view a large tree of nodes comfortably.

#### Acceptance Criteria

1. THE Canvas_View SHALL render an infinite 2D surface that displays all non-hidden Nodes at their stored positions.
2. WHEN the user drags the empty Canvas background with the primary pointer, THE Canvas_View SHALL translate the viewport by the pointer delta.
3. WHEN the user scrolls the mouse wheel or performs a pinch gesture over the Canvas, THE Canvas_View SHALL zoom the viewport centered on the pointer position.
4. THE Canvas_View SHALL constrain the zoom level to a minimum of 0.25x and a maximum of 2.5x.
5. THE Canvas_View SHALL render a Connector line from each visible parent Node to each of its visible direct children, computed from parentId and current Node positions.
6. WHEN a Node's position changes, THE Canvas_View SHALL update all Connectors incident to that Node within the same animation frame.
7. WHILE 100 to 150 Nodes are visible in the viewport, THE Canvas_View SHALL maintain a rendering frame time at or below 16 milliseconds during pan, zoom, and drag interactions on a modern desktop browser.

### Requirement 2: Root Node Creation

**User Story:** As a researcher, I want an empty canvas to give me a way to create the first node, so that I can begin building a tree.

#### Acceptance Criteria

1. WHEN a Canvas is loaded with zero Nodes, THE Root_App SHALL display an affordance to create the Root_Node.
2. WHEN the user activates the create-root affordance, THE Data_Model_Layer SHALL create a new Node with parentId set to null, Node_Type set to "topic", an empty title, an empty body, an empty images list, a position at the current viewport center, Collapse_State false, and createdAt and updatedAt set to the current timestamp.
3. IF a Canvas already contains a Root_Node, THEN THE Root_App SHALL NOT display the create-root affordance.
4. WHEN the Root_Node is created, THE Node_UI_Layer SHALL open the Node_Editor for the new Node with keyboard focus on the title field.

### Requirement 3: Child Node Creation and Branching

**User Story:** As a researcher, I want to branch child nodes from any node, so that I can expand my tree of ideas.

#### Acceptance Criteria

1. WHEN the user activates the add-child affordance on a Node, THE Data_Model_Layer SHALL create a new Node with parentId set to the source Node's id, Node_Type set to "topic", an empty title, an empty body, an empty images list, Collapse_State false, and createdAt and updatedAt set to the current timestamp.
2. WHEN a Child_Node is created, THE Canvas_Layer SHALL assign the Child_Node an initial position offset from the parent Node such that the new Node does not overlap the parent or any existing sibling at the parent's zoom level.
3. WHEN a Child_Node is created, THE Node_UI_Layer SHALL open the Node_Editor for the new Node with keyboard focus on the title field.
4. IF the parent Node has Collapse_State true at the time of child creation, THEN THE Data_Model_Layer SHALL set the parent Node's Collapse_State to false before creating the child.
5. THE Data_Model_Layer SHALL reject any operation that would create a cycle in the parent-child relationships.

### Requirement 4: Node Content Editing

**User Story:** As a researcher, I want to edit a node's title, body text, and images, so that I can capture the substance of each idea.

#### Acceptance Criteria

1. WHEN the user activates a Node's edit affordance, THE Node_UI_Layer SHALL open the Node_Editor bound to that Node.
2. WHEN the user changes the title in the Node_Editor, THE Data_Model_Layer SHALL update the Node's title and set updatedAt to the current timestamp.
3. WHEN the user changes the body in the Node_Editor, THE Data_Model_Layer SHALL update the Node's body and set updatedAt to the current timestamp.
4. WHEN the user adds an image via file selection or paste in the Node_Editor, THE Data_Model_Layer SHALL append an image entry containing the image data encoded as a data URL to the Node's images list.
5. WHEN the user removes an image from the Node_Editor, THE Data_Model_Layer SHALL remove the corresponding image entry from the Node's images list.
6. WHEN the user changes the Node_Type in the Node_Editor, THE Data_Model_Layer SHALL update the Node's type to one of "topic", "finding", "question", or "conclusion".
7. THE Node_UI_Layer SHALL render the Node card using the color and style variant associated with the Node's current Node_Type.

### Requirement 5: Node Positioning and Drag

**User Story:** As a researcher, I want to drag nodes to arrange my tree visually, so that the layout reflects my thinking.

#### Acceptance Criteria

1. WHEN the user drags a Node with the primary pointer, THE Canvas_Layer SHALL update the Node's position to follow the pointer in Canvas coordinates.
2. WHEN a Node drag ends, THE Data_Model_Layer SHALL commit the Node's final position and set updatedAt to the current timestamp.
3. WHILE a Node is being dragged, THE Canvas_Layer SHALL redraw all Connectors incident to the Node in real time.
4. THE Canvas_Layer SHALL NOT move any descendant Nodes when a parent Node is dragged.

### Requirement 6: Collapse and Expand of Subtrees

**User Story:** As a researcher, I want to collapse and expand branches, so that I can focus on the part of the tree that matters right now.

#### Acceptance Criteria

1. WHEN the user activates the collapse affordance on a Node with at least one child, THE Data_Model_Layer SHALL set that Node's Collapse_State to true.
2. WHILE a Node has Collapse_State true, THE Canvas_View SHALL hide the entire Subtree rooted at that Node's children, including all transitive descendants and their Connectors.
3. WHEN the user activates the expand affordance on a Node with Collapse_State true, THE Data_Model_Layer SHALL set that Node's Collapse_State to false.
4. WHEN a Node with Collapse_State true is expanded, THE Canvas_View SHALL show its direct children and any further descendants whose ancestor Collapse_State values are all false.
5. THE Node_UI_Layer SHALL display a visual indicator on any Node whose Collapse_State is true, including a count of hidden descendants.
6. THE Data_Model_Layer SHALL persist each Node's Collapse_State as part of the Canvas record.

### Requirement 7: Node Deletion

**User Story:** As a researcher, I want to delete nodes and choose whether their children go with them, so that I can prune my tree without losing work I want to keep.

#### Acceptance Criteria

1. WHEN the user activates delete on a Node with zero children, THE Data_Model_Layer SHALL remove the Node from the Canvas without prompting.
2. WHEN the user activates delete on a Node with at least one child, THE Root_App SHALL display the Delete_Prompt offering two options: "Delete node only" and "Delete node and entire subtree".
3. WHEN the user selects "Delete node only" in the Delete_Prompt, THE Data_Model_Layer SHALL set each direct child's parentId to the deleted Node's parentId and then remove the deleted Node.
4. WHEN the user selects "Delete node and entire subtree" in the Delete_Prompt, THE Data_Model_Layer SHALL remove the deleted Node and every Node in its Subtree.
5. IF the user activates delete on the Root_Node while the Canvas contains other Nodes, THEN THE Root_App SHALL display the Delete_Prompt with only the "Delete node and entire subtree" option enabled.
6. WHEN the user cancels the Delete_Prompt, THE Data_Model_Layer SHALL leave the Canvas unchanged.

### Requirement 8: Local Persistence and Reload

**User Story:** As a researcher, I want my work saved automatically and restored exactly on reload, so that I never lose progress.

#### Acceptance Criteria

1. WHEN any change is made to the Canvas record or any Node, THE Persistence_Layer SHALL schedule a write to Local_Storage after the Debounce_Interval of 500 milliseconds from the last change.
2. WHEN the Persistence_Layer writes the Canvas, THE Persistence_Layer SHALL serialize the Canvas as a single JSON document containing id, title, nodes, and updatedAt.
3. WHEN the Root_App starts and a Canvas record exists in Local_Storage, THE Persistence_Layer SHALL deserialize that Canvas and restore every Node's id, parentId, title, body, images, type, position, Collapse_State, createdAt, and updatedAt exactly as stored.
4. WHEN the Root_App starts and no Canvas record exists in Local_Storage, THE Root_App SHALL initialize a new empty Canvas.
5. IF a stored Canvas record fails to deserialize, THEN THE Root_App SHALL surface a recoverable error to the user and preserve the raw stored payload untouched.
6. THE Persistence_Layer SHALL flush any pending debounced write when the browser tab emits a beforeunload event.

### Requirement 9: Canvas Data Model Shape

**User Story:** As a future AI generation feature, I want a stable, flat, serializable data shape, so that generated trees can plug into the same rendering and editing layer.

#### Acceptance Criteria

1. THE Data_Model_Layer SHALL represent a Canvas as a JSON object with fields id (string), title (string), nodes (array of Node), and updatedAt (ISO 8601 string).
2. THE Data_Model_Layer SHALL represent a Node as a JSON object with fields id (string), parentId (string or null), title (string), body (string), images (array of image entries), type (one of "topic", "finding", "question", "conclusion"), position (object with numeric x and y), collapsed (boolean), createdAt (ISO 8601 string), and updatedAt (ISO 8601 string).
3. THE Data_Model_Layer SHALL store tree structure using parentId references only and SHALL NOT store an explicit edges array.
4. THE Data_Model_Layer SHALL expose a pure function that accepts a Canvas JSON document and returns a validated Canvas or a descriptive error.
5. THE Data_Model_Layer SHALL expose a pure function that serializes a Canvas back to the same JSON shape it accepts.
6. FOR ALL valid Canvas JSON documents, deserializing then serializing SHALL produce a JSON document semantically equivalent to the input (round-trip property).

### Requirement 10: Architectural Separation for Future Extensibility

**User Story:** As a maintainer, I want the data model, canvas, and node UI to be isolated modules, so that a future AI generation step can produce the same data shape without touching rendering code.

#### Acceptance Criteria

1. THE Data_Model_Layer SHALL NOT import from the Canvas_Layer or the Node_UI_Layer.
2. THE Canvas_Layer SHALL depend on the Data_Model_Layer for state and SHALL NOT import from the Node_UI_Layer's internal editor components.
3. THE Node_UI_Layer SHALL depend on the Data_Model_Layer for state and SHALL NOT import from the Canvas_Layer's rendering internals.
4. THE Data_Model_Layer SHALL expose all Canvas and Node mutations through a documented interface that accepts and returns the same JSON shape defined in Requirement 9.
5. WHERE a future generation source produces a Canvas JSON document conforming to Requirement 9, THE Data_Model_Layer SHALL accept that document through the same interface used by manual editing.

### Requirement 11: Visual Design System Adherence

**User Story:** As a researcher, I want the tool to feel intentionally designed, so that the visual result looks cohesive rather than like default UI.

#### Acceptance Criteria

1. THE Root_App SHALL apply styles using Tailwind CSS configured with the tokens defined in DESIGN.md.
2. THE Root_App SHALL use "Times" as the primary font family for all text.
3. THE Root_App SHALL restrict its color palette to the Design_System palette: primary #0051c3, secondary #de5052, accent #521010, and neutrals #404040, #000000, #595959, #ffffff, and #ebebeb.
4. THE Node_UI_Layer SHALL assign a distinct visual style within the Design_System palette to each Node_Type value: "topic", "finding", "question", and "conclusion".
5. THE Root_App SHALL use border radii of at most 2 pixels for extra-small elements and 5 pixels for small elements, matching the Design_System radii.
6. THE Root_App SHALL use a transition duration of 150 milliseconds for interactive state changes.
7. THE Root_App SHALL use a flat material style with no drop shadows, no backdrop filters, and no decorative gradients beyond those defined in DESIGN.md.
8. THE Root_App SHALL follow the Design_System type scale for headings and body text, including h1 at 60 pixels weight 300, h2 at 30 pixels weight 300, and body at 13 pixels weight 400.

### Requirement 12: Performance Under Load

**User Story:** As a researcher, I want the canvas to stay smooth as my tree grows, so that I can work with substantial research maps.

#### Acceptance Criteria

1. WHILE a Canvas contains between 100 and 150 visible Nodes, THE Canvas_View SHALL sustain pan, zoom, and drag interactions at a frame time at or below 16 milliseconds on a modern desktop browser.
2. WHEN a Node is off-screen, THE Canvas_View SHALL skip rendering that Node's card contents while still updating its Connector endpoints if incident to a visible Node.
3. WHEN persistence writes occur, THE Persistence_Layer SHALL perform serialization off the interaction-critical path such that no persistence write blocks a pan, zoom, or drag frame for more than 8 milliseconds.

### Requirement 13: Scope Boundaries

**User Story:** As a stakeholder, I want the MVP scope to be explicit, so that the team does not build features outside the agreed cut.

#### Acceptance Criteria

1. THE Root_App SHALL NOT include any AI generation of Nodes, titles, bodies, or images.
2. THE Root_App SHALL NOT include multi-user editing, presence, or collaboration features.
3. THE Root_App SHALL NOT include user accounts, authentication, or cloud sync.
4. THE Root_App SHALL NOT include a mobile-optimized layout or touch-first interaction model.
5. THE Root_App SHALL NOT include an export feature to external formats.
6. THE Root_App SHALL target modern desktop browsers only.

### Requirement 14: MVP Acceptance Walkthrough

**User Story:** As a stakeholder, I want a single end-to-end scenario that proves the MVP works, so that we have a clear definition of done.

#### Acceptance Criteria

1. WHEN a user starts from an empty Canvas, creates a Root_Node, adds at least two levels of Child_Nodes, edits titles and bodies on multiple Nodes, and attaches at least one image, THE Root_App SHALL render the resulting tree with correct Connectors and Node_Type styling.
2. WHEN the user collapses a Node with nested descendants and then expands it, THE Canvas_View SHALL hide and then restore the entire Subtree, including transitive descendants.
3. WHEN the user reloads the browser tab after building the tree described in acceptance criterion 1, THE Root_App SHALL restore every Node's position, content, images, Node_Type, and Collapse_State exactly as they were before reload.
