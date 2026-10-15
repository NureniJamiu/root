// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { isFetchableUrl, normaliseDate, readPage, ReaderError } from '../reader';

const PAGE = `<!doctype html><html><head>
<title>Sleep and memory | Science Daily</title>
<meta property="og:site_name" content="Science Daily">
<meta name="author" content="Ada Lovelace">
<meta property="article:published_time" content="2024-03-18T09:00:00Z">
<script type="application/ld+json">{"@type":"NewsArticle","headline":"Sleep and memory","author":[{"@type":"Person","name":"Ada Lovelace"},{"name":"Alan Turing"}]}</script>
</head><body>
<nav><p>Home · News · Science · a long enough menu line to pass the length filter</p></nav>
<article>
<h1>Sleep and memory</h1>
<p>People who slept after learning remembered 20% more the next day, the study found.</p>
<p>Subscribe to our newsletter</p>
<blockquote>Sleep is the price we pay for plasticity, the authors wrote.</blockquote>
<ul><li>Participants: 400 adults aged 18 to 65 years</li></ul>
<script>track()</script>
</article></body></html>`;

function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route();
  }) as typeof fetch;
}

const html = (body: string) => () => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('isFetchableUrl', () => {
  test.each([
    ['https://example.com/a', true],
    ['http://example.com:443/a', true],
    ['ftp://example.com', false],
    ['http://localhost:3000', false],
    ['http://127.0.0.1/', false],
    ['http://10.0.0.5/', false],
    ['http://192.168.1.1/', false],
    ['http://169.254.169.254/latest', false],
    ['http://[::1]/', false],
    ['http://intranet/', false],
    ['http://printer.local/', false],
    ['https://user:pass@example.com/', false],
    ['https://example.com:8080/', false],
  ])('%s → %s', (url, ok) => {
    expect(isFetchableUrl(url) !== null).toBe(ok);
  });
});

test('normaliseDate', () => {
  expect(normaliseDate('2024-03-18T09:00:00Z')).toBe('2024-03-18');
  expect(normaliseDate('2024/3/8')).toBe('2024-03-08');
  expect(normaliseDate('March 2019')).toBe('2019-03');
  expect(normaliseDate('18 March 2024')).toBe('2024-03-18');
  expect(normaliseDate('Mar 8th, 2024')).toBe('2024-03-08');
  expect(normaliseDate('nonsense')).toBeNull();
});

describe('readPage', () => {
  test('reads the article text and the details a citation needs', async () => {
    const page = await readPage('https://news.example.com/sleep', fakeFetch({ 'https://news.example.com/sleep': html(PAGE) }));
    expect(page).toMatchObject({
      url: 'https://news.example.com/sleep',
      title: 'Sleep and memory',
      authors: ['Ada Lovelace', 'Alan Turing'],
      published: '2024-03-18',
      siteName: 'Science Daily',
      kind: 'web',
      doi: null,
    });
    expect(page.blocks).toEqual([
      { kind: 'heading', text: 'Sleep and memory' },
      { kind: 'paragraph', text: 'People who slept after learning remembered 20% more the next day, the study found.' },
      { kind: 'quote', text: 'Sleep is the price we pay for plasticity, the authors wrote.' },
      { kind: 'item', text: 'Participants: 400 adults aged 18 to 65 years' },
    ]);
  });

  test('scholarly pages are articles with their DOI and journal', async () => {
    const paper = `<html><head><meta name="citation_title" content="Sleep &amp; memory consolidation">
      <meta name="citation_author" content="Walker, Matthew"><meta name="citation_author" content="Stickgold, Robert">
      <meta name="citation_journal_title" content="Neuron"><meta name="citation_publication_date" content="2004/09/30">
      <meta name="citation_doi" content="10.1016/j.neuron.2004.08.031"></head>
      <body><p>Abstract: sleep has been implicated in the processing of memory.</p></body></html>`;
    const page = await readPage('https://journal.example.org/p', fakeFetch({ 'https://journal.example.org/p': html(paper) }));
    expect(page).toMatchObject({
      title: 'Sleep & memory consolidation',
      authors: ['Walker, Matthew', 'Stickgold, Robert'],
      siteName: 'Neuron',
      published: '2004-09-30',
      doi: '10.1016/j.neuron.2004.08.031',
      kind: 'article',
    });
  });

  test('follows public redirects but not ones into private networks', async () => {
    const ok = await readPage(
      'http://example.com/old',
      fakeFetch({
        'http://example.com/old': () => new Response(null, { status: 301, headers: { location: 'https://example.com/new' } }),
        'https://example.com/new': html(PAGE),
      }),
    );
    expect(ok.url).toBe('https://example.com/new');
    await expect(
      readPage(
        'https://example.com/trap',
        fakeFetch({ 'https://example.com/trap': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }) }),
      ),
    ).rejects.toThrow(ReaderError);
  });

  test('says so when a site shows a browser check instead of the page', async () => {
    const check = '<html><head><title>Client Challenge</title></head><body><noscript><p>Please enable JavaScript to proceed.</p></noscript></body></html>';
    await expect(readPage('https://example.com/c', fakeFetch({ 'https://example.com/c': html(check) }))).rejects.toThrow(
      /checks for a real browser/,
    );
  });

  test('keeps cookies set along a redirect chain for the next hop', async () => {
    let sent = '';
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://example.com/a') {
        return new Response(null, { status: 302, headers: [['location', 'https://example.com/b'], ['set-cookie', 'sid=42; Path=/; HttpOnly']] });
      }
      sent = new Headers(init?.headers).get('cookie') ?? '';
      return html(PAGE)();
    }) as typeof fetch;
    await readPage('https://example.com/a', fetchImpl);
    expect(sent).toBe('sid=42');
  });

  test('picks the main text over a teaser <article> card', async () => {
    const long = 'A sentence of the real article that is long enough to count as text. '.repeat(3);
    const page = `<html><body><main><article><p>Short teaser card text that is long enough.</p></article>
      <p>${long}</p><p>Second: ${long}</p></main></body></html>`;
    const read = await readPage('https://example.com/m', fakeFetch({ 'https://example.com/m': html(page) }));
    expect(read.blocks).toHaveLength(3);
  });

  test('refuses PDFs and other files with a clear message', async () => {
    const pdf = fakeFetch({ 'https://example.com/a.pdf': () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }) });
    await expect(readPage('https://example.com/a.pdf', pdf)).rejects.toThrow('PDFs cannot be read here yet.');
    await expect(readPage('http://localhost/x')).rejects.toThrow('That is not a public web address.');
  });
});
