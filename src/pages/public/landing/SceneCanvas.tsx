/**
 * `SceneCanvas` draws one frame of a scripted canvas: idea cards,
 * connectors, a cursor and a camera. It holds no clock of its own; the
 * product film and the scroll story each compute a `SceneFrame` (from time
 * or from scroll) and hand it here.
 *
 * Cards are drawn after the app's `NodeCard` (accent bar, type badge, serif
 * title, mono footer) at a smaller size, on the same 16px drafting grid.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { mixColor, withAlpha } from './motion';
import { Specimen } from './Specimen';
import type { SpecimenKind } from './Specimen';

export type IdeaType = 'topic' | 'finding' | 'question' | 'conclusion';

export const CARD_W = 190;
export const CARD_H = 88;

export const TYPE_COLOR: Readonly<Record<IdeaType, string>> = {
  topic: 'rgb(var(--topic))',
  finding: 'rgb(var(--finding))',
  question: 'rgb(var(--question))',
  conclusion: 'rgb(var(--conclusion))',
};

const NEUTRAL = 'rgb(var(--faint))';

export interface SceneNode {
  readonly id: string;
  readonly type: IdeaType;
  readonly title: string;
  /** Short index shown in the footer, e.g. `T-01`. */
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly scale: number;
  /** How many title characters are typed so far; omit for the whole title. */
  readonly titleChars?: number | undefined;
  /** Shows a typing caret after the title. */
  readonly caret?: boolean;
  /** 0 = an unlabelled grey idea, 1 = fully in its type colour. */
  readonly tint?: number;
  /** 0..1, fades the card back while another is in focus. */
  readonly dim?: number;
  /** Draws the cobalt focus ring. */
  readonly focus?: number;
  /** Footer text on the right (e.g. connection count). */
  readonly footer?: string;
  /** Collapsed badge text; replaces `footer`. */
  readonly badge?: string | undefined;
  /** Shows the "+" add-child control on the right edge (0..1). */
  readonly plus?: number;
  /** Card height; defaults to `CARD_H`. Cards with images grow taller. */
  readonly h?: number;
  /** Image thumbnails on the card, each with its own 0..1 reveal. */
  readonly thumbs?: readonly { readonly kind: SpecimenKind; readonly p: number }[] | undefined;
  /** Attachment counts shown in the footer instead of `footer`. */
  readonly attach?: { readonly images: number; readonly sources: number; readonly docs: number } | undefined;
  /** "In N docs": documents that cite the idea, with a 0..1 reveal. */
  readonly cited?: { readonly count: number; readonly p: number } | undefined;
}

export interface SceneEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** 0..1 of the connector drawn, from its source end. */
  readonly progress: number;
  readonly opacity?: number;
}

/** Cursor position is in stage coordinates, so it does not zoom with the camera. */
export interface SceneCursor {
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly pressed: boolean;
  /** Something being dragged along with the cursor: files, or an idea card. */
  readonly carry?: 'images' | 'pdf' | SceneCarryCard | undefined;
}

/** An idea card dragged off the canvas (into a document). */
export interface SceneCarryCard {
  readonly type: IdeaType;
  readonly title: string;
}

/** A click ring, in stage coordinates. */
export interface SceneRipple {
  readonly x: number;
  readonly y: number;
  /** 0..1 through the ripple. */
  readonly age: number;
}

export interface SceneCamera {
  /** World point at the centre of the stage. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface SceneFrame {
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly SceneEdge[];
  readonly camera: SceneCamera;
  readonly cursor?: SceneCursor;
  readonly ripples?: readonly SceneRipple[];
}

interface SceneCanvasProps {
  readonly frame: SceneFrame;
  /** Logical stage size; the stage is scaled to fit its container's width. */
  readonly width: number;
  readonly height: number;
  /** Fixed-position layers drawn over the world (captions, title cards). */
  readonly overlay?: ReactNode;
  readonly className?: string;
  readonly idPrefix: string;
  /**
   * Fill the parent instead of keeping the stage's aspect ratio. The caller
   * then sizes the stage to the parent and passes the `scale` to draw it at.
   */
  readonly fill?: { readonly scale: number };
}

/** Scale that fits a `width`-wide stage into the container. */
function useFitScale(width: number): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = (): void => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / width);
    };
    apply();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return [ref, scale];
}

