/**
 * The landing page's product film. It is not a video file: every frame is
 * drawn live from `filmScript`, so it stays sharp at any size and matches
 * the app's own cards.
 *
 * It plays while on screen and pauses when scrolled away. With reduced
 * motion it waits on a still frame until the visitor presses play.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { RootLogo } from '../../../layout/Logo';

import {
  CHAPTERS,
  FILM_DOC,
  FILM_DURATION,
  FILM_HEIGHT,
  FILM_WIDTH,
  POSTER_TIME,
  WALK_TITLES,
  chapterAt,
  filmFrame,
} from './filmScript';
import { FilmDocument } from './FilmDocument';
import { FilmInspector } from './FilmInspector';
import { canObserve, useInView, usePrefersReducedMotion } from './motion';
import { SceneCanvas } from './SceneCanvas';

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `00:${String(s).padStart(2, '0')}`;
}

function useFilmClock(active: boolean, reduced: boolean) {
  const [time, setTime] = useState(() => (reduced || !canObserve() ? POSTER_TIME : 0));
  const [playing, setPlaying] = useState(false);
  // Once the visitor pauses, scrolling back does not restart the film.
  const heldByUser = useRef(reduced);

  useEffect(() => {
    if (heldByUser.current) return;
    setPlaying(active);
  }, [active]);

  useEffect(() => {
    if (!playing || !active) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(64, now - last);
      last = now;
      setTime((t) => (t + dt) % FILM_DURATION);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, active]);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      heldByUser.current = p;
      return !p;
    });
  }, []);

  const seek = useCallback((t: number) => setTime(t), []);

  return { time, playing, toggle, seek };
}

export function ProductFilm(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  // Only a real observer may start playback; without one the film stays still.
  const onScreen = useInView(ref, { once: false, rootMargin: '0px', threshold: 0.25, fallback: false });
  const { time, playing, toggle, seek } = useFilmClock(onScreen, reduced);

  const frame = filmFrame(time);
  const chapter = chapterAt(time);
  const walkTitle = frame.walk.index >= 0 ? WALK_TITLES[frame.walk.index] : '';

  return (
    <div ref={ref} className="lp-film relative bg-panel border border-ink rounded-[4px] overflow-hidden">
      {/* Window bar */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-rule bg-paper font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="w-2 h-2 rounded-full border border-rule-strong" />
          <span className="w-2 h-2 rounded-full border border-rule-strong" />
          <span className="w-2 h-2 rounded-full border border-rule-strong" />
        </div>
        <span className="truncate px-3">Root · Research canvas · Plastic-eating enzymes</span>
        <span className="hidden sm:inline tabular-nums">
          {formatTime(time)} / {formatTime(FILM_DURATION)}
        </span>
      </div>

      <div
        role="img"
        aria-label="Product film: a root idea called Plastic-eating enzymes is planted on a canvas and ideas branch from it. One idea is opened and filled with notes, dropped-in images, cited sources, an uploaded PDF, a verified status and tags. More findings are gathered with their own images and sources, a conclusion is connected, and a walkthrough moves from idea to idea. Then a document opens beside the canvas: it cites one idea through the @ menu, the conclusion card is dragged into it, and both cards show that a document cites them."
        className="bg-canvas"
      >
        <SceneCanvas
          frame={frame}
          width={FILM_WIDTH}
          height={FILM_HEIGHT}
          idPrefix="film"
          overlay={
            <>
              <FilmInspector state={frame.panel} />
              <FilmDocument state={frame.doc} content={FILM_DOC} />

              {/* Opening title */}
              {frame.title > 0 && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none"
                  style={{ opacity: frame.title }}
                >
                  <RootLogo style={{ height: 64, width: 'auto' }} />
                  <p
                    className="font-serif italic text-ink text-[30px] font-light"
                    style={{ transform: `translateY(${(1 - frame.title) * 10}px)` }}
                  >
                    A canvas for branching thought.
                  </p>
                </div>
              )}

              {/* Walkthrough bar */}
              {frame.walk.opacity > 0 && (
                <div
                  className="absolute left-1/2 bottom-6 flex items-center gap-3 px-3 py-2 bg-inverse text-on-inverse rounded-[3px] font-mono text-[11px] tracking-[0.04em]"
                  style={{
                    opacity: frame.walk.opacity,
                    transform: `translate(-50%, ${(1 - frame.walk.opacity) * 12}px)`,
                  }}
                >
                  <span className="uppercase text-inverse-accent">Walkthrough</span>
                  <span className="tabular-nums">{Math.max(1, frame.walk.index + 1)} / {WALK_TITLES.length}</span>
                  <span className="font-serif text-[14px] tracking-normal">{walkTitle}</span>
                </div>
              )}

              {/* End card */}
              {frame.endCard > 0 && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-paper pointer-events-none"
                  style={{ opacity: frame.endCard }}
                >
                  <RootLogo style={{ height: 80, width: 'auto' }} />
                  <p className="font-serif text-[34px] font-light text-ink" style={{ letterSpacing: '-0.02em' }}>
                    From initial spark to finished content.
                  </p>
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Free while in beta</span>
                </div>
              )}

              {/* Chapter caption */}
              <div className="absolute left-5 top-4 font-mono text-[11px] uppercase tracking-[0.1em] text-muted flex items-center gap-2 pointer-events-none">
                <span className="text-topic tabular-nums">{String(chapter + 1).padStart(2, '0')}</span>
                <span key={chapter} className="lp-caption">{CHAPTERS[chapter]?.label}</span>
              </div>
            </>
          }
        />
      </div>

      {/* Transport */}
      <div className="flex items-center gap-3 h-11 px-3 border-t border-rule bg-panel">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause product film' : 'Play product film'}
          className="flex items-center justify-center w-7 h-7 rounded-[2px] border border-inverse bg-inverse text-on-inverse hover:bg-accent hover:text-on-accent hover:border-accent transition-colors"
        >
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1.5" y="1" width="2.4" height="8" fill="currentColor" />
              <rect x="6.1" y="1" width="2.4" height="8" fill="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 1 L9 5 L2 9 Z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div className="relative flex-1 h-7 flex items-center">
          <div className="absolute inset-x-0 h-[2px] bg-rule" />
          <div
            className="absolute left-0 h-[2px] lp-gradient-bar"
            style={{ width: `${(time / FILM_DURATION) * 100}%` }}
          />
          {CHAPTERS.map((c, i) => (
            <button
              key={c.label}
              type="button"
              onClick={() => seek(c.at)}
              aria-label={`Jump to ${c.label}`}
              title={c.label}
              className="absolute -translate-x-1/2 w-4 h-7 flex items-center justify-center group"
              style={{ left: `${(c.at / FILM_DURATION) * 100}%` }}
            >
              <span
                className={`block w-[7px] h-[7px] rounded-[1px] border transition-colors ${
                  i <= chapter ? 'bg-accent border-topic' : 'bg-panel border-rule-strong group-hover:border-ink'
                }`}
              />
            </button>
          ))}
        </div>

        <span className="hidden md:inline font-mono text-[10px] uppercase tracking-[0.08em] text-muted w-[150px] text-right truncate">
          {CHAPTERS[chapter]?.label}
        </span>
      </div>
    </div>
  );
}
