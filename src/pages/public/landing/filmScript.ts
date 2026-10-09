/**
 * The product film's script: a pure function from time (ms) to a frame.
 *
 * The story it tells, on a 960 × 540 stage:
 *   1. a blank canvas and a title card;
 *   2. a cursor plants the root idea "Plastic-eating enzymes" and types its title;
 *   3. ideas branch off one by one, each connector drawing itself;
 *   4. "PETase breaks down PET" is opened: the idea panel slides in and fills up
 *      with notes, dropped-in images, cited sources, an uploaded PDF, a
 *      verified status and tags, while the card on the canvas grows with it;
 *   5. back on the canvas, more findings are gathered with their own
 *      images and sources, and a conclusion is connected by hand;
 *   6. a walkthrough moves the camera from idea to idea;
 *   7. an end card, then the film loops.
 *
 * Cursor positions are worked out in stage coordinates. While the cursor
 * is on the canvas its keys are in world coordinates and follow the camera;
 * while it works in the idea panel they are in stage coordinates.
 */

import { FILM_CONTENT } from './FilmInspector';
import type { PanelState } from './FilmInspector';
import { easeInOutCubic, easeOutBack, easeOutCubic, lerp, range } from './motion';
import { CARD_H, CARD_W } from './SceneCanvas';
import type { IdeaType, SceneCamera, SceneEdge, SceneFrame, SceneNode, SceneRipple } from './SceneCanvas';
import type { SpecimenKind } from './Specimen';

const NOTE_TEXT = FILM_CONTENT.note;
const SOURCE_URL = FILM_CONTENT.url;
const PANEL_IMAGES = FILM_CONTENT.images;

export const FILM_WIDTH = 960;
export const FILM_HEIGHT = 540;
export const FILM_DURATION = 33600;

export interface Chapter {
  readonly at: number;
  readonly label: string;
}

export const CHAPTERS: readonly Chapter[] = [
  { at: 0, label: 'Open a canvas' },
  { at: 1800, label: 'Plant a root' },
  { at: 4000, label: 'Branch out' },
  { at: 6600, label: 'Open an idea' },
  { at: 8200, label: 'Take notes' },
  { at: 10500, label: 'Gather images' },
  { at: 12400, label: 'Cite sources' },
  { at: 15100, label: 'Attach documents' },
  { at: 17900, label: 'Verify & tag' },
  { at: 20900, label: 'Gather as you go' },
  { at: 25500, label: 'Walk through it' },
  { at: 30600, label: 'Root' },
];

export function chapterAt(t: number): number {
  let index = 0;
  CHAPTERS.forEach((c, i) => {
    if (t >= c.at) index = i;
  });
  return index;
}

/** A moment worth showing when the film is not playing: the idea panel, full. */
export const POSTER_TIME = 19700;

/* -------------------------------------------------------------------------- */
/* Cast                                                                       */
/* -------------------------------------------------------------------------- */

interface CastNode {
  readonly id: string;
  readonly type: IdeaType;
  readonly title: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  /** When the card pops in. */
  readonly at: number;
  readonly parent?: string;
}

const CAST: readonly CastNode[] = [
  { id: 'a', type: 'topic', title: 'Plastic-eating enzymes', label: 'T-01', x: 40, y: 226, at: 2500 },
  { id: 'b', type: 'finding', title: 'PETase breaks down PET', label: 'F-01', x: 330, y: 70, at: 4400, parent: 'a' },
  { id: 'c', type: 'question', title: 'Can it scale to industry?', label: 'Q-01', x: 330, y: 226, at: 5000, parent: 'a' },
  { id: 'd', type: 'finding', title: 'AlphaFold predicts the fold', label: 'F-02', x: 330, y: 382, at: 5600, parent: 'a' },
  { id: 'f', type: 'finding', title: 'Five ML-picked mutations', label: 'F-03', x: 620, y: 20, at: 21300, parent: 'b' },
  { id: 'g', type: 'conclusion', title: 'AI shortens enzyme design', label: 'C-01', x: 620, y: 215, at: 23300, parent: 'c' },
  { id: 'e', type: 'finding', title: 'Active site mapped', label: 'F-04', x: 620, y: 400, at: 22000, parent: 'd' },
];

