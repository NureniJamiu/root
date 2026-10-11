// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  abstractFromIndex,
  openAlexSearch,
  plainText,
  readResearchEnv,
  searchAll,
  searchProvidersFor,
  tavilySearch,
  wikipediaSearch,
} from '../web-search';
import type { FetchLike, SearchProvider, WebSource } from '../web-search';

/** A fetch that answers with `body` as JSON and remembers what it was asked. */
function fakeFetch(body: unknown, status = 200): FetchLike & { urls: string[]; inits: RequestInit[] } {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    urls.push(url);
    inits.push(init ?? {});
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return Object.assign(fn, { urls, inits });
}

const source = (url: string, title = url): WebSource => ({
  title,
  url,
  snippet: 'Text.',
  site: 'Site',
  published: null,
  kind: 'web',
});

describe('web search sources', () => {
  it('cleans text from the web', () => {
    expect(plainText('<b>Sleep</b> &amp; <i>memory</i>\n\n  matter')).toBe('Sleep & memory matter');
    expect(plainText('a'.repeat(50), 10)).toBe(`${'a'.repeat(9)}…`);
  });

  it('puts OpenAlex abstracts back in order', () => {
    expect(abstractFromIndex({ sleep: [0, 3], helps: [1], memory: [2] })).toBe('sleep helps memory sleep');
    expect(abstractFromIndex(null)).toBe('');
  });

  it('reads Wikipedia results in search order, skipping empty ones', async () => {
    const fetchImpl = fakeFetch({
      query: {
        pages: [
          { title: 'Nap', extract: 'A short sleep.', fullurl: 'https://en.wikipedia.org/wiki/Nap', index: 2 },
          { title: 'Sleep', extract: 'Sleep is <rest>.', fullurl: 'https://en.wikipedia.org/wiki/Sleep', index: 1 },
          { title: 'Empty', extract: '', fullurl: 'https://en.wikipedia.org/wiki/Empty', index: 3 },
          { title: 'Bad', extract: 'x', fullurl: 'javascript:alert(1)', index: 4 },
        ],
      },
    });
    const results = await wikipediaSearch(fetchImpl).search('sleep memory', { limit: 4 });
    expect(results.map((r) => r.title)).toEqual(['Sleep', 'Nap']);
    expect(results[0]).toMatchObject({ site: 'Wikipedia', kind: 'encyclopedia', snippet: 'Sleep is .' });
    expect(fetchImpl.urls[0]).toContain('gsrsearch=sleep+memory');
  });

  it('reads OpenAlex papers with authors, year and a DOI link', async () => {
    const fetchImpl = fakeFetch({
      results: [
        {
          id: 'https://openalex.org/W1',
          title: 'Sleep and <i>memory</i>',
          doi: 'https://doi.org/10.1/abc',
          publication_year: 2019,
          abstract_inverted_index: { Naps: [0], help: [1] },
          authorships: [{ author: { display_name: 'A. One' } }, { author: { display_name: 'B. Two' } }, { author: { display_name: 'C. Three' } }],
          primary_location: { source: { display_name: 'Nature' } },
        },
        { id: 'not a url', title: '', doi: null },
      ],
    });
    const [paper, ...rest] = await openAlexSearch({ email: 'me@example.com' }, fetchImpl).search('naps', { limit: 2 });
    expect(rest).toEqual([]);
    expect(paper).toEqual({
      title: 'Sleep and memory',
      url: 'https://doi.org/10.1/abc',
      snippet: 'A. One et al. (2019). Naps help',
      site: 'Nature',
      published: '2019',
      kind: 'paper',
    });
    expect(fetchImpl.urls[0]).toContain('mailto=me%40example.com');
  });

  it('sends the Tavily key as a header, never in the URL', async () => {
    const fetchImpl = fakeFetch({ results: [{ title: 'Naps', url: 'https://www.example.com/naps', content: 'Short naps help.' }] });
    const [result] = await tavilySearch('tvly-secret', fetchImpl).search('naps', { limit: 3 });
    expect(result).toMatchObject({ site: 'example.com', kind: 'web' });
    expect(fetchImpl.urls[0]).not.toContain('tvly-secret');
    expect((fetchImpl.inits[0]!.headers as Record<string, string>).Authorization).toBe('Bearer tvly-secret');
  });

  it('fails a source that answers with an error', async () => {
    await expect(wikipediaSearch(fakeFetch({}, 503)).search('x', { limit: 1 })).rejects.toThrow('Wikipedia answered 503');
  });
});

describe('research setup', () => {
  it('uses the free sources by default and the web only with a key', () => {
    expect(readResearchEnv({}).sources).toEqual(['wikipedia', 'openalex']);
    expect(readResearchEnv({ TAVILY_API_KEY: 'k' }).sources).toEqual(['wikipedia', 'openalex', 'tavily']);
    expect(readResearchEnv({ RESEARCH_SOURCES: 'tavily,openalex' }).sources).toEqual(['openalex']);
    expect(readResearchEnv({ RESEARCH_SOURCES: 'none', TAVILY_API_KEY: 'k' }).sources).toEqual([]);
    expect(searchProvidersFor(readResearchEnv({ RESEARCH_SOURCES: 'wikipedia,bogus' })).map((p) => p.id)).toEqual(['wikipedia']);
  });
});

describe('searchAll', () => {
  const provider = (id: SearchProvider['id'], byQuery: Record<string, WebSource[] | Error>): SearchProvider => ({
    id,
    search: async (query) => {
      const result = byQuery[query] ?? [];
      if (result instanceof Error) throw result;
      return result;
    },
  });

  it('takes one result from each list in turn, without repeats', async () => {
    const wiki = provider('wikipedia', {
      a: [source('https://x.org/1'), source('https://x.org/2')],
      b: [source('https://www.x.org/1/#top')],
    });
    const papers = provider('openalex', { a: [source('https://y.org/1')], b: [source('https://y.org/2'), source('https://y.org/3')] });
    const { sources, failures } = await searchAll([wiki, papers], ['a', 'b'], { perQuery: 3, max: 4 });
    expect(sources.map((s) => s.url)).toEqual(['https://x.org/1', 'https://y.org/1', 'https://y.org/2', 'https://x.org/2']);
    expect(failures).toEqual([]);
  });

  it('skips a source that fails and reports it', async () => {
    const broken = provider('tavily', { a: new Error('down') });
    const wiki = provider('wikipedia', { a: [source('https://x.org/1')] });
    const { sources, failures } = await searchAll([broken, wiki], ['a'], { perQuery: 3, max: 5 });
    expect(sources).toHaveLength(1);
    expect(failures.map((f) => f.provider)).toEqual(['tavily']);
  });
});
