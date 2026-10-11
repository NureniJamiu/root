/**
 * Where "Research this question" looks things up.
 *
 * Each source is a plain HTTP API called from the server, so research works
 * on any model, including free ones that cannot search the web themselves:
 *   - Wikipedia: encyclopedia articles. Free, no key.
 *   - OpenAlex: scholarly papers with abstracts. Free; a key or contact email
 *     gets more requests a day.
 *   - Tavily: the open web. Needs `TAVILY_API_KEY` (free tier: 1,000 searches
 *     a month).
 *
 * Everything a source returns is text written by strangers: it is cut short,
 * stripped of markup and handed to the model as material, never as
 * instructions. Uses only `fetch`.
 */

export type SourceKind = 'encyclopedia' | 'paper' | 'web';

export interface WebSource {
  readonly title: string;
  /** Always http(s). */
  readonly url: string;
  /** Plain text, at most `SNIPPET_MAX` characters. */
  readonly snippet: string;
  /** Where it came from, for people: "Wikipedia", a journal, a site name. */
  readonly site: string;
  /** A year or date, when the source says. */
  readonly published: string | null;
  readonly kind: SourceKind;
}

export const SEARCH_PROVIDER_IDS = ['wikipedia', 'openalex', 'tavily'] as const;
export type SearchProviderId = (typeof SEARCH_PROVIDER_IDS)[number];

export const SEARCH_PROVIDER_LABELS: Record<SearchProviderId, string> = {
  wikipedia: 'Wikipedia',
  openalex: 'OpenAlex',
  tavily: 'the web',
};

export interface SearchProvider {
  readonly id: SearchProviderId;
  search(query: string, opts: { readonly limit: number; readonly signal?: AbortSignal }): Promise<WebSource[]>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Longest snippet kept per source. */
export const SNIPPET_MAX = 900;
/** How long one source may take before it is skipped. */
const SOURCE_TIMEOUT_MS = 12_000;
const USER_AGENT = 'Root/1.0 (research assistant; https://github.com/NureniJamiu/root)';

/** Text without HTML tags or entities, on one line, cut to `max`. */
export function plainText(value: string, max = SNIPPET_MAX): string {
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function withTimeout(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(SOURCE_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function getJson(fetchImpl: FetchLike, url: string, init: RequestInit, what: string): Promise<unknown> {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`${what} answered ${res.status}`);
  return res.json();
}

/* -------------------------------------------------------------------------- */
/* Wikipedia                                                                  */
/* -------------------------------------------------------------------------- */

interface WikiPage {
  title?: string;
  extract?: string;
  fullurl?: string;
  index?: number;
  touched?: string;
}

export function wikipediaSearch(fetchImpl: FetchLike = fetch, lang = 'en'): SearchProvider {
  return {
    id: 'wikipedia',
    async search(query, { limit, signal }) {
      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: String(limit),
        prop: 'extracts|info',
        exintro: '1',
        explaintext: '1',
        exlimit: String(limit),
        inprop: 'url',
        origin: '*',
      });
      const data = (await getJson(
        fetchImpl,
        `https://${lang}.wikipedia.org/w/api.php?${params}`,
        { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT }, signal: withTimeout(signal) },
        'Wikipedia',
      )) as { query?: { pages?: WikiPage[] } };
      return (data.query?.pages ?? [])
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .flatMap((page): WebSource[] => {
          const url = httpUrl(page.fullurl);
          const snippet = plainText(page.extract ?? '');
          if (!url || !page.title || !snippet) return [];
          return [{ title: page.title, url, snippet, site: 'Wikipedia', published: null, kind: 'encyclopedia' }];
        });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* OpenAlex                                                                   */
/* -------------------------------------------------------------------------- */

interface OpenAlexWork {
  id?: string;
  title?: string | null;
  display_name?: string | null;
  doi?: string | null;
  publication_year?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
}

/** OpenAlex stores abstracts as word → positions; put the words back in order. */
export function abstractFromIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) if (Number.isInteger(p) && p >= 0 && p < 5_000) words[p] = word;
  }
  return words.filter(Boolean).join(' ');
}

function authorsLine(work: OpenAlexWork): string {
  const names = (work.authorships ?? []).map((a) => a.author?.display_name).filter((n): n is string => !!n);
  if (names.length === 0) return '';
  return names.length > 2 ? `${names[0]} et al.` : names.join(' and ');
}

