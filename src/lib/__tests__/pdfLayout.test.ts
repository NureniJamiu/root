import { describe, expect, test } from 'vitest';

import { linesOf, paragraphsOf, pdfDate, pdfDetails, repeatedLines } from '../pdfLayout';
import type { PdfLine } from '../pdfLayout';

const line = (text: string, y: number, size = 10): PdfLine => ({ text, y, size });

describe('linesOf', () => {
  test('groups runs on one baseline, left to right, top to bottom', () => {
    expect(
      linesOf([
        { text: 'world', x: 60, y: 700, size: 10 },
        { text: 'Second line', x: 10, y: 686, size: 10 },
        { text: 'Hello', x: 10, y: 700.8, size: 10 },
      ]).map((l) => l.text),
    ).toEqual(['Hello world', 'Second line']);
  });
});

describe('paragraphsOf', () => {
  test('wide gaps and larger type start new blocks; hyphenated words are mended', () => {
    const blocks = paragraphsOf(
      [
        line('Introduction', 720, 14),
        line('Sleep after learning strengthens mem-', 700),
        line('ories, the study found.', 688),
        line('A second paragraph starts after a gap.', 660),
      ],
      new Set(),
    );
    expect(blocks).toEqual([
      { kind: 'heading', text: 'Introduction' },
      { kind: 'paragraph', text: 'Sleep after learning strengthens memories, the study found.' },
      { kind: 'paragraph', text: 'A second paragraph starts after a gap.' },
    ]);
  });

  test('running heads and page numbers on most pages are left out', () => {
    const page = (n: number) => [line('Journal of Sleep Research', 780, 8), line(`Body text of page ${n} goes here.`, 700), line(String(n), 40, 8)];
    const pages = [page(1), page(2), page(3), page(4)];
    const skip = repeatedLines(pages);
    expect(paragraphsOf(pages[1]!, skip)).toEqual([{ kind: 'paragraph', text: 'Body text of page 2 goes here.' }]);
  });
});

describe('pdfDetails', () => {
  test('reads the information dictionary and a DOI from the opening text', () => {
    expect(
      pdfDetails(
        { Title: 'Sleep and memory consolidation', Author: 'Matthew Walker; Robert Stickgold', CreationDate: "D:20040930120000Z00'00'" },
        [],
        'Neuron 44 (2004). https://doi.org/10.1016/j.neuron.2004.08.031.',
        'walker.pdf',
      ),
    ).toEqual({
      title: 'Sleep and memory consolidation',
      authors: ['Matthew Walker', 'Robert Stickgold'],
      published: '2004-09-30',
      doi: '10.1016/j.neuron.2004.08.031',
    });
  });

  test('a tool-made title falls back to the largest type on the first page', () => {
    const details = pdfDetails(
      { Title: 'Microsoft Word - draft3.docx' },
      [line('A Study of', 750, 20), line('Sleep in Students', 728, 20), line('Ada Lovelace', 700, 11)],
      '',
      'draft3',
    );
    expect(details.title).toBe('A Study of Sleep in Students');
    expect(details.authors).toEqual([]);
  });

  test('PDF dates', () => {
    expect(pdfDate('D:2017')).toBe('2017');
    expect(pdfDate('D:201703')).toBe('2017-03');
    expect(pdfDate(undefined)).toBeNull();
  });
});
