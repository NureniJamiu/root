import { describe, expect, it } from 'vitest';

import { markdownToPlainText, parseInline, parseMarkdown } from '../markdown';

describe('markdown notes', () => {
  it('reads inline styles', () => {
    expect(parseInline('a **bold** and *italic* ~~gone~~ `x`')).toEqual([
      { text: 'a ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'italic', italic: true },
      { text: ' ' },
      { text: 'gone', strike: true },
      { text: ' ' },
      { text: 'x', code: true },
    ]);
  });

  it('nests styles and keeps plain asterisks alone', () => {
    expect(parseInline('**bold _both_**')).toEqual([
      { text: 'bold ', bold: true },
      { text: 'both', bold: true, italic: true },
    ]);
    expect(parseInline('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }]);
    expect(parseInline('snake_case_name')).toEqual([{ text: 'snake_case_name' }]);
  });

  it('keeps only safe links', () => {
    expect(parseInline('[site](https://example.com)')).toEqual([{ text: 'site', href: 'https://example.com' }]);
    expect(parseInline('[mail](mailto:a@b.c)')).toEqual([{ text: 'mail', href: 'mailto:a@b.c' }]);
    expect(parseInline('[bad](javascript:alert(1))')[0]).not.toHaveProperty('href');
  });

  it('reads paragraphs, headings and lists', () => {
    const blocks = parseMarkdown('# Title\nfirst line\nsecond line\n\n- one\n- two\n1. first\n2. second');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'list']);
    expect(blocks[1]).toEqual({ kind: 'paragraph', lines: [[{ text: 'first line' }], [{ text: 'second line' }]] });
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: false });
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true });
  });

  it('gives plain text for search and previews', () => {
    expect(markdownToPlainText('## Heading\n**Bold** text\n- item')).toBe('Heading\n\nBold text\n\nitem');
  });
});