export function openAlexSearch(
  opts: { readonly apiKey?: string | null; readonly email?: string | null } = {},
  fetchImpl: FetchLike = fetch,
): SearchProvider {
  return {
    id: 'openalex',
    async search(query, { limit, signal }) {
      const params = new URLSearchParams({
        search: query,
        per_page: String(limit),
        select: 'id,title,display_name,doi,publication_year,abstract_inverted_index,authorships,primary_location',
      });
      if (opts.apiKey) params.set('api_key', opts.apiKey);
      if (opts.email) params.set('mailto', opts.email);
      const data = (await getJson(
        fetchImpl,
        `https://api.openalex.org/works?${params}`,
        { headers: { 'User-Agent': USER_AGENT }, signal: withTimeout(signal) },
        'OpenAlex',
      )) as { results?: OpenAlexWork[] };
      return (data.results ?? []).flatMap((work): WebSource[] => {
        const title = plainText(work.title ?? work.display_name ?? '', 300);
        const url = httpUrl(work.doi) ?? httpUrl(work.primary_location?.landing_page_url) ?? httpUrl(work.id);
        const abstract = abstractFromIndex(work.abstract_inverted_index);
        if (!title || !url) return [];
        const authors = authorsLine(work);
        const lead = [authors, work.publication_year ? `(${work.publication_year})` : ''].filter(Boolean).join(' ');
        const snippet = plainText([lead, abstract || 'No abstract available.'].filter(Boolean).join('. '));
        return [
          {
            title,
            url,
            snippet,
            site: work.primary_location?.source?.display_name?.trim() || 'OpenAlex',
            published: work.publication_year ? String(work.publication_year) : null,
            kind: 'paper',
          },
        ];
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Tavily                                                                     */
/* -------------------------------------------------------------------------- */

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string | null;
}

export function tavilySearch(apiKey: string, fetchImpl: FetchLike = fetch): SearchProvider {
  return {
    id: 'tavily',
    async search(query, { limit, signal }) {
      const data = (await getJson(
        fetchImpl,
        'https://api.tavily.com/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ query, max_results: limit, search_depth: 'basic', include_answer: false }),
          signal: withTimeout(signal),
        },
        'Tavily',
      )) as { results?: TavilyResult[] };
      return (data.results ?? []).flatMap((r): WebSource[] => {
        const url = httpUrl(r.url);
        const title = plainText(r.title ?? '', 300);
        const snippet = plainText(r.content ?? '');
        if (!url || !title || !snippet) return [];
        return [
          { title, url, snippet, site: new URL(url).hostname.replace(/^www\./, ''), published: r.published_date ?? null, kind: 'web' },
        ];
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Setup and fan-out                                                          */
/* -------------------------------------------------------------------------- */

export interface ResearchEnv {
  /** Sources to use, in order; empty turns research off. */
  readonly sources: readonly SearchProviderId[];
  readonly tavilyKey: string | null;
  readonly openAlexKey: string | null;
  readonly openAlexEmail: string | null;
}

/**
 * `RESEARCH_SOURCES` (comma-separated ids, or "none") picks the sources;
 * by default Wikipedia and OpenAlex, plus the web when Tavily has a key.
 */
export function readResearchEnv(env: Record<string, string | undefined>): ResearchEnv {
  const tavilyKey = env.TAVILY_API_KEY?.trim() || null;
  const raw = env.RESEARCH_SOURCES?.trim().toLowerCase();
  let sources: SearchProviderId[];
  if (raw === 'none') sources = [];
  else if (raw) {
    sources = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is SearchProviderId => (SEARCH_PROVIDER_IDS as readonly string[]).includes(s));
  } else {
    sources = ['wikipedia', 'openalex'];
  }
  if (tavilyKey && !raw && !sources.includes('tavily')) sources.push('tavily');
  if (!tavilyKey) sources = sources.filter((s) => s !== 'tavily');
  return {
    sources: [...new Set(sources)],
    tavilyKey,
    openAlexKey: env.OPENALEX_API_KEY?.trim() || null,
    openAlexEmail: env.OPENALEX_EMAIL?.trim() || null,
  };
}

export function searchProvidersFor(env: ResearchEnv, fetchImpl: FetchLike = fetch): SearchProvider[] {
  return env.sources.flatMap((id): SearchProvider[] => {
    if (id === 'wikipedia') return [wikipediaSearch(fetchImpl)];
    if (id === 'openalex') return [openAlexSearch({ apiKey: env.openAlexKey, email: env.openAlexEmail }, fetchImpl)];
    if (id === 'tavily' && env.tavilyKey) return [tavilySearch(env.tavilyKey, fetchImpl)];
    return [];
  });
}

/** The same page however it was linked: no fragment, no trailing slash, no "www.". */
function urlKey(url: string): string {
  const u = new URL(url);
  u.hash = '';
  return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`.toLowerCase();
}

export interface SearchOutcome {
  readonly sources: WebSource[];
  /** Sources that failed (down, slow, refused), for the log. */
  readonly failures: Array<{ readonly provider: SearchProviderId; readonly error: unknown }>;
}

/**
 * Run every query on every provider at once, then merge: one result from
 * each list in turn (so no single query or source crowds out the rest),
 * without repeats, up to `max`.
 */
export async function searchAll(
  providers: readonly SearchProvider[],
  queries: readonly string[],
  opts: { readonly perQuery: number; readonly max: number; readonly signal?: AbortSignal },
): Promise<SearchOutcome> {
  const failures: Array<{ provider: SearchProviderId; error: unknown }> = [];
  const lists = await Promise.all(
    queries.flatMap((query) =>
      providers.map(async (provider) => {
        try {
          return await provider.search(query, { limit: opts.perQuery, ...(opts.signal ? { signal: opts.signal } : {}) });
        } catch (error) {
          if (opts.signal?.aborted) throw error;
          failures.push({ provider: provider.id, error });
          return [];
        }
      }),
    ),
  );
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (let i = 0; sources.length < opts.max && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const source = list[i];
      if (!source || sources.length >= opts.max) continue;
      const key = urlKey(source.url);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
    }
  }
  return { sources, failures };
}