const CAST_BY_ID = new Map(CAST.map((n) => [n.id, n]));

/** The connector dragged by hand from "AlphaFold predicts the fold" into the conclusion. */
const DRAG_EDGE = { from: 'd', to: 'g', start: 23700, end: 24300 } as const;

const THUMB_H = 40;

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

const TYPE_START = 2700;
const TYPE_STEP = 55;

const PANEL = { open: 7350, openEnd: 7850, close: 20150, closeEnd: 20600 } as const;
const NOTES = { start: 8450, step: 16 } as const;
const IMAGE_DROP = 11800;
const IMAGE_AT: readonly number[] = [11850, 12000, 12150];
const URL_TYPE = { start: 13150, step: 22 } as const;
const SOURCE_AT: readonly number[] = [14100, 14700];
const DOC = { drop: 16700, progressStart: 16800, progressEnd: 17900 } as const;
const VERIFY_AT = 18600;
const TAG_AT: readonly number[] = [19000, 19200, 19400];

const SCROLL_KEYS: readonly { t: number; v: number }[] = [
  { t: 0, v: 0 },
  { t: 12500, v: 0 },
  { t: 12900, v: 120 },
  { t: 15100, v: 120 },
  { t: 15500, v: 260 },
  { t: 18000, v: 260 },
  { t: 18300, v: 330 },
];

const SAVING: readonly [number, number][] = [
  [8450, 10500],
  [11800, 12400],
  [13150, 14900],
  [16700, 17950],
  [18600, 19600],
];

const WALK = { start: 25600, end: 30200 } as const;
const WALK_STOPS: readonly { readonly id: string; readonly at: number }[] = [
  { id: 'a', at: 25800 },
  { id: 'b', at: 27200 },
  { id: 'g', at: 28600 },
];

const END_CARD = { start: 30600, fadeOut: 33200 } as const;

const HOME: SceneCamera = { x: 425, y: 252, zoom: 1 };
/** While the panel is open, the opened card sits in the middle of what is left of the canvas. */
const OPEN_CAM: SceneCamera = { x: 575, y: 175, zoom: 1.2 };

type Space = 'w' | 's';
const CURSOR_KEYS: readonly { t: number; x: number; y: number; s: Space }[] = [
  { t: 0, x: 900, y: 520, s: 'w' },
  { t: 1700, x: 900, y: 520, s: 'w' },
  { t: 2300, x: 135, y: 270, s: 'w' },
  { t: 3600, x: 135, y: 270, s: 'w' },
  { t: 4200, x: 231, y: 270, s: 'w' },
  { t: 5800, x: 231, y: 270, s: 'w' },
  { t: 6900, x: 425, y: 114, s: 'w' },
  { t: 7350, x: 425, y: 114, s: 'w' },
  // Into the panel: notes
  { t: 8200, x: 780, y: 195, s: 's' },
  { t: 10500, x: 780, y: 195, s: 's' },
  // Fetch images from the desktop and drop them in
  { t: 10900, x: 300, y: 470, s: 's' },
  { t: 11000, x: 300, y: 470, s: 's' },
  { t: 11700, x: 780, y: 306, s: 's' },
  { t: 12550, x: 780, y: 306, s: 's' },
  // Paste a source link
  { t: 12950, x: 760, y: 310, s: 's' },
  { t: 15000, x: 760, y: 310, s: 's' },
  // Fetch a PDF and drop it in
  { t: 15800, x: 320, y: 480, s: 's' },
  { t: 15900, x: 320, y: 480, s: 's' },
  { t: 16600, x: 780, y: 375, s: 's' },
  { t: 17900, x: 780, y: 375, s: 's' },
  // Verify, then close
  { t: 18450, x: 659, y: 409, s: 's' },
  { t: 19600, x: 659, y: 409, s: 's' },
  { t: 19950, x: 937, y: 20, s: 's' },
  { t: 20200, x: 937, y: 20, s: 's' },
  // Back on the canvas: gather more
  { t: 21000, x: 521, y: 154, s: 'w' },
  { t: 21300, x: 521, y: 154, s: 'w' },
  { t: 21700, x: 521, y: 426, s: 'w' },
  { t: 22300, x: 521, y: 426, s: 'w' },
  { t: 22900, x: 521, y: 270, s: 'w' },
  { t: 23350, x: 521, y: 270, s: 'w' },
  { t: 23600, x: 521, y: 426, s: 'w' },
  { t: 24300, x: 620, y: 259, s: 'w' },
  { t: 24900, x: 620, y: 259, s: 'w' },
  { t: 25500, x: 920, y: 520, s: 'w' },
];

