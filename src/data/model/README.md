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

| Id | Fires when |
|---|---|
| `conclusion-unbacked` | no finding backs the conclusion (directly or through questions or conclusions) |
| `conclusion-open-question` | the conclusion rests on a question nothing answers |
| `finding-dangling` | the finding connects to nothing that uses it |
| `rq-without-objective` | a research question has no `addresses` edge to an objective |
| `objective-without-rq` | an objective has no research question addressing it |
| `hypothesis-without-variable` | a hypothesis `involves` no variable |
| `objective-off-problem` | a problem statement exists but this objective does not address it |
| `relation-invalid` | an edge's relation is not allowed for its endpoint types |

## Stages (`stages.ts`)

`topic`, `problem`, `literature`, `framework`, `methodology`, `data`, `interpretation`, `documentation`: the eight stages of the research journey, in order. Stage state is derived from the types on the canvas, never stored.

## What the app exposes today (`enabled.ts`)

The canvas schema accepts only the node types and relations listed in `enabled.ts`, so nothing can be saved that the interface cannot show. Today that is every M0 node type (the general and problem-framing families, enabled with the grouped type picker in slice S4) and `related-to`. The other relations are enabled with the relation picker (S5).

Retyping a card keeps the fields the new type also defines (with a value it accepts) and drops the rest (`fieldsForType`). The hover toolbar's type button cycles within the card's family; changing family goes through the editor's type picker.

## Workspace (`workspace.ts`)

`canvas.workspace` is optional: `{ intake?: { answer, answeredAt }, focusStage? }`. The intake answers are `no-topic`, `has-topic`, `objectives-drafted`, `collected-data` and `writing-up`, one per row of the D10 intake table.

## Canvas schema v2

`canvasSchema` (in `../schema.ts`) is version 2: `schemaVersion: 2`, node `fields` and `provenance`, edge `relationType` and `provenance`, and the optional `workspace`. `migrateCanvas` brings older canvases up on parse: legacy `parentId` → v1 → v2, where every v1 node gets `fields: {}` and `unrecorded` provenance and every v1 edge gets `related-to` and `unrecorded`. The server refuses (409 `stale-schema`) a save whose canvas is older than the one stored.
