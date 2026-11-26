# `src/data/model`: the typed-graph contract

The node types, relations, provenance shape and rule ids that Milestone 0 keys off (plan: `.agents/tasks/m0-plan.md`, decisions D2–D8). The code in this folder is the source of truth; this table summarises it.

## Node types (`nodeTypes.ts`)

Every field is optional. Unset means "not yet specified".

| Id | Label | Family | Stages | Fields | AI may propose via |
|---|---|---|---|---|---|
| `topic` | Topic | General | topic | none | map, expand, capture, tidy |
| `question` | Question | General | topic, literature | none | map, expand, capture, tidy, research |
| `finding` | Finding | General | literature, data, interpretation | none (keeps node `source`) | map, expand, capture, tidy, research |
| `conclusion` | Conclusion | General | interpretation | none | map, expand, capture, tidy |
| `problem` | Problem statement | Problem framing | problem | none | capture |
| `objective` | Objective | Problem framing | problem | `scope`: general, specific | capture |
| `research-question` | Research question | Problem framing | problem | none | capture |
| `hypothesis` | Hypothesis | Problem framing | problem | `form`: null, alternative; `direction`: directional, non-directional | capture |
| `variable` | Variable | Problem framing | problem, methodology | `role`: independent, dependent, control, moderator, mediator, other; `measurementLevel`: nominal, ordinal, interval, ratio | capture |

## Relations (`relations.ts`)

Pairs read subject → object. `any` matches every type.

| Id | Forward / reverse label | Allowed subject → object | Default for the pair |
|---|---|---|---|
| `related-to` | related to | any ↔ any (symmetric) | fallback for every pair |
| `addresses` | addresses / addressed by | objective → problem; research-question → objective; hypothesis → research-question | yes |
| `refines` | refines / refined by | objective → objective; research-question → research-question | yes |
| `involves` | involves / involved in | research-question → variable; hypothesis → variable; objective → variable | yes |
| `answers` | answers / answered by | finding → question; finding → research-question | yes |
| `supports` | supports / supported by | finding → conclusion; finding → hypothesis | yes |
| `contradicts` | contradicts / contradicted by | finding → conclusion; finding → hypothesis; finding ↔ finding (symmetric) | no |

- Parsing checks only that `relationType` is a known id. Whether it fits the endpoint types is the `relation-invalid` rule; invalid edges are flagged, never deleted.
- `orient(edge, typeOf)` reads an edge as subject → object without touching its drawn `source`/`target`. For two different types a relation lists a pair in one orientation only. For same-type pairs the stored direction is the semantic one.
- `defaultRelation(a, b)` is the relation a new connector starts with, falling back to `related-to`.

## Provenance (`provenance.ts`)

Required on every node and edge, discriminated on `origin`:

| Origin | Extra | Stamped by |
|---|---|---|
| `researcher` | none | `addNode`, `addChild`, `createIdea`, `connect`, source-reader extracts |
| `ai` | `ai: { feature, model, acceptedAt }` | `aiProposalActions.accept` |
| `import` | none | imports |
| `unrecorded` | none | migration of pre-v2 canvases |

All origins carry `edited: boolean`, which turns true once the researcher edits an AI-originated item.

## Rules (`rules.ts`)

Rules run over a `GraphView` and return `Issue`s carrying `ruleId` and `ruleVersion`.

The engine lives in `../rules/`. Typed rules read connectors in their semantic direction (`orient`), so a connector drawn either way round counts; a connector whose relation does not fit has no meaning for them.

| Id | Version | Fires when |
|---|---|---|
| `conclusion-unbacked` | 2 | no finding backs the conclusion, directly or through questions, research questions or conclusions; `contradicts` never backs |
| `conclusion-open-question` | 2 | the conclusion rests on a question or research question no finding answers |
| `finding-dangling` | 1 | the finding connects to nothing that uses it (a contradicting finding is used) |
| `rq-without-objective` | 1 | a research question has no `addresses` edge to an objective, itself or through a question it `refines` |
| `objective-without-rq` | 1 | no research question addresses the objective, or any objective that `refines` it |
| `objective-off-problem` | 1 | a problem statement exists but the objective does not address it, itself or through an objective it `refines` |
| `hypothesis-without-variable` | 1 | a hypothesis `involves` no variable |
| `relation-invalid` | 1 | a connector's relation is not allowed for its endpoint types; one issue per card the connectors start from |

On a canvas of general types with only `related-to` connectors (every migrated v1 canvas) only the first three rules can fire, with the same results as before M0 (property-tested in `rules/__tests__/framing.test.ts`).

## Stages (`stages.ts`)

`topic`, `problem`, `literature`, `framework`, `methodology`, `data`, `interpretation`, `documentation`: the eight stages of the research journey, in order. Stage state is derived from the types on the canvas, never stored.

## What the app exposes today (`enabled.ts`)

The canvas schema accepts only the node types and relations listed in `enabled.ts`, so nothing can be saved that the interface cannot show. Today that is every M0 node type (the general and problem-framing families, enabled with the grouped type picker in slice S4) and every relation in the map (enabled with the relation picker in S5).

Retyping a card keeps the fields the new type also defines (with a value it accepts) and drops the rest (`fieldsForType`). The hover toolbar's type button cycles within the card's family; changing family goes through the editor's type picker.

## What the AI may propose (`src/lib/ai/vocabulary.ts`)

Each type's `ai` list names the features that may propose it: map, expand and tidy stay on the general family; capture may also propose problem-framing types; research proposes findings and questions. Prompts list only those types (from `aiGuide`) and the typed relations among them (from the map), and each feature's output schema allows only its types.

A suggestion may carry the relation of its connector to its parent. The clean-up keeps it only when the map allows it for the two types; anything else becomes a plain `related-to` link. Ghost connectors show the relation as a label, an idea re-hung because its parent was switched off loses its relation, and tidy can propose a meaning (`relate`) only for a connector that is still `related-to`. Accepted suggestions and tidy connectors are recorded with `ai` provenance.

## Workspace (`workspace.ts`)

`canvas.workspace` is optional: `{ intake?: { answer, answeredAt }, focusStage? }`. The intake answers are `no-topic`, `has-topic`, `objectives-drafted`, `collected-data` and `writing-up`, one per row of the D10 intake table.

It is written with `canvasActions.setWorkspace`, saved with the canvas and kept out of undo history: undo and redo carry the current workspace into the canvas they restore.

The intake (`src/app/IntakeDialog.tsx`) opens for a project made with New Project and from the starting-point button on the open project in the sidebar; projects that exist already are never prompted. Each answer sets the focus stage (no topic → topic; topic or objectives → problem; data → data; writing up → documentation) and seeds only what it asks for: a topic card, or AI-suggested cards from pasted objectives that wait for an accept. Skipping records nothing.

Once a project has an intake answer, the stage panel (`src/app/StagePanel.tsx`) lists the eight stages with their derived state (`../stageStates.ts`) and issue counts. Focusing a stage dims the cards whose types are outside it; "All stages" shows the whole canvas. Its next steps (`src/app/nextSteps.ts`) are deterministic: rule issues first, then the cards a stage starts with that the project lacks.

## Canvas schema v2

`canvasSchema` (in `../schema.ts`) is version 2: `schemaVersion: 2`, node `fields` and `provenance`, edge `relationType` and `provenance`, and the optional `workspace`. `migrateCanvas` brings older canvases up on parse: legacy `parentId` → v1 → v2, where every v1 node gets `fields: {}` and `unrecorded` provenance and every v1 edge gets `related-to` and `unrecorded`. The server refuses (409 `stale-schema`) a save whose canvas is older than the one stored.
