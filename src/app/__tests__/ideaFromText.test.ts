import { describe, expect, it } from 'vitest';

import { ideaFromText } from '../AppShell';

describe('ideaFromText', () => {
  it('uses short text as the title', () => {
    expect(ideaFromText('  Sleep   improves memory ')).toEqual({ title: 'Sleep improves memory', body: '' });
  });

  it('uses the first sentence of long text as the title and keeps all of it as notes', () => {
    const text = `Students who slept eight hours recalled more words. ${'They were tested twice. '.repeat(8)}`;
    const idea = ideaFromText(text);
    expect(idea.title).toBe('Students who slept eight hours recalled more words.');
    expect(idea.body).toBe(text.trim().replace(/\s+/g, ' '));
  });

  it('shortens a long run-on title at a word', () => {
    const idea = ideaFromText('word '.repeat(60));
    expect(idea.title.endsWith('…')).toBe(true);
    expect(idea.title.length).toBeLessThanOrEqual(141);
  });
});
