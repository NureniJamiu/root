/**
 * The "Source" part of the idea editor: where an idea came from, for
 * citations. Starts folded behind "Add a source" when the idea has none.
 *
 * Works on the editor's draft and keeps what is typed as typed (blank lines
 * in the author list, half-written dates); `cleanSource` tidies it on save.
 */

import { useState } from 'react';

import type { Source, SourceKind } from '../data';
import { SOURCE_QUOTE_MAX, SOURCE_TEXT_MAX, SOURCE_URL_MAX } from '../data';

const KINDS: ReadonlyArray<{ readonly kind: SourceKind; readonly label: string }> = [
  { kind: 'web', label: 'Web page' },
  { kind: 'article', label: 'Article' },
  { kind: 'book', label: 'Book' },
  { kind: 'report', label: 'Report' },
  { kind: 'other', label: 'Other' },
];

const CONTAINER_LABEL: Record<SourceKind, string> = {
  web: 'Website',
  article: 'Journal or publication',
  book: 'Publisher',
  report: 'Organisation',
  other: 'Published in',
};

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Today as YYYY-MM-DD, in the reader's own time zone. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface SourceFieldsProps {
  readonly source: Source | null;
  readonly onChange: (source: Source | null) => void;
  readonly labelClass: string;
  readonly inputClass: string;
}

export function SourceFields({ source, onChange, labelClass, inputClass }: SourceFieldsProps): JSX.Element {
  const [open, setOpen] = useState(source !== null);

  if (!open) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Source</span>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            if (!source) onChange({ kind: 'web' });
          }}
          className="self-start h-8 px-3 font-mono text-[11px] text-ink bg-panel border border-dashed border-rule-strong rounded-[2px] hover:border-ink-strong transition-colors cursor-pointer"
          data-testid="node-editor-add-source"
        >
          + Add a source
        </button>
      </div>
    );
  }

  const s: Source = source ?? { kind: 'web' };
  const set = (patch: Partial<Source>): void => onChange({ ...s, ...patch });
  const field = (key: 'title' | 'container' | 'doi', label: string, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[9.5px] text-muted">{label}</span>
      <input
        type="text"
        value={s[key] ?? ''}
        onChange={(e) => set({ [key]: e.target.value })}
        maxLength={SOURCE_TEXT_MAX}
        placeholder={placeholder}
        className={`${inputClass} h-9 px-2.5 font-serif text-[14px]`}
        data-testid={`node-editor-source-${key}`}
      />
    </label>
  );
  const dateInvalid = !!s.published && !DATE.test(s.published.trim());

  return (
    <div className="flex flex-col gap-2" data-testid="node-editor-source">
      <span className="flex items-center justify-between">
        <span className={labelClass}>Source</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className="font-mono text-[10px] text-muted hover:text-danger cursor-pointer"
          data-testid="node-editor-remove-source"
        >
          Remove source
        </button>
      </span>

      <div className="flex flex-col gap-2.5 p-3 border border-rule rounded-[3px] bg-panel-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Kind of source">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => set({ kind: k.kind })}
              aria-pressed={s.kind === k.kind}
              className={`h-7 px-2.5 rounded-[2px] border font-mono text-[10.5px] cursor-pointer transition-colors ${
                s.kind === k.kind ? 'bg-panel border-ink-strong text-ink-strong' : 'border-rule text-ink-3 hover:text-ink-strong'
              }`}
              data-testid={`node-editor-source-kind-${k.kind}`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-muted">Web address</span>
          <input
            type="url"
            value={s.url ?? ''}
            onChange={(e) => {
              const url = e.target.value;
              // Note when a web page was read, the first time it is linked.
              set({ url, ...(url.trim() && !s.accessed && s.kind === 'web' ? { accessed: today() } : {}) });
            }}
            maxLength={SOURCE_URL_MAX}
            placeholder="https://"
            className={`${inputClass} h-9 px-2.5 font-mono text-[12px]`}
            data-testid="node-editor-source-url"
          />
        </label>

        {field('title', 'Title', 'Title of the page, article or book')}

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-muted">Authors, one per line</span>
          <textarea
            value={(s.authors ?? []).join('\n')}
            onChange={(e) => set({ authors: e.target.value.split('\n') })}
            rows={2}
            placeholder={'Ada Lovelace\nWorld Health Organization'}
            className={`${inputClass} px-2.5 py-1.5 font-serif text-[14px] leading-[20px] resize-y`}
            data-testid="node-editor-source-authors"
          />
        </label>

        <div className="grid grid-cols-[1fr_140px] gap-2">
          {field('container', CONTAINER_LABEL[s.kind], s.kind === 'web' ? 'BBC News' : '')}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9.5px] text-muted">Published</span>
            <input
              type="text"
              value={s.published ?? ''}
              onChange={(e) => set({ published: e.target.value })}
              placeholder="2024-03-18"
              aria-invalid={dateInvalid}
              className={`${inputClass} h-9 px-2.5 font-mono text-[12px] ${dateInvalid ? 'border-danger' : ''}`}
              data-testid="node-editor-source-published"
            />
          </label>
        </div>
        {dateInvalid && (
          <span className="font-mono text-[10px] text-danger -mt-1" role="alert">
            Use a year, or year-month-day: 2024 or 2024-03-18.
          </span>
        )}

        {s.kind !== 'web' && field('doi', 'DOI', '10.1000/xyz123')}

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-muted">Quote</span>
          <textarea
            value={s.quote ?? ''}
            onChange={(e) => set({ quote: e.target.value })}
            maxLength={SOURCE_QUOTE_MAX}
            rows={2}
            placeholder="The passage this idea comes from"
            className={`${inputClass} px-2.5 py-1.5 font-serif italic text-[14px] leading-[20px] resize-y`}
            data-testid="node-editor-source-quote"
          />
        </label>
      </div>
    </div>
  );
}