const CLICKS: readonly number[] = [2400, 4300, 4900, 5500, 7100, 7250, 8300, 13000, 18600, 20100, 21200, 21900, 23200];
const CARRY: readonly { start: number; end: number; what: 'images' | 'pdf' }[] = [
  { start: 11000, end: IMAGE_DROP, what: 'images' },
  { start: 15900, end: DOC.drop, what: 'pdf' },
];
const CURSOR_SHOWN = { start: 1700, end: 25500 } as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function interpolateKeys<K extends { t: number }>(keys: readonly K[], t: number, pick: (k: K) => number): number {
  const first = keys[0] as K;
  if (t <= first.t) return pick(first);
  for (let i = 1; i < keys.length; i += 1) {
    const a = keys[i - 1] as K;
    const b = keys[i] as K;
    if (t <= b.t) return lerp(pick(a), pick(b), easeInOutCubic(range(t, a.t, b.t)));
  }
  return pick(keys[keys.length - 1] as K);
}

const pop = (t: number, at: number, dur = 300): number => easeOutCubic(range(t, at, at + dur));

function toStage(cam: SceneCamera, x: number, y: number): { x: number; y: number } {
  return { x: FILM_WIDTH / 2 + (x - cam.x) * cam.zoom, y: FILM_HEIGHT / 2 + (y - cam.y) * cam.zoom };
}

/** How tall a card is at time t (cards with images grow). */
function heightOf(id: string, t: number): number {
  if (id === 'b') return CARD_H + THUMB_H * easeInOutCubic(range(t, IMAGE_AT[0] as number, IMAGE_DROP + 500));
  if (id === 'f') return CARD_H + THUMB_H * easeInOutCubic(range(t, 21500, 21900));
  return CARD_H;
}

function cameraAt(t: number): SceneCamera {
  const keys: { t: number; x: number; y: number; zoom: number }[] = [
    { t: PANEL.open - 50, ...HOME },
    { t: PANEL.open + 750, ...OPEN_CAM },
    { t: PANEL.close, ...OPEN_CAM },
    { t: PANEL.close + 750, ...HOME },
    { t: WALK.start, ...HOME },
  ];
  for (const stop of WALK_STOPS) {
    const n = CAST_BY_ID.get(stop.id) as CastNode;
    const cam = { x: n.x + CARD_W / 2, y: n.y + heightOf(n.id, t) / 2, zoom: 1.5 };
    keys.push({ t: stop.at + 550, ...cam }, { t: stop.at + 1300, ...cam });
  }
  keys.push({ t: WALK.end + 400, ...HOME });
  return {
    x: interpolateKeys(keys, t, (k) => k.x),
    y: interpolateKeys(keys, t, (k) => k.y),
    zoom: interpolateKeys(keys, t, (k) => k.zoom),
  };
}

function cursorAt(t: number, cam: SceneCamera): { x: number; y: number } {
  const place = (k: (typeof CURSOR_KEYS)[number]): { x: number; y: number } =>
    k.s === 's' ? { x: k.x, y: k.y } : toStage(cam, k.x, k.y);
  const first = CURSOR_KEYS[0] as (typeof CURSOR_KEYS)[number];
  if (t <= first.t) return place(first);
  for (let i = 1; i < CURSOR_KEYS.length; i += 1) {
    const a = CURSOR_KEYS[i - 1] as (typeof CURSOR_KEYS)[number];
    const b = CURSOR_KEYS[i] as (typeof CURSOR_KEYS)[number];
    if (t <= b.t) {
      const e = easeInOutCubic(range(t, a.t, b.t));
      const pa = place(a);
      const pb = place(b);
      return { x: lerp(pa.x, pb.x, e), y: lerp(pa.y, pb.y, e) };
    }
  }
  return place(CURSOR_KEYS[CURSOR_KEYS.length - 1] as (typeof CURSOR_KEYS)[number]);
}

