/**
 * Turning the short references a model cites ("[[I3]]", "[[D2]]") into
 * references to real ideas and passages, as text streams in.
 *
 * The model only ever sees short references (see `project-content.ts`). This
 * rewrites each one to `[[idea:<id>]]` or `[[doc:<document id>#<block id>]]`
 * and drops any it made up, so every citation that reaches the browser points
 * at something that exists. Pure: no I/O.
 */

import type { AiSource } from './contracts';
import type { SourceRefs } from './project-content';

/** The marker the browser reads for a source. */
export function sourceMarker(source: AiSource): string {
  return source.kind === 'idea' ? `[[idea:${source.ideaId}]]` : `[[doc:${source.documentId}#${source.blockId ?? ''}]]`;
}

/** Read a marker written by `sourceMarker`. */
export function parseSourceMarker(inner: string): AiSource | null {
  if (inner.startsWith('idea:')) return { kind: 'idea', ideaId: inner.slice(5) };
  if (inner.startsWith('doc:')) {
    const [documentId, blockId] = inner.slice(4).split('#');
    return documentId ? { kind: 'doc', documentId, blockId: blockId || null } : null;
  }
  return null;
}

/** "I3", "[I3]", "I3, D2" → the sources they name, unknown ones dropped. */
export function resolveRefs(text: string, refs: SourceRefs): AiSource[] {
  const out: AiSource[] = [];
  for (const m of text.matchAll(/\b([ID])\s?(\d{1,4})\b/g)) {
    const source = refs.get(`${m[1]}${m[2]}`);
    if (source && !out.some((s) => sourceMarker(s) === sourceMarker(source))) out.push(source);
  }
  return out;
}

/** Longest bracket run held back while waiting for it to close. */
const HOLD_MAX = 48;

/**
 * A stateful rewriter: feed it text as it streams with `push`, then `flush`
 * at the end. Citations are written as `[[I3]]` (or `[I3]`, or several in one
 * bracket: `[[I3, D2]]`); anything else passes through unchanged.
 */
export function createCitationRewriter(refs: SourceRefs): { push(text: string): string; flush(): string } {
  let held = '';

  const rewrite = (bracket: string): string => {
    const inner = bracket.replace(/^\[+|\]+$/g, '');
    if (!/^\s*[ID]\s?\d{1,4}(\s*[,;]\s*[ID]\s?\d{1,4})*\s*$/.test(inner)) return bracket;
    return resolveRefs(inner, refs).map(sourceMarker).join('');
  };

  const drain = (final: boolean): string => {
    let out = '';
    while (held.length > 0) {
      const open = held.indexOf('[');
      if (open === -1) {
        out += held;
        held = '';
        break;
      }
      out += held.slice(0, open);
      held = held.slice(open);
      const double = held.startsWith('[[');
      const close = double ? held.indexOf(']]') : held.indexOf(']');
      const reopened = held.indexOf('[', double ? 2 : 1);
      if (reopened !== -1 && (close === -1 || reopened < close)) {
        // Another bracket opens first, so this one is plain text.
        out += held[0];
        held = held.slice(1);
        continue;
      }
      if (close !== -1) {
        const end = close + (double ? 2 : 1);
        out += rewrite(held.slice(0, end));
        held = held.slice(end);
        continue;
      }
      // Still open: wait for the rest, unless it has grown too long to be a citation.
      if (!final && held.length < HOLD_MAX) break;
      out += held[0];
      held = held.slice(1);
    }
    return out;
  };

  return {
    push(text) {
      held += text;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}
