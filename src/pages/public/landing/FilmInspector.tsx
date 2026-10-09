/**
 * The idea panel shown in the product film when an idea is opened: notes,
 * gathered images, sources, documents and status. Drawn after the app's
 * inspector rail (white sheet, hairline sections, mono section labels,
 * serif title). Everything it shows comes from `PanelState`, so the film
 * script decides what is filled in at each moment.
 *
 * Documents are shown although uploads are still to come; the section
 * carries a "Soon" tag.
 */

import { PdfIcon } from './SceneCanvas';
import { Specimen } from './Specimen';
import type { SpecimenKind } from './Specimen';

export const PANEL_W = 360;

export interface PanelContent {
  /** Short index shown in the panel header, e.g. `F-01`. */
  readonly code: string;
  readonly title: string;
  readonly note: string;
  readonly images: readonly { readonly kind: SpecimenKind; readonly caption: string }[];
  readonly sources: readonly { readonly title: string; readonly site: string; readonly mark: string; readonly color: string }[];
  /** The link pasted into the source field, without `https://`. */
  readonly url: string;
  readonly doc: { readonly name: string; readonly meta: string };
  readonly tags: readonly string[];
}

/** What the product film fills its opened idea with. */
export const FILM_CONTENT: PanelContent = {
  code: 'F-01',
  title: 'PETase breaks down PET',
  note: 'ML-designed FAST-PETase broke down untreated PET plastic in about a week, far faster than the natural enzyme.',
  images: [
    { kind: 'protein', caption: 'AlphaFold model' },
    { kind: 'pocket', caption: 'Active site' },
    { kind: 'film', caption: 'PET film, day 7' },
  ],
  sources: [
    { title: 'Machine learning-aided engineering of hydrolases for PET depolymerization', site: 'nature.com', mark: 'N', color: 'rgb(var(--ink))' },
    { title: 'AlphaFold Protein Structure Database', site: 'alphafold.ebi.ac.uk', mark: 'A', color: 'rgb(var(--topic))' },
  ],
  url: 'nature.com/articles/s41586-022-04599-z',
  doc: { name: 'fast-petase-methods.pdf', meta: '42 pages · 3.1 MB · 6 highlights' },
  tags: ['enzymes', 'protein-ml', 'recycling'],
};

export interface PanelState {
  /** 0 = off stage, 1 = docked. */
  readonly slide: number;
  /** How far the panel body has scrolled, in px. */
  readonly scroll: number;
  readonly saving: boolean;
  readonly noteChars: number;
  readonly noteCaret: boolean;
  /** Reveal of each gathered image. */
  readonly images: readonly number[];
  /** Highlights a drop zone while something is dragged over it. */
  readonly dropTarget: 'images' | 'docs' | null;
  readonly urlChars: number;
  /** Reveal of each source card. */
  readonly sources: readonly number[];
  /** 0 = not yet dropped; then the upload's appear and progress. */
  readonly doc: { readonly appear: number; readonly progress: number };
  readonly verified: number;
  readonly tags: readonly number[];
}

function Label({ children, aside }: { readonly children: string; readonly aside?: string | undefined }): JSX.Element {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">{children}</span>
      {aside && <span className="font-mono text-[9px] text-faint">{aside}</span>}
    </div>
  );
}

function DropZone({ active, label }: { readonly active: boolean; readonly label: string }): JSX.Element {
  return (
    <div
      className="flex items-center justify-center h-[40px] rounded-[2px] font-mono text-[9.5px] uppercase tracking-[0.06em] transition-colors"
      style={{
        border: `1.5px dashed ${active ? 'rgb(var(--topic))' : 'rgb(var(--rule-2))'}`,
        background: active ? 'rgb(var(--topic) / 0.06)' : 'transparent',
        color: active ? 'rgb(var(--topic))' : 'rgb(var(--faint))',
      }}
    >
      {label}
    </div>
  );
}

interface FilmInspectorProps {
  readonly state: PanelState;
  readonly content?: PanelContent;
  readonly width?: number;
}

