/**
 * Ghost connectors show the relation a suggestion would be added with, so the
 * person sees every meaning before pressing Add (M0 plan D9, principle 0.3).
 */
import { describe, expect, it } from 'vitest';

import type { AiProposal, GhostIdea } from '../../data';
import { ghostEdges } from '../ghostEdges';

const ghost = (over: Partial<GhostIdea> & Pick<GhostIdea, 'key'>): GhostIdea => ({
  title: over.key,
  body: '',
  type: 'finding',
  parentKey: null,
  relation: null,
  position: { x: 0, y: 0 },
  ...over,
});

const proposal = (ideas: GhostIdea[], excluded: string[] = []): AiProposal => ({
  kind: 'map',
  anchorId: null,
  ideas,
  excluded,
  modelLabel: 'Test',
});

const ANCHOR = { id: '00000000-0000-4000-8000-000000000001', position: { x: -400, y: 0 }, type: 'question' as const };

describe('ghostEdges', () => {
  it('labels a connector with its relation, read from the parent', () => {
    const edges = ghostEdges(
      proposal([
        ghost({ key: 'c', type: 'conclusion' }),
        ghost({ key: 'f', parentKey: 'c', relation: 'supports', position: { x: 400, y: 0 } }),
      ]),
      undefined,
    );
    expect(edges).toHaveLength(1);
    // Drawn conclusion → finding, so it reads "supported by".
    expect(edges[0]!.label).toBe('supported by');
  });

  it('labels connectors from the idea being expanded', () => {
    const edges = ghostEdges(
      { ...proposal([ghost({ key: 'f', relation: 'answers' })]), kind: 'expand', anchorId: ANCHOR.id },
      ANCHOR,
    );
    expect(edges[0]).toMatchObject({ source: ANCHOR.id, label: 'answered by' });
  });

  it('shows no label for plain links, or for suggestions that would not be added with it', () => {
    const ideas = [
      ghost({ key: 'q', type: 'question' }),
      ghost({ key: 'f', parentKey: 'q', relation: 'answers' }),
      ghost({ key: 'c', parentKey: 'f', type: 'conclusion', relation: null }),
    ];
    expect(ghostEdges(proposal(ideas), undefined).map((e) => e.label)).toEqual(['answered by', undefined]);
    // Switching the question off re-hangs the finding as a plain link: its label goes.
    expect(ghostEdges(proposal(ideas, ['q']), undefined).map((e) => e.label)).toEqual([undefined, undefined]);
  });
});