function focusIndex(t: number): number {
  if (t < WALK.start || t >= WALK.end) return -1;
  let index = -1;
  WALK_STOPS.forEach((s, i) => {
    if (t >= s.at) index = i;
  });
  return index;
}

/** 0..1 for how deep into walkthrough mode the film is. */
function walkAmount(t: number): number {
  return range(t, WALK.start, WALK.start + 400) * (1 - range(t, WALK.end - 300, WALK.end + 300));
}

function panelAt(t: number): PanelState {
  const slide =
    easeOutCubic(range(t, PANEL.open, PANEL.openEnd)) * (1 - easeInOutCubic(range(t, PANEL.close, PANEL.closeEnd)));
  const noteChars = Math.max(0, Math.min(NOTE_TEXT.length, Math.floor((t - NOTES.start) / NOTES.step)));
  const within = (from: number, to: number): boolean => t >= from && t < to;
  return {
    slide,
    scroll: interpolateKeys(SCROLL_KEYS, t, (k) => k.v),
    saving: SAVING.some(([a, b]) => t >= a && t < b),
    noteChars,
    noteCaret: t >= 8300 && t < 10500 && (noteChars < NOTE_TEXT.length || Math.floor(t / 420) % 2 === 0),
    images: IMAGE_AT.map((at) => pop(t, at, 380)),
    dropTarget: within(11450, IMAGE_DROP) ? 'images' : within(16350, DOC.drop) ? 'docs' : null,
    urlChars: Math.max(0, Math.min(SOURCE_URL.length, Math.floor((t - URL_TYPE.start) / URL_TYPE.step))),
    sources: SOURCE_AT.map((at) => pop(t, at, 350)),
    doc: {
      appear: pop(t, DOC.drop, 260),
      progress: easeInOutCubic(range(t, DOC.progressStart, DOC.progressEnd)),
    },
    verified: range(t, VERIFY_AT, VERIFY_AT + 300),
    tags: TAG_AT.map((at) => pop(t, at, 260)),
  };
}

function thumbsOf(id: string, t: number, panel: PanelState): SceneNode['thumbs'] {
  if (id === 'b') {
    return panel.images.some((p) => p > 0)
      ? PANEL_IMAGES.map((img, i) => ({ kind: img.kind, p: panel.images[i] ?? 0 }))
      : undefined;
  }
  if (id === 'f' && t >= 21500) {
    const kinds: readonly SpecimenKind[] = ['gel', 'molecule'];
    return kinds.map((kind, i) => ({ kind, p: pop(t, 21550 + i * 150, 320) }));
  }
  return undefined;
}

