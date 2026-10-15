import { describe, expect, test } from 'vitest';

import type { Source } from '../../data';
import { bibKey, bibtexEntry, formatReference, parseName, referenceText } from '../citation';

const article: Source = {
  kind: 'article',
  title: 'Sleep and memory consolidation',
  authors: ['Matthew Walker', 'Stickgold, Robert'],
  published: '2004',
  container: 'Neuron',
  doi: '10.1016/j.neuron.2004.08.031',
};

const web: Source = {
  kind: 'web',
  title: 'Why we sleep',
  authors: ['World Health Organization'],
  published: '2023-03-18',
  container: 'WHO',
  url: 'https://www.who.int/sleep',
};

const book: Source = { kind: 'book', title: 'Why We Sleep', authors: ['Matthew Walker'], published: '2017', container: 'Scribner' };

describe('names', () => {
  test('people and organisations', () => {
    expect(parseName('Ada Lovelace')).toEqual({ family: 'Lovelace', given: 'Ada', organisation: false });
    expect(parseName('Lovelace, Ada King')).toEqual({ family: 'Lovelace', given: 'Ada King', organisation: false });
    expect(parseName('World Health Organization').organisation).toBe(true);
    expect(parseName('NASA').organisation).toBe(true);
  });
});

describe('APA', () => {
  test('journal article with DOI', () => {
    expect(formatReference(article, 'apa')).toEqual([
      { text: 'Walker, M., & Stickgold, R. (2004). Sleep and memory consolidation. ' },
      { text: 'Neuron', italic: true },
      { text: '. https://doi.org/10.1016/j.neuron.2004.08.031' },
    ]);
  });

  test('web page by an organisation, with a full date', () => {
    expect(referenceText(web, 'apa')).toBe('World Health Organization. (2023, March 18). Why we sleep. WHO. https://www.who.int/sleep');
  });

  test('book', () => {
    expect(formatReference(book, 'apa')).toEqual([
      { text: 'Walker, M. (2017). ' },
      { text: 'Why We Sleep.', italic: true },
      { text: ' Scribner.' },
    ]);
  });

  test('a bare link still gives a reference', () => {
    expect(referenceText({ kind: 'web', url: 'https://example.com/a' }, 'apa')).toBe('(n.d.). https://example.com/a');
  });
});

describe('MLA', () => {
  test('journal article', () => {
    expect(referenceText(article, 'mla')).toBe(
      'Walker, Matthew, and Robert Stickgold. “Sleep and memory consolidation.” Neuron, 2004, https://doi.org/10.1016/j.neuron.2004.08.031.',
    );
  });

  test('web page with no date notes when it was read', () => {
    expect(referenceText({ kind: 'web', title: 'Sleep tips', container: 'NHS', url: 'https://nhs.uk/sleep', accessed: '2026-10-15' }, 'mla')).toBe(
      '“Sleep tips.” NHS, nhs.uk/sleep. Accessed 15 Oct. 2026.',
    );
  });

  test('three or more authors become et al.', () => {
    expect(referenceText({ kind: 'book', title: 'T', authors: ['A One', 'B Two', 'C Three'] }, 'mla')).toBe('One, A, et al. T.');
  });
});

describe('Chicago', () => {
  test('journal article', () => {
    expect(referenceText(article, 'chicago')).toBe(
      'Walker, Matthew, and Robert Stickgold. “Sleep and memory consolidation.” Neuron (2004). https://doi.org/10.1016/j.neuron.2004.08.031.',
    );
  });

  test('book', () => {
    expect(referenceText(book, 'chicago')).toBe('Walker, Matthew. Why We Sleep. Scribner, 2017.');
  });
});

describe('BibTeX', () => {
  test('entries with unique keys and escaped values', () => {
    const taken = new Set<string>();
    const key = bibKey(article, taken);
    expect(key).toBe('walker2004sleep');
    expect(bibKey(article, taken)).toBe('walker2004sleepa');
    expect(bibtexEntry(article, key)).toBe(
      [
        '@article{walker2004sleep,',
        '  author = {Walker, Matthew and Stickgold, Robert},',
        '  title = {{Sleep and memory consolidation}},',
        '  journal = {Neuron},',
        '  year = {2004},',
        '  doi = {10.1016/j.neuron.2004.08.031}',
        '}',
      ].join('\n'),
    );
    expect(bibtexEntry({ kind: 'web', title: '50% & more', authors: ['World Health Organization'] }, 'k')).toContain(
      'author = {{World Health Organization}}',
    );
    expect(bibtexEntry({ kind: 'web', title: '50% & more' }, 'k')).toContain('title = {{50\\% \\& more}}');
  });
});
