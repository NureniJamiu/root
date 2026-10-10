import { describe, expect, it } from 'vitest';

import { CHAPTERS, FILM_DOC, FILM_DURATION, POSTER_TIME, filmFrame } from '../filmScript';
import { storyFrame } from '../ScrollStory';
import type { StoryLayout } from '../ScrollStory';

const WIDE: StoryLayout = { w: 1548, h: 900, left: 507, panelW: 400, scrollPanel: false };

describe('product film: writing it up', () => {
  it('has a "Write it up" chapter before the end card, inside the film', () => {
    const labels = CHAPTERS.map((c) => c.label);
    expect(labels.indexOf('Write it up')).toBe(labels.length - 2);
    for (const c of CHAPTERS) expect(c.at).toBeLessThan(FILM_DURATION);
  });

  it('keeps the document closed until the chapter starts', () => {
    expect(filmFrame(20000).doc.slide).toBe(0);
    expect(filmFrame(29000).doc.slide).toBe(0);
  });

  it('shows the finished write-up in the poster frame, with both cited cards marked', () => {
    const frame = filmFrame(POSTER_TIME);
    expect(frame.doc.slide).toBe(1);
    expect(frame.doc.titleChars).toBe(FILM_DOC.title.length);
    expect(frame.doc.cite).toBe(1);
    expect(frame.doc.card).toBe(1);
    expect(frame.endCard).toBe(0);
    const cited = frame.nodes.filter((n) => n.cited && n.cited.p > 0).map((n) => n.id);
    expect(cited.sort()).toEqual(['b', 'g']);
  });

  it('drags the conclusion card in with the cursor', () => {
    const carry = filmFrame(36800).cursor?.carry;
    expect(carry).toEqual({ type: 'conclusion', title: FILM_DOC.card.title });
  });

  it('closes the document under the end card so the loop starts clean', () => {
    expect(filmFrame(FILM_DURATION - 10).doc.slide).toBe(0);
  });
});

describe('How it works: writing it up', () => {
  it('leaves the document closed through the canvas steps', () => {
    expect(storyFrame(0.5, WIDE).doc.slide).toBe(0);
    expect(storyFrame(0.79, WIDE).doc.slide).toBe(0);
  });

  it('ends with a cited idea, an embedded card and a new idea on the map', () => {
    const frame = storyFrame(1, WIDE);
    expect(frame.doc.slide).toBe(1);
    expect(frame.doc.cite).toBe(1);
    expect(frame.doc.card).toBe(1);
    expect(frame.doc.made).toBe(1);
    const made = frame.nodes.find((n) => n.id === 'n');
    expect(made?.opacity).toBe(1);
    expect(frame.edges.find((e) => e.id === 'k-n')?.progress).toBe(1);
  });
});