export function SceneCanvas({
  frame,
  width,
  height,
  overlay,
  className = '',
  idPrefix,
  fill,
}: SceneCanvasProps): JSX.Element {
  const [ref, fitScale] = useFitScale(width);
  const scale = fill ? fill.scale : fitScale;
  const { camera } = frame;
  const byId = new Map(frame.nodes.map((n) => [n.id, n]));
  const world = `translate(${width / 2}px, ${height / 2}px) scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`;

  return (
    <div
      ref={ref}
      className={`${fill ? 'absolute inset-0' : 'relative w-full'} overflow-hidden ${className}`}
      style={fill ? undefined : { aspectRatio: `${width} / ${height}` }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width, height, transform: `scale(${scale})` }}
      >
        {/* Drafting grid, moving with the camera. */}
        <div
          className="absolute inset-0 lp-grid"
          style={{
            backgroundSize: `${16 * camera.zoom}px ${16 * camera.zoom}px`,
            backgroundPosition: `${width / 2 - camera.x * camera.zoom}px ${height / 2 - camera.y * camera.zoom}px`,
          }}
        />

        <div className="absolute left-0 top-0" style={{ transform: world, transformOrigin: '0 0' }}>
          <svg
            className="absolute left-0 top-0 overflow-visible"
            width={1}
            height={1}
            aria-hidden="true"
          >
            {frame.edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              return <Connector key={e.id} id={`${idPrefix}-${e.id}`} edge={e} from={a} to={b} />;
            })}
          </svg>

          {frame.nodes.map((n) => (
            <MiniNode key={n.id} node={n} />
          ))}
        </div>

        {overlay}

        {frame.ripples?.map((r, i) => (
            <span
              key={i}
              className="absolute rounded-full pointer-events-none"
              style={{
                left: r.x,
                top: r.y,
                width: 44,
                height: 44,
                marginLeft: -22,
                marginTop: -22,
                border: '1.5px solid rgb(var(--topic))',
                opacity: 1 - r.age,
                transform: `scale(${0.2 + r.age * 0.9})`,
              }}
            />
          ))}

        {frame.cursor && frame.cursor.opacity > 0 && <Cursor cursor={frame.cursor} />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Connector                                                                  */
/* -------------------------------------------------------------------------- */

function Connector({
  id,
  edge,
  from,
  to,
}: {
  readonly id: string;
  readonly edge: SceneEdge;
  readonly from: SceneNode;
  readonly to: SceneNode;
}): JSX.Element | null {
  if (edge.progress <= 0) return null;
  const x1 = from.x + CARD_W;
  const y1 = from.y + (from.h ?? CARD_H) / 2;
  const x2 = to.x;
  const y2 = to.y + (to.h ?? CARD_H) / 2;
  const dx = Math.max(40, (x2 - x1) / 2);
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  const color = mixColor(NEUTRAL, TYPE_COLOR[from.type], from.tint ?? 1);
  const dashed = to.type === 'question' && (to.tint ?? 1) > 0.5;
  const opacity =
    (edge.opacity ?? 1) * Math.min(from.opacity, to.opacity) * (1 - 0.75 * Math.max(from.dim ?? 0, to.dim ?? 0));
  const done = edge.progress >= 1;

  return (
    <g opacity={opacity}>
      <mask id={id} maskUnits="userSpaceOnUse" x={-2000} y={-2000} width={6000} height={6000}>
        <path
          d={d}
          pathLength={1}
          stroke="rgb(var(--panel))"
          strokeWidth={8}
          fill="none"
          strokeDasharray="1 1"
          strokeDashoffset={1 - edge.progress}
        />
      </mask>
      <path
        d={d}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={dashed ? '5 4' : undefined}
        mask={done ? undefined : `url(#${id})`}
      />
      <circle cx={x1} cy={y1} r={3.5} fill={color} />
      {done && <circle cx={x2} cy={y2} r={3.5} fill={color} />}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* MiniNode                                                                   */
/* -------------------------------------------------------------------------- */

const BADGE_LABEL: Readonly<Record<IdeaType, string>> = {
  topic: 'TOPIC',
  finding: 'FINDING',
  question: 'QUESTION',
  conclusion: 'CONCLUSION',
};

function MiniNode({ node }: { readonly node: SceneNode }): JSX.Element | null {
  if (node.opacity <= 0.001) return null;
  const tint = node.tint ?? 1;
  const color = mixColor(NEUTRAL, TYPE_COLOR[node.type], tint);
  const typed = tint > 0.5;
  const title =
    node.titleChars === undefined ? node.title : node.title.slice(0, Math.max(0, node.titleChars));
  const focus = node.focus ?? 0;
  const dim = node.dim ?? 0;
  const isConclusion = node.type === 'conclusion' && typed;

  return (
    <div
      className="absolute"
      style={{
        left: node.x,
        top: node.y,
        width: CARD_W,
        height: node.h ?? CARD_H,
        opacity: node.opacity * (1 - 0.72 * dim),
        transform: `scale(${node.scale})`,
        transformOrigin: 'center',
      }}
    >
      <div
        className="relative h-full flex flex-col bg-panel rounded-[2px]"
        style={{
          border: `1px solid ${color}`,
          boxShadow:
            focus > 0
              ? `0 0 0 ${2 * focus}px rgb(var(--topic)), 0 ${18 * focus}px ${36 * focus}px -14px rgb(var(--topic-strong) / ${0.35 * focus})`
              : '0 1px 2px rgb(var(--shadow) / 0.04)',
        }}
      >
        <div style={{ height: 3, background: color }} />
        <div className="flex-1 flex flex-col gap-1 px-2.5 pt-2 pb-1.5 min-h-0">
          <span
            className="self-start inline-flex items-center gap-1 font-mono font-semibold rounded-[2px]"
            style={{
              fontSize: 7.5,
              lineHeight: '10px',
              letterSpacing: '0.06em',
              padding: '1px 4px',
              color,
              border: `1px solid ${color}`,
              background: withAlpha(color, 0.08),
            }}
          >
            <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: color }} />
            {typed ? BADGE_LABEL[node.type] : 'IDEA'}
          </span>
          <div
            className={`font-serif text-ink-strong leading-tight truncate ${isConclusion ? 'italic' : ''}`}
            style={{ fontSize: 14.5, fontWeight: 500, letterSpacing: '-0.01em' }}
          >
            {title}
            {node.caret && <span className="lp-caret" />}
            {title.length === 0 && !node.caret && <span className="opacity-40 italic">Untitled idea</span>}
          </div>
          {node.thumbs && node.thumbs.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {node.thumbs.map((t, i) => (
                <div
                  key={i}
                  className="flex-1 h-[34px] rounded-[2px] overflow-hidden border border-rule"
                  style={{ opacity: t.p, transform: `translateY(${(1 - t.p) * 6}px) scale(${0.8 + 0.2 * t.p})` }}
                >
                  <Specimen kind={t.kind} className="w-full h-full block" />
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between pt-1 border-t border-rule font-mono text-muted" style={{ fontSize: 7.5 }}>
            <span className="inline-flex items-center gap-1.5">
              {node.label}
              {node.cited && node.cited.p > 0 && <CitedBadge cited={node.cited} />}
            </span>
            {node.attach ? (
              <AttachCounts attach={node.attach} />
            ) : node.badge ? (
              <span
                className="inline-flex items-center px-1 rounded-[2px] text-ink"
                style={{ border: '1px solid rgb(var(--rule-strong))', background: 'rgb(var(--sunken))' }}
              >
                {node.badge}
              </span>
            ) : (
              <span>{node.footer}</span>
            )}
          </div>
        </div>

        {(node.plus ?? 0) > 0 && (
          <span
            className="absolute flex items-center justify-center rounded-full bg-panel font-mono text-topic"
            style={{
              right: -9,
              top: CARD_H / 2 - 9,
              width: 18,
              height: 18,
              fontSize: 13,
              lineHeight: 1,
              border: '1.5px solid rgb(var(--topic))',
              opacity: node.plus,
              transform: `scale(${0.6 + 0.4 * (node.plus ?? 0)})`,
            }}
          >
            +
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cursor                                                                     */
/* -------------------------------------------------------------------------- */

function AttachCounts({ attach }: { readonly attach: NonNullable<SceneNode['attach']> }): JSX.Element {
  const items: readonly [number, JSX.Element][] = [
    [attach.images, <rect key="i" x="1" y="2" width="8" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />],
    [attach.sources, <path key="s" d="M4 6 L6 4 M3.2 4.8 L2.4 5.6 a1.4 1.4 0 0 0 2 2 L5.2 6.8 M4.8 3.2 L5.6 2.4 a1.4 1.4 0 0 1 2 2 L6.8 5.2" fill="none" stroke="currentColor" strokeWidth="1" />],
    [attach.docs, <path key="d" d="M2.5 1 H6 L8 3 V9 H2.5 Z M6 1 V3 H8" fill="none" stroke="currentColor" strokeWidth="1" />],
  ];
  return (
    <span className="flex items-center gap-1.5 text-ink">
      {items
        .filter(([n]) => n > 0)
        .map(([n, icon], i) => (
          <span key={i} className="inline-flex items-center gap-0.5">
            <svg width="9" height="10" viewBox="0 0 10 10" aria-hidden="true">
              {icon}
            </svg>
            {n}
          </span>
        ))}
    </span>
  );
}

/** After the app's "In N docs" badge on a card. */
function CitedBadge({ cited }: { readonly cited: NonNullable<SceneNode['cited']> }): JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 rounded-[2px] bg-sunken text-ink-2"
      style={{
        opacity: cited.p,
        transform: `scale(${0.7 + 0.3 * cited.p})`,
        boxShadow: `0 0 0 ${3 * Math.sin(cited.p * Math.PI)}px rgb(var(--topic) / 0.25)`,
      }}
    >
      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      In {cited.count} {cited.count === 1 ? 'doc' : 'docs'}
    </span>
  );
}

/** The ghost of an idea card while it is dragged into a document. */
function CarriedCard({ card }: { readonly card: SceneCarryCard }): JSX.Element {
  const color = TYPE_COLOR[card.type];
  return (
    <div
      className="flex w-[170px] bg-panel border border-rule-strong rounded-[2px] overflow-hidden"
      style={{ boxShadow: '0 10px 22px rgb(var(--shadow) / 0.2)', transform: 'rotate(-3deg)' }}
    >
      <div className="w-[3px] shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0 px-2 py-1.5">
        <div className="font-mono font-semibold" style={{ fontSize: 7.5, letterSpacing: '0.06em', color }}>
          {BADGE_LABEL[card.type]}
        </div>
        <div
          className={`font-serif text-ink-strong truncate ${card.type === 'conclusion' ? 'italic' : ''}`}
          style={{ fontSize: 13, fontWeight: 500 }}
        >
          {card.title}
        </div>
      </div>
    </div>
  );
}

function Cursor({ cursor }: { readonly cursor: SceneCursor }): JSX.Element {
  const card = typeof cursor.carry === 'object' ? cursor.carry : undefined;
  return (
    <>
    {card && (
      <div className="absolute pointer-events-none" style={{ left: cursor.x - 40, top: cursor.y + 12, opacity: cursor.opacity * 0.94 }}>
        <CarriedCard card={card} />
      </div>
    )}
    {cursor.carry && !card && (
      <div
        className="absolute pointer-events-none"
        style={{
          left: cursor.carry === 'pdf' ? cursor.x - 200 : cursor.x + 10,
          top: cursor.y + 14,
          opacity: cursor.opacity,
        }}
      >
        {cursor.carry === 'images' ? (
          <div className="relative w-[64px] h-[46px]">
            {(['film', 'pocket', 'protein'] as const).map((k, i) => (
              <div
                key={k}
                className="absolute inset-0 rounded-[2px] overflow-hidden border-2 border-panel"
                style={{ transform: `rotate(${(i - 1) * 7}deg) translate(${i * 3}px, ${i * -2}px)`, boxShadow: '0 4px 10px rgb(var(--shadow) / 0.18)' }}
              >
                <Specimen kind={k} className="w-full h-full block" />
              </div>
            ))}
            <span className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-accent text-on-accent font-mono text-[9px] flex items-center justify-center">3</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 bg-panel border border-rule-strong rounded-[2px] pl-1.5 pr-2.5 py-1.5"
            style={{ boxShadow: '0 6px 14px rgb(var(--shadow) / 0.16)', transform: 'rotate(-3deg)' }}
          >
            <PdfIcon />
            <span className="font-mono text-[10px] text-ink whitespace-nowrap">fast-petase-methods.pdf</span>
          </div>
        )}
      </div>
    )}
    <svg
      className="absolute pointer-events-none"
      style={{
        left: cursor.x - 3,
        top: cursor.y - 2,
        opacity: cursor.opacity,
        transform: `scale(${cursor.pressed ? 0.86 : 1})`,
        transformOrigin: '3px 2px',
        filter: 'drop-shadow(0 2px 3px rgb(var(--shadow) / 0.25))',
      }}
      width={20}
      height={24}
      viewBox="0 0 20 24"
      aria-hidden="true"
    >
      <path d="M3 2 L3 19 L7.5 14.8 L10.6 21.6 L13.6 20.3 L10.6 13.6 L16.6 13.4 Z" fill="rgb(var(--ink-strong))" stroke="rgb(var(--panel))" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
    </>
  );
}

/** A small PDF page glyph. */
export function PdfIcon({ size = 22 }: { readonly size?: number }): JSX.Element {
  return (
    <svg width={size * 0.82} height={size} viewBox="0 0 18 22" aria-hidden="true">
      <path d="M1 1 H12 L17 6 V21 H1 Z" fill="rgb(var(--panel))" stroke="rgb(var(--rule-strong))" />
      <path d="M12 1 V6 H17" fill="rgb(var(--sunken))" stroke="rgb(var(--rule-strong))" />
      <rect x="0" y="11" width="13" height="7" rx="1" fill="rgb(var(--question))" />
      <text x="6.5" y="16.6" textAnchor="middle" fontSize="5.2" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill="rgb(var(--panel))">PDF</text>
    </svg>
  );
}
