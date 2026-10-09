/**
 * "How it works": a pinned, full-width canvas scrubbed by the scroll
 * position. Five steps: plant a root, branch out, name what each idea is,
 * open an idea and fill it (notes, images, sources, documents), then fold a
 * branch and focus.
 *
 * On wide screens the canvas runs edge to edge under a floating step card,
 * and the idea panel docks on the right exactly as it does in the app. On
 * phones the step text sits above a framed canvas. With reduced motion the
 * section is not pinned: the steps read as a list beside a finished canvas.
 */

import { useLayoutEffect, useRef, useState } from 'react';

import { FilmInspector } from './FilmInspector';
import type { PanelContent, PanelState } from './FilmInspector';
import {
  clamp01,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  lerp,
  range,
  usePrefersReducedMotion,
  useScrollProgress,
} from './motion';
import { CARD_H, CARD_W, SceneCanvas } from './SceneCanvas';
import type { IdeaType, SceneCamera, SceneEdge, SceneFrame, SceneNode } from './SceneCanvas';

interface Step {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
}

const STEPS: readonly Step[] = [
  {
    kicker: 'Plant a root',
    title: 'Start with one idea.',
    body: 'Double-click the canvas and name the thing you are thinking about. That card is the root everything else grows from.',
  },
  {
    kicker: 'Branch out',
    title: 'Branch in any direction.',
    body: 'Press + on any card to add a connected idea. Connectors draw themselves, so the shape of your thinking is always in view.',
  },
  {
    kicker: 'Name it',
    title: 'Say what each idea is.',
    body: 'Mark ideas as topics, findings, questions or conclusions. Colour does the reading for you: open questions stand out at a glance.',
  },
  {
    kicker: 'Open an idea',
    title: 'Keep the evidence inside the idea.',
    body: 'Open any card to write notes, drop in images, cite sources and attach documents. What you gather stays with the point it supports.',
  },
  {
    kicker: 'Focus',
    title: 'Fold away the noise.',
    body: 'Collapse a branch you are done with, then walk through the rest one idea at a time when it is time to present.',
  },
];

/** Scroll progress where each step begins (the last entry closes the final step). */
const STEP_AT: readonly number[] = [0, 0.18, 0.38, 0.55, 0.83, 1];

function stepIndex(p: number): number {
  let index = 0;
  STEP_AT.slice(0, -1).forEach((at, i) => {
    if (p >= at) index = i;
  });
  return index;
}

/** 0..1 through the given step. */
function stepProgress(p: number, i: number): number {
  return range(p, STEP_AT[i] ?? 0, STEP_AT[i + 1] ?? 1);
}

/* -------------------------------------------------------------------------- */
/* Cast                                                                       */
/* -------------------------------------------------------------------------- */

interface StoryNode {
  readonly id: string;
  readonly type: IdeaType;
  readonly title: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly parent?: string;
  /** Scroll progress where the card appears. */
  readonly at: number;
  /** Scroll progress where its type colour comes in. */
  readonly tintAt: number;
}

const CAST: readonly StoryNode[] = [
  { id: 'r', type: 'topic', title: 'Launch video', label: 'T-01', x: 24, y: 236, at: 0.03, tintAt: 0.4 },
  { id: 'a', type: 'finding', title: 'Viewers drop at 0:08', label: 'F-01', x: 258, y: 70, at: 0.2, parent: 'r', tintAt: 0.43 },
  { id: 'b', type: 'question', title: 'What is the hook?', label: 'Q-01', x: 258, y: 236, at: 0.245, parent: 'r', tintAt: 0.46 },
  { id: 'c', type: 'topic', title: 'Script beats', label: 'T-02', x: 258, y: 392, at: 0.29, parent: 'r', tintAt: 0.49 },
  { id: 'a1', type: 'finding', title: 'Retention graph', label: 'F-02', x: 478, y: 14, at: 0.33, parent: 'a', tintAt: 0.44 },
  { id: 'a2', type: 'finding', title: 'Comment themes', label: 'F-03', x: 478, y: 118, at: 0.35, parent: 'a', tintAt: 0.45 },
  { id: 'k', type: 'conclusion', title: 'Lead with the demo', label: 'C-01', x: 478, y: 300, at: 0.5, parent: 'b', tintAt: 0.5 },
];

const BY_ID = new Map(CAST.map((n) => [n.id, n]));
const FOLDED = new Set(['a1', 'a2']);
const FOLD = { start: 0.85, end: 0.9 } as const;
const FOCUS = { start: 0.92, end: 0.98, id: 'k' } as const;
const OPENED = 'a';
const TREE = { x: 346, y: 245, w: 680, h: 480 } as const;

