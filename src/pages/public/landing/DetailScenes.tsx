/**
 * Small still scenes above each item in the landing page's closing
 * details: a document citing a card, a folded branch, and a card holding
 * its evidence. They reuse the film's cards (`SceneCanvas`) so they read as
 * the same product; the only motion is a pulse on the linked citation when
 * the column is revealed (`.lp-link-pulse` in `landing.css`).
 */

import { useLayoutEffect, useRef, useState } from 'react';

import { withAlpha } from './motion';
import { CARD_H, SceneCanvas, TYPE_COLOR } from './SceneCanvas';
import type { SceneFrame } from './SceneCanvas';

/** Logical stage height; the frame is 140px tall, and as wide as its column. */
const H = 160;
const FRAME_PX = 140;
const SCALE = FRAME_PX / H;
/** World x at the middle of the frame, whatever its width. */
const MID = 180;

/** A fixed-height frame; `children` gets the stage width that fills it. */
function Frame({ children }: { readonly children: (width: number) => JSX.Element }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const apply = (): void => setWidth(el.clientWidth / SCALE);
    apply();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="relative mb-7 border border-rule rounded-[4px] overflow-hidden bg-canvas"
      style={{ height: FRAME_PX }}
      aria-hidden="true"
    >
      {width > 0 && children(width)}
    </div>
  );
}

const camera = { x: MID, y: H / 2, zoom: 1 } as const;

/* A card on the canvas and the document that cites it, linked both ways. */

const writeFrame = (width: number): SceneFrame => ({
  camera,
  edges: [],
  nodes: [
    {
      id: 'b',
      type: 'finding',
      title: 'PETase breaks down PET',
      label: 'F-01',
      x: MID - width / 2 + 14,
      y: 36,
      opacity: 1,
      scale: 1,
      cited: { count: 2, p: 1 },
    },
  ],
});

export function WriteScene(): JSX.Element {
  const finding = TYPE_COLOR.finding;
  return (
    <Frame>
      {(width) => (
        <SceneCanvas
          frame={writeFrame(width)}
          width={width}
          height={H}
          idPrefix="detail-write"
          fill={{ scale: SCALE }}
          overlay={
            <div className="absolute top-3 bottom-0 right-0 w-[168px] bg-panel border-l border-t border-rule-2 rounded-tl-[3px] px-3.5 pt-3 font-serif">
              <div className="text-[13px] font-medium text-ink-strong mb-1">What we know</div>
              <p className="m-0 text-[11px] leading-[17px] text-ink">
                Engineered enzymes work fast:{' '}
                <span
                  className="lp-link-pulse inline-flex items-baseline gap-1 px-[3px] rounded-[2px] text-ink-strong"
                  style={{
                    background: withAlpha(finding, 0.1),
                    borderBottom: `1px solid ${withAlpha(finding, 0.6)}`,
                  }}
                >
                  <span
                    className="inline-block w-[4px] h-[4px] rounded-full"
                    style={{
                      background: finding,
                      transform: 'translateY(-1px)',
                    }}
                  />
                  PETase breaks down PET
                </span>{' '}
                in about a week.
              </p>
              <div className="mt-2.5 flex flex-col gap-1.5" aria-hidden="true">
                <span className="h-[5px] w-full rounded-full bg-sunken-3" />
                <span className="h-[5px] w-4/5 rounded-full bg-sunken-3" />
              </div>
            </div>
          }
        />
      )}
    </Frame>
  );
}

/* A branch folded into its parent, ready to be revealed one idea at a time. */

const foldFrame = (width: number): SceneFrame => {
  const left = MID - width / 2 + 14;
  return {
    camera,
    edges: [{ id: 'k-c', from: 'k', to: 'c', progress: 1 }],
    nodes: [
      {
        id: 'g2',
        type: 'finding',
        title: 'Comment themes',
        label: 'F-03',
        x: left + 16,
        y: 50,
        opacity: 0.28,
        scale: 0.9,
      },
      {
        id: 'g1',
        type: 'finding',
        title: 'Retention graph',
        label: 'F-02',
        x: left + 8,
        y: 42,
        opacity: 0.5,
        scale: 0.95,
      },
      {
        id: 'k',
        type: 'finding',
        title: 'Viewers drop at 0:08',
        label: 'F-01',
        x: left,
        y: 34,
        opacity: 1,
        scale: 1,
        badge: '+2 hidden',
      },
      {
        id: 'c',
        type: 'conclusion',
        title: 'Lead with the demo',
        label: 'C-01',
        x: left + 246,
        y: 34,
        opacity: 1,
        scale: 1,
        footer: '1 connection',
      },
    ],
  };
};

export function FoldScene(): JSX.Element {
  return (
    <Frame>
      {(width) => (
        <SceneCanvas frame={foldFrame(width)} width={width} height={H} idPrefix="detail-fold" fill={{ scale: SCALE }} />
      )}
    </Frame>
  );
}

/* A card carrying its notes, images and sources. */

const EVIDENCE_FRAME: SceneFrame = {
  camera,
  edges: [],
  nodes: [
    {
      id: 'f',
      type: 'finding',
      title: 'Five ML-picked mutations',
      label: 'F-03',
      x: 85,
      y: 18,
      h: CARD_H + 36,
      opacity: 1,
      scale: 1,
      thumbs: [
        { kind: 'protein', p: 1 },
        { kind: 'gel', p: 1 },
        { kind: 'molecule', p: 1 },
      ],
      attach: { images: 3, sources: 2, docs: 0 },
    },
  ],
};

export function EvidenceScene(): JSX.Element {
  return (
    <Frame>
      {(width) => (
        <SceneCanvas
          frame={EVIDENCE_FRAME}
          width={width}
          height={H}
          idPrefix="detail-evidence"
          fill={{ scale: SCALE }}
          overlay={
            <span className="absolute right-3 top-3 flex items-center gap-1.5 font-mono text-[9px] text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Saved
            </span>
          }
        />
      )}
    </Frame>
  );
}
