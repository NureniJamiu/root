/**
 * Canvases as they were stored before schema version 2: no `schemaVersion`,
 * no node `fields` or `provenance`, no edge `relationType` or `provenance`.
 *
 * They mirror the canvases the existing tests and e2e specs build (the
 * evidence-checks seed, the connector seed, the `parentId` legacy project)
 * plus one that uses every optional field a v1 canvas could hold.
 */

const TS = '2024-01-01T00:00:00.000Z';

const card = (id: string, type: string, title: string, x: number, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  title,
  body: '',
  images: [],
  position: { x, y: 200 },
  collapsed: false,
  createdAt: TS,
  updatedAt: TS,
  ...extra,
});

const link = (id: string, source: string, target: string, extra: Record<string, unknown> = {}) => ({
  id,
  source,
  target,
  sourceSide: 'right',
  targetSide: 'left',
  sourcePinned: false,
  targetPinned: false,
  ...extra,
});

/** The e2e evidence seed: a conclusion resting on an unanswered question, and an unused finding. */
export const evidenceSeed = {
  id: 'c0000000-0000-4000-8000-0000000000a0',
  title: 'Pricing',
  updatedAt: TS,
  nodes: [
    card('c0000000-0000-4000-8000-000000000001', 'conclusion', 'Lead with annual', 80),
    card('c0000000-0000-4000-8000-000000000002', 'question', 'Keep a free tier?', 480),
    card('c0000000-0000-4000-8000-000000000003', 'finding', 'Annual wins 3 to 1', 880),
  ],
  edges: [link('c0000000-0000-4000-8000-0000000000e1', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002')],
};

/** The e2e connector seed: three cards, one pinned connector. */
export const connectorSeed = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000a0',
  title: '',
  updatedAt: TS,
  nodes: [
    card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'topic', 'Node Alpha', 80, { body: 'Node Alpha notes.' }),
    card('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'finding', 'Node Beta', 480, { body: 'Node Beta notes.' }),
    card('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'question', 'Node Gamma', 880, { body: 'Node Gamma notes.' }),
  ],
  edges: [
    link('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
      sourcePinned: true,
      targetPinned: true,
    }),
  ],
};

/** Saved before connectors were first-class: each child names its `parentId`. */
export const parentIdSeed = {
  id: 'dddddddd-0000-4000-8000-0000000000a0',
  title: 'Old project',
  updatedAt: TS,
  nodes: [
    card('dddddddd-0000-4000-8000-000000000001', 'topic', 'Old root', 80, { parentId: null }),
    card('dddddddd-0000-4000-8000-000000000002', 'topic', 'Old child', 480, {
      parentId: 'dddddddd-0000-4000-8000-000000000001',
    }),
    card('dddddddd-0000-4000-8000-000000000003', 'finding', 'Pinned child', 80, {
      parentId: 'dddddddd-0000-4000-8000-000000000001',
      sourceSide: 'bottom',
      targetSide: 'top',
      sourcePinned: true,
      targetPinned: true,
    }),
  ],
};

/** Every optional field a v1 canvas could carry: sources, image captions, hidden and pinned connectors. */
export const everyFieldSeed = {
  id: 'ffffffff-0000-4000-8000-0000000000a0',
  title: 'Sleep and memory',
  updatedAt: TS,
  nodes: [
    card('ffffffff-0000-4000-8000-000000000001', 'topic', 'Sleep', 0, { collapsed: true, body: 'Why we sleep.' }),
    card('ffffffff-0000-4000-8000-000000000002', 'finding', 'REM consolidates skills', 400, {
      source: {
        kind: 'article',
        title: 'Sleep and motor learning',
        authors: ['Walker, Matthew'],
        published: '2002-07',
        container: 'Neuron',
        url: 'https://example.com/walker-2002',
        doi: '10.1016/S0896-6273(02)00746-8',
        quote: 'Sleep improves motor skill.',
      },
      images: [
        {
          id: 'ffffffff-0000-4000-8000-0000000000b1',
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          addedAt: TS,
          caption: 'A bar chart of recall after sleep.',
          text: 'Recall +20%',
        },
      ],
    }),
    card('ffffffff-0000-4000-8000-000000000003', 'question', 'Does napping help?', 800),
    card('ffffffff-0000-4000-8000-000000000004', 'conclusion', 'Sleep after practice', 1200),
  ],
  edges: [
    link('ffffffff-0000-4000-8000-0000000000e1', 'ffffffff-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000002', {
      hidden: true,
    }),
    link('ffffffff-0000-4000-8000-0000000000e2', 'ffffffff-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000003'),
    link('ffffffff-0000-4000-8000-0000000000e3', 'ffffffff-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000004', {
      sourceSide: 'top',
      targetSide: 'bottom',
      sourcePinned: true,
    }),
    link('ffffffff-0000-4000-8000-0000000000e4', 'ffffffff-0000-4000-8000-000000000004', 'ffffffff-0000-4000-8000-000000000003'),
  ],
};

/** A project that was created and never edited. */
export const emptySeed = { id: '99999999-0000-4000-8000-0000000000a0', title: 'Interactive Graph', nodes: [], edges: [], updatedAt: TS };

export const V1_FIXTURES = {
  evidenceSeed,
  connectorSeed,
  parentIdSeed,
  everyFieldSeed,
  emptySeed,
} as const;