const STORY_CONTENT: PanelContent = {
  code: 'F-01',
  title: 'Viewers drop at 0:08',
  note: 'Retention falls hard in the first eight seconds. The cold open is too slow: the product only shows up at 0:21.',
  images: [
    { kind: 'chart', caption: 'Retention graph' },
    { kind: 'frame', caption: 'Cold open, 0:04' },
    { kind: 'board', caption: 'Storyboard v2' },
  ],
  sources: [
    { title: 'Audience retention, last five uploads', site: 'studio.youtube.com', mark: '▶', color: 'rgb(var(--question))' },
    { title: 'Team notes: competitor launch videos', site: 'notion.so', mark: 'N', color: 'rgb(var(--ink))' },
  ],
  url: 'studio.youtube.com/analytics/retention',
  doc: { name: 'launch-script-v2.pdf', meta: '6 pages · 210 KB · 3 comments' },
  tags: ['hook', 'retention', 'v2'],
};

/* -------------------------------------------------------------------------- */
/* Frame                                                                      */
/* -------------------------------------------------------------------------- */

const PANEL = { open: 0.555, openEnd: 0.59, close: 0.8, closeEnd: 0.83 } as const;
const IMAGE_AT: readonly number[] = [0.65, 0.662, 0.674];
const SOURCE_AT: readonly number[] = [0.708, 0.72];
const TAG_AT: readonly number[] = [0.782, 0.787, 0.792];
const THUMB_H = 40;

const pop = (p: number, at: number, dur = 0.012): number => easeOutCubic(range(p, at, at + dur));

/** Where the stage is, in logical units: its size, how much of the left the step card covers, the panel width. */
export interface StoryLayout {
  readonly w: number;
  readonly h: number;
  readonly left: number;
  readonly panelW: number;
  /** The panel scrolls on short stages so every section gets seen. */
  readonly scrollPanel: boolean;
}

function panelAt(p: number, layout: StoryLayout): PanelState {
  const scrollKeys: readonly [number, number][] = layout.scrollPanel
    ? [[0.69, 0], [0.7, 120], [0.733, 120], [0.743, 260], [0.774, 260], [0.78, 330]]
    : [[0, 0]];
  let scroll = 0;
  for (let i = 0; i < scrollKeys.length; i += 1) {
    const [at, v] = scrollKeys[i] as [number, number];
    const next = scrollKeys[i + 1];
    if (p >= at) scroll = next ? lerp(v, next[1], easeInOutCubic(range(p, at, next[0]))) : v;
  }
  const note = STORY_CONTENT.note;
  const noteChars = Math.round(note.length * range(p, 0.59, 0.645));
  return {
    slide: easeOutCubic(range(p, PANEL.open, PANEL.openEnd)) * (1 - easeInOutCubic(range(p, PANEL.close, PANEL.closeEnd))),
    scroll,
    saving: p > 0.59 && p < 0.79,
    noteChars,
    noteCaret: p > 0.585 && p < 0.65,
    images: IMAGE_AT.map((at) => pop(p, at)),
    dropTarget: p > 0.64 && p < 0.65 ? 'images' : p > 0.728 && p < 0.735 ? 'docs' : null,
    urlChars: Math.round(STORY_CONTENT.url.length * range(p, 0.69, 0.706)),
    sources: SOURCE_AT.map((at) => pop(p, at)),
    doc: { appear: pop(p, 0.735, 0.008), progress: easeInOutCubic(range(p, 0.74, 0.77)) },
    verified: range(p, 0.775, 0.78),
    tags: TAG_AT.map((at) => pop(p, at, 0.006)),
  };
}

/** Camera that puts world point (fx, fy) at stage point (sx, sy). */
function aim(layout: StoryLayout, fx: number, fy: number, sx: number, sy: number, zoom: number): SceneCamera {
  return { x: fx - (sx - layout.w / 2) / zoom, y: fy - (sy - layout.h / 2) / zoom, zoom };
}

function mixCam(a: SceneCamera, b: SceneCamera, t: number): SceneCamera {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), zoom: lerp(a.zoom, b.zoom, t) };
}