export function FilmInspector({ state, content = FILM_CONTENT, width = PANEL_W }: FilmInspectorProps): JSX.Element | null {
  if (state.slide <= 0) return null;
  const note = content.note.slice(0, state.noteChars);
  const imagesShown = state.images.filter((p) => p > 0).length;
  const sourcesShown = state.sources.filter((p) => p > 0).length;
  const resolving = state.urlChars > 0 && sourcesShown === 0;

  return (
    <div
      className="absolute top-0 right-0 h-full bg-panel border-l border-ink flex flex-col"
      style={{
        width,
        transform: `translateX(${(1 - state.slide) * (width + 24)}px)`,
        boxShadow: `-18px 0 40px -24px rgb(var(--shadow) / ${0.35 * state.slide})`,
      }}
    >
      {/* Header */}
      <div className="h-10 shrink-0 px-4 flex items-center justify-between border-b border-rule bg-panel relative z-10">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.04em] uppercase text-ink">Idea · {content.code}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted">
            <span className={`w-1.5 h-1.5 rounded-full ${state.saving ? 'bg-muted' : 'bg-accent'}`} />
            {state.saving ? 'Saving…' : 'Saved'}
          </span>
          <span className="w-5 h-5 flex items-center justify-center text-muted font-mono text-[13px]">×</span>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="px-5 pt-5 pb-10 flex flex-col gap-5" style={{ transform: `translateY(${-state.scroll}px)` }}>
          {/* Title */}
          <div className="flex flex-col gap-2">
            <span className="self-start inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-finding">
              <span className="w-1.5 h-1.5 rounded-full bg-finding-fill" />
              Finding
            </span>
            <h4 className="m-0 font-serif text-[24px] font-medium leading-[1.15] text-ink-strong">{content.title}</h4>
          </div>

          {/* Notes */}
          <section>
            <Label>Notes</Label>
            <div className="min-h-[62px] rounded-[2px] border border-rule bg-paper px-3 py-2 font-serif text-[13px] leading-[19px] text-ink">
              {note}
              {state.noteCaret && <span className="lp-caret" />}
              {note.length === 0 && !state.noteCaret && <span className="italic text-faint">Write what you found…</span>}
            </div>
          </section>

          {/* Images */}
          <section>
            <Label aside={imagesShown > 0 ? `${imagesShown} gathered` : undefined}>Images</Label>
            {imagesShown === 0 ? (
              <DropZone active={state.dropTarget === 'images'} label="Drop images here" />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {content.images.map((img, i) => {
                  const p = state.images[i] ?? 0;
                  return (
                    <figure
                      key={img.kind}
                      className="m-0"
                      style={{ opacity: p, transform: `translateY(${(1 - p) * 10}px) scale(${0.85 + 0.15 * p})` }}
                    >
                      <div className="h-[58px] rounded-[2px] overflow-hidden border border-rule">
                        <Specimen kind={img.kind} className="w-full h-full block" />
                      </div>
                      <figcaption className="mt-1 font-mono text-[8px] text-muted truncate">{img.caption}</figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
          </section>

          {/* Sources */}
          <section>
            <Label aside={sourcesShown > 0 ? `${sourcesShown} cited` : undefined}>Sources</Label>
            <div className="flex flex-col gap-1.5">
              {content.sources.map((s, i) => {
                const p = state.sources[i] ?? 0;
                if (p <= 0) return null;
                return (
                  <div
                    key={s.site}
                    className="flex items-center gap-2.5 rounded-[2px] border border-rule px-2.5 py-2"
                    style={{ opacity: p, transform: `translateX(${(1 - p) * 14}px)` }}
                  >
                    <span
                      className="w-6 h-6 shrink-0 rounded-[2px] flex items-center justify-center font-serif text-[13px] text-on-accent"
                      style={{ background: s.color }}
                    >
                      {s.mark}
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="font-serif text-[12.5px] leading-tight text-ink truncate">{s.title}</span>
                      <span className="font-mono text-[8.5px] text-muted truncate">{s.site}</span>
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center h-[30px] rounded-[2px] border border-rule px-2.5 font-mono text-[10px] text-ink">
                <span className="text-faint mr-1.5">↗</span>
                {state.urlChars > 0 ? (
                  <span className="truncate">
                    https://{content.url.slice(0, state.urlChars)}
                    {resolving && <span className="lp-caret" />}
                  </span>
                ) : (
                  <span className="text-faint">Paste a link…</span>
                )}
              </div>
            </div>
          </section>

          {/* Documents */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">Documents</span>
              <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-topic border border-topic rounded-[2px] px-1">
                Soon
              </span>
            </div>
            {state.doc.appear <= 0 ? (
              <DropZone active={state.dropTarget === 'docs'} label="Drop a PDF or doc" />
            ) : (
              <div
                className="flex items-center gap-3 rounded-[2px] border border-rule px-3 py-2.5"
                style={{ opacity: state.doc.appear, transform: `scale(${0.94 + 0.06 * state.doc.appear})` }}
              >
                <PdfIcon size={26} />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10.5px] text-ink truncate">{content.doc.name}</div>
                  {state.doc.progress < 1 ? (
                    <div className="mt-1.5 h-[3px] bg-rule rounded-full overflow-hidden">
                      <div className="h-full lp-gradient-bar" style={{ width: `${state.doc.progress * 100}%` }} />
                    </div>
                  ) : (
                    <div className="mt-0.5 font-mono text-[8.5px] text-muted">{content.doc.meta}</div>
                  )}
                </div>
                <span className="font-mono text-[9px] text-muted tabular-nums">
                  {state.doc.progress < 1 ? `${Math.round(state.doc.progress * 100)}%` : '✓'}
                </span>
              </div>
            )}
          </section>

          {/* Status & tags */}
          <section>
            <Label>Status</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 h-6 px-2 rounded-[2px] font-mono text-[9.5px] uppercase tracking-[0.04em]"
                style={{
                  border: `1px solid ${state.verified > 0.5 ? 'rgb(var(--finding))' : 'rgb(var(--rule-2))'}`,
                  background: state.verified > 0.5 ? 'rgb(var(--finding))' : 'rgb(var(--panel))',
                  color: state.verified > 0.5 ? 'rgb(var(--panel))' : 'rgb(var(--faint))',
                  transform: `scale(${1 + Math.sin(state.verified * Math.PI) * 0.08})`,
                }}
              >
                {state.verified > 0.5 ? '✓' : '○'} Verified
              </span>
              {content.tags.map((tag, i) => {
                const p = state.tags[i] ?? 0;
                return p > 0 ? (
                  <span
                    key={tag}
                    className="inline-flex items-center h-6 px-2 rounded-[2px] border border-rule bg-sunken font-mono text-[9.5px] text-ink-2"
                    style={{ opacity: p, transform: `scale(${0.8 + 0.2 * p})` }}
                  >
                    #{tag}
                  </span>
                ) : null;
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