function attachOf(id: string, t: number, panel: PanelState): SceneNode['attach'] {
  if (id === 'b') {
    const images = panel.images.filter((p) => p > 0.5).length;
    const sources = panel.sources.filter((p) => p > 0.5).length;
    const docs = panel.doc.progress >= 1 ? 1 : 0;
    return images + sources + docs > 0 ? { images, sources, docs } : undefined;
  }
  if (id === 'f' && t >= 21700) return { images: 2, sources: 0, docs: 0 };
  if (id === 'e' && t >= 22400) return { images: 0, sources: 1, docs: 0 };
  if (id === 'd' && t >= 22600) return { images: 0, sources: 0, docs: 1 };
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Frame                                                                      */
/* -------------------------------------------------------------------------- */

export interface FilmFrame extends SceneFrame {
  /** Opacity of the opening title card. */
  readonly title: number;
  /** Opacity of the closing end card. */
  readonly endCard: number;
  /** Walkthrough bar: which stop, and how visible. */
  readonly walk: { readonly index: number; readonly opacity: number };
  readonly panel: PanelState;
}

export function filmFrame(t: number): FilmFrame {
  const walk = walkAmount(t);
  const focused = focusIndex(t);
  const focusedId = focused >= 0 ? WALK_STOPS[focused]?.id : undefined;
  const panel = panelAt(t);
  const camera = cameraAt(t);

  const edges: SceneEdge[] = CAST.filter((n) => n.parent).map((n) => ({
    id: `${n.parent}-${n.id}`,
    from: n.parent as string,
    to: n.id,
    progress: easeOutCubic(range(t, n.at - 60, n.at + 520)),
  }));
  edges.push({
    id: `${DRAG_EDGE.from}-${DRAG_EDGE.to}`,
    from: DRAG_EDGE.from,
    to: DRAG_EDGE.to,
    progress: easeInOutCubic(range(t, DRAG_EDGE.start, DRAG_EDGE.end)),
  });

  const nodes: SceneNode[] = CAST.map((n) => {
    const appear = range(t, n.at, n.at + 420);
    const isRoot = n.id === 'a';
    const isFocused = n.id === focusedId;
    const count = edges.filter((e) => e.progress >= 1 && (e.from === n.id || e.to === n.id)).length;

    let plus = 0;
    if (n.id === 'a') plus = range(t, 4100, 4300) * (1 - range(t, 5700, 5900));
    if (n.id === 'b') plus = range(t, 20950, 21100) * (1 - range(t, 21350, 21500));
    if (n.id === 'd') plus = range(t, 21650, 21800) * (1 - range(t, 22050, 22200));
    if (n.id === 'c') plus = range(t, 22800, 22950) * (1 - range(t, 23300, 23450));

    // While the panel is open, the other cards step back.
    const panelDim = n.id === 'b' ? 0 : panel.slide * 0.6;

    return {
      id: n.id,
      type: n.type,
      title: n.title,
      label: n.label,
      x: n.x,
      y: n.y,
      h: heightOf(n.id, t),
      opacity: easeOutCubic(appear),
      scale: 0.86 + 0.14 * easeOutBack(appear),
      titleChars: isRoot ? Math.floor((t - TYPE_START) / TYPE_STEP) : undefined,
      caret: isRoot && t > 2550 && t < 4000 && Math.floor(t / 420) % 2 === 0,
      tint: 1,
      dim: Math.max(focusedId && !isFocused ? walk : 0, panelDim),
      focus: isFocused ? walk : n.id === 'b' ? panel.slide : 0,
      footer: count > 0 ? `${count} ${count === 1 ? 'connection' : 'connections'}` : '',
      plus,
      thumbs: thumbsOf(n.id, t, panel),
      attach: attachOf(n.id, t, panel),
    };
  });

  const pos = cursorAt(t, camera);
  const cursorOpacity =
    range(t, CURSOR_SHOWN.start, CURSOR_SHOWN.start + 300) * (1 - range(t, CURSOR_SHOWN.end - 400, CURSOR_SHOWN.end));
  const carry = CARRY.find((c) => t >= c.start && t < c.end);
  const dragging = t >= DRAG_EDGE.start - 150 && t <= DRAG_EDGE.end;
  const pressed = dragging || !!carry || CLICKS.some((c) => t >= c && t < c + 140);

  const ripples: SceneRipple[] = [];
  for (const c of CLICKS) {
    if (t >= c && t < c + 520) {
      const at = cursorAt(c, cameraAt(c));
      ripples.push({ x: at.x, y: at.y, age: (t - c) / 520 });
    }
  }

  return {
    nodes,
    edges,
    camera,
    cursor: { x: pos.x, y: pos.y, opacity: cursorOpacity, pressed, carry: carry?.what },
    ripples,
    panel,
    title: range(t, 150, 600) * (1 - range(t, 1350, 1800)),
    endCard: range(t, END_CARD.start, END_CARD.start + 600) * (1 - range(t, END_CARD.fadeOut, FILM_DURATION)),
    walk: { index: focused, opacity: walk },
  };
}

export const WALK_TITLES: readonly string[] = WALK_STOPS.map((s) => CAST_BY_ID.get(s.id)?.title ?? '');