export function storyFrame(p: number, layout: StoryLayout): SceneFrame & { readonly panel: PanelState } {
  const fold = easeInOutCubic(range(p, FOLD.start, FOLD.end));
  const focus = easeInOutCubic(range(p, FOCUS.start, FOCUS.end));
  const panel = panelAt(p, layout);
  const grow = easeInOutCubic(range(p, IMAGE_AT[0] as number, (IMAGE_AT[2] as number) + 0.015));

  const nodes: SceneNode[] = CAST.map((n) => {
    const parent = n.parent ? BY_ID.get(n.parent) : undefined;
    const f = FOLDED.has(n.id) ? fold : 0;
    const appear = range(p, n.at, n.at + 0.03);
    const typing = n.id === 'r' ? range(p, 0.06, 0.13) : 1;
    const isOpened = n.id === OPENED;
    const images = panel.images.filter((v) => v > 0.5).length;
    const sources = panel.sources.filter((v) => v > 0.5).length;
    const docs = panel.doc.progress >= 1 ? 1 : 0;
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      label: n.label,
      x: parent ? lerp(n.x, parent.x, f) : n.x,
      y: parent ? lerp(n.y, parent.y, f) : n.y,
      h: isOpened ? CARD_H + THUMB_H * grow : CARD_H,
      opacity: easeOutCubic(appear) * (1 - f),
      scale: (0.86 + 0.14 * easeOutBack(appear)) * (1 - 0.35 * f),
      titleChars: Math.round(n.title.length * typing),
      caret: n.id === 'r' && typing > 0 && typing < 1,
      tint: easeOutCubic(range(p, n.tintAt, n.tintAt + 0.04)),
      dim: Math.max(n.id === FOCUS.id ? 0 : focus, isOpened ? 0 : panel.slide * 0.6),
      focus: n.id === FOCUS.id ? focus : isOpened ? panel.slide : 0,
      badge: n.id === 'a' && fold > 0.6 ? '+2 hidden' : undefined,
      plus: n.id === 'r' ? range(p, 0.17, 0.2) * (1 - range(p, 0.3, 0.33)) : 0,
      thumbs: isOpened && grow > 0 ? STORY_CONTENT.images.map((img, i) => ({ kind: img.kind, p: panel.images[i] ?? 0 })) : undefined,
      attach: isOpened && images + sources + docs > 0 ? { images, sources, docs } : undefined,
    };
  });

  const edges: SceneEdge[] = CAST.filter((n) => n.parent).map((n) => ({
    id: `${n.parent}-${n.id}`,
    from: n.parent as string,
    to: n.id,
    progress: easeOutCubic(range(p, n.at - 0.005, n.at + 0.04)),
    opacity: FOLDED.has(n.id) ? 1 - fold : 1,
  }));

  // Camera: close on the root while it is alone, pull back to the whole
  // tree, slide the opened card into the space left of the panel, then
  // push in on the conclusion.
  const free = layout.w - layout.left;
  const midX = layout.left + free / 2;
  const midY = layout.h / 2;
  const overviewZoom = Math.min(1.35, Math.max(0.55, (free - 80) / TREE.w), (layout.h - 80) / TREE.h);
  const overview = aim(layout, TREE.x, TREE.y, midX, midY, overviewZoom);
  const root = BY_ID.get('r') as StoryNode;
  const intro = aim(layout, root.x + CARD_W / 2, root.y + CARD_H / 2, midX, midY, Math.min(1.7, overviewZoom * 1.45));
  const opened = BY_ID.get(OPENED) as StoryNode;
  const openFree = layout.w - layout.panelW - layout.left;
  const openZoom = Math.min(1.3, Math.max(0.8, (openFree - 60) / (CARD_W * 1.9)));
  const openCam = aim(
    layout,
    opened.x + CARD_W / 2,
    opened.y + (CARD_H + THUMB_H) / 2,
    layout.left + Math.max(openFree, 220) / 2,
    midY,
    openZoom,
  );
  const k = BY_ID.get(FOCUS.id) as StoryNode;
  const focusCam = aim(layout, k.x + CARD_W / 2, k.y + CARD_H / 2, midX, midY, Math.min(1.8, overviewZoom * 1.6));

  let camera = mixCam(intro, overview, easeInOutCubic(range(p, 0.16, 0.3)));
  camera = mixCam(camera, openCam, easeInOutCubic(range(p, PANEL.open - 0.01, PANEL.openEnd + 0.01)));
  camera = mixCam(camera, overview, easeInOutCubic(range(p, PANEL.close, PANEL.closeEnd + 0.01)));
  camera = mixCam(camera, focusCam, focus);

  return { nodes, edges, camera, panel };
}

/* -------------------------------------------------------------------------- */
/* Section                                                                    */
/* -------------------------------------------------------------------------- */

export function ScrollStory(): JSX.Element {
  const reduced = usePrefersReducedMotion();
  return reduced ? <StoryStill /> : <StoryPinned />;
}

