/**
 * Tidying a source before it is stored: trims every field, drops empty ones
 * and anything that would fail the schema (a non-web address, a malformed
 * date), and cuts text to the limits. Pure.
 */

import { SOURCE_AUTHORS_MAX, SOURCE_QUOTE_MAX, SOURCE_TEXT_MAX, SOURCE_URL_MAX } from './limits';
import type { Source } from './types';

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function text(value: string | undefined, max: number): string | undefined {
  const v = value?.replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : undefined;
}

/** The source with empty and invalid fields removed, or null when nothing is left to cite. */
export function cleanSource(source: Source): Source | null {
  const url = source.url?.trim();
  const authors = (source.authors ?? [])
    .map((a) => text(a, SOURCE_TEXT_MAX))
    .filter((a): a is string => a !== undefined)
    .slice(0, SOURCE_AUTHORS_MAX);
  const quote = source.quote?.trim().slice(0, SOURCE_QUOTE_MAX);
  const fields = {
    title: text(source.title, SOURCE_TEXT_MAX),
    authors: authors.length > 0 ? authors : undefined,
    published: source.published && DATE.test(source.published.trim()) ? source.published.trim() : undefined,
    container: text(source.container, SOURCE_TEXT_MAX),
    url: url && /^https?:\/\//i.test(url) && url.length <= SOURCE_URL_MAX ? url : undefined,
    doi: text(source.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, ''), SOURCE_TEXT_MAX),
    accessed: source.accessed && DAY.test(source.accessed) ? source.accessed : undefined,
    quote: quote || undefined,
  };
  const kept = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Omit<Source, 'kind'>;
  if (!kept.title && !kept.url && !kept.doi && !kept.authors && !kept.container && !kept.quote) return null;
  return { kind: source.kind, ...kept };
}

/** Do two sources say the same thing? (`undefined` and an empty source are equal.) */
export function sameSource(a: Source | undefined, b: Source | undefined): boolean {
  const ca = a ? cleanSource(a) : null;
  const cb = b ? cleanSource(b) : null;
  return JSON.stringify(ca) === JSON.stringify(cb);
}