/** Live size of an element. */
function useSize(ref: React.RefObject<HTMLElement>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = (): void => setSize({ w: el.clientWidth, h: el.clientHeight });
    apply();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const STAGE_H = 900;
const PANEL_W = 400;
/** The step card's width and inset, in CSS pixels (wide screens). */
const CARD_PX = 400;
const CARD_INSET_PX = 40;

const MOBILE_LAYOUT: StoryLayout = { w: 760, h: 620, left: 0, panelW: 330, scrollPanel: true };

function StepCard({ p, active }: { readonly p: number; readonly active: number }): JSX.Element {
  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">How it works</p>
        <p className="font-mono text-[11px] tabular-nums text-muted">
          <span className="text-ink">0{active + 1}</span> / 0{STEPS.length}
        </p>
      </div>

      <div className="relative min-h-[230px] md:min-h-[220px]">
        {STEPS.map((s, i) => (
          <div
            key={s.kicker}
            className="lp-step absolute inset-0"
            data-state={i === active ? 'active' : i < active ? 'past' : 'next'}
            aria-hidden={i !== active}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-topic mb-3">{s.kicker}</p>
            <h3 className="font-serif font-light text-ink text-[32px] md:text-[40px] leading-[1.06] tracking-[-0.02em] mb-4">
              {s.title}
            </h3>
            <p className="font-serif text-[16px] md:text-[17px] leading-[1.6] text-ink-2">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s.kicker} className="relative h-[3px] flex-1 rounded-[1px] bg-sunken-3 overflow-hidden">
            <span
              className="absolute inset-y-0 left-0 w-full origin-left lp-gradient-bar"
              style={{ transform: `scaleX(${i < active ? 1 : i === active ? clamp01(stepProgress(p, i)) : 0})` }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function StoryPinned(): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const p = useScrollProgress(ref, { mode: 'pin' });
  const active = stepIndex(p);
  const size = useSize(stageRef);

  // Wide screens: a full-bleed stage, 900 logical units tall, as wide as the window.
  const wide = size.w >= 768 && size.h > 0;
  const scale = wide ? size.h / STAGE_H : 1;
  const cardLeftPx = Math.max(CARD_INSET_PX, (size.w - 1360) / 2 + CARD_INSET_PX);
  const layout: StoryLayout = wide
    ? {
        w: size.w / scale,
        h: STAGE_H,
        left: (cardLeftPx + CARD_PX + 32) / scale,
        panelW: PANEL_W,
        scrollPanel: false,
      }
    : MOBILE_LAYOUT;
  const frame = storyFrame(p, layout);

  return (
    <section ref={ref} id="how-it-works" className="relative border-y border-rule" style={{ height: '620vh' }}>
      <div className="sticky top-0 h-screen overflow-hidden bg-canvas">
        {/* Wide: the canvas fills everything below the header. */}
        <div ref={stageRef} className="absolute inset-x-0 top-16 bottom-0 hidden md:block">
          {wide && (
            <SceneCanvas
              frame={frame}
              width={layout.w}
              height={layout.h}
              idPrefix="story"
              fill={{ scale }}
              overlay={<FilmInspector state={frame.panel} content={STORY_CONTENT} width={layout.panelW} />}
            />
          )}
          {/* Soft edges so the grid melts into the page. */}
          <div className="absolute inset-y-0 left-0 w-24 pointer-events-none bg-gradient-to-r from-canvas to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none bg-gradient-to-t from-canvas to-transparent" />

          <div
            className="absolute top-1/2 -translate-y-1/2 bg-panel/90 backdrop-blur-sm border border-ink rounded-[4px] p-8"
            style={{ left: cardLeftPx, width: CARD_PX }}
          >
            <StepCard p={p} active={active} />
          </div>

          <div
            className="absolute bottom-5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted"
            style={{ left: cardLeftPx }}
          >
            Canvas · Launch video · <span className="tabular-nums">{Math.round(p * 100)}%</span>
          </div>
        </div>

        {/* Phones: step text over a framed canvas. */}
        <div className="md:hidden h-full flex flex-col justify-center gap-6 px-5 pt-16 pb-6">
          <StepCard p={p} active={active} />
          <div className="relative border border-ink rounded-[4px] overflow-hidden bg-canvas">
            {!wide && (
              <SceneCanvas
                frame={frame}
                width={MOBILE_LAYOUT.w}
                height={MOBILE_LAYOUT.h}
                idPrefix="story-m"
                overlay={<FilmInspector state={frame.panel} content={STORY_CONTENT} width={MOBILE_LAYOUT.panelW} />}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryStill(): JSX.Element {
  const frame = storyFrame(0.79, MOBILE_LAYOUT);
  return (
    <section id="how-it-works" className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6 md:px-8 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-8">How it works</p>
          <ol className="flex flex-col gap-7">
            {STEPS.map((s, i) => (
              <li key={s.kicker}>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-topic mb-2">
                  0{i + 1} · {s.kicker}
                </p>
                <h3 className="font-serif font-light text-[26px] leading-tight text-ink mb-2">{s.title}</h3>
                <p className="font-serif text-[16px] leading-[1.6] text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="border border-ink rounded-[4px] overflow-hidden bg-canvas">
          <SceneCanvas
            frame={frame}
            width={MOBILE_LAYOUT.w}
            height={MOBILE_LAYOUT.h}
            idPrefix="story"
            overlay={<FilmInspector state={frame.panel} content={STORY_CONTENT} width={MOBILE_LAYOUT.panelW} />}
          />
        </div>
      </div>
    </section>
  );
}
