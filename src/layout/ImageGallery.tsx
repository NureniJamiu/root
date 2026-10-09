/**
 * Images in the node inspector.
 *
 * `ImageMosaic` lays an idea's images out as a small mosaic:
 *   - one image fills the frame;
 *   - two sit side by side;
 *   - three: a tall one on the left, two stacked on the right;
 *   - more than three: the same, with "+N" over the last tile for the rest.
 *
 * Clicking a tile opens `ImageLightbox` on that image: a full-screen viewer
 * with previous / next buttons (also ← / →), a counter, and Esc or a click
 * on the backdrop to close.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ImageEntry } from '../data';

import { formatDataUrlSize } from './formatTime';

const MOSAIC_HEIGHT = 200;

export function ImageMosaic({ images }: { readonly images: readonly ImageEntry[] }): JSX.Element | null {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const close = useCallback(() => setOpenAt(null), []);
  if (images.length === 0) return null;

  const shown = images.slice(0, 3);
  const extra = images.length - shown.length;
  const tile = (index: number, className: string): JSX.Element => {
    const image = images[index]!;
    const isLast = index === shown.length - 1 && extra > 0;
    return (
      <button
        key={image.id}
        type="button"
        onClick={() => setOpenAt(index)}
        className={`group/tile relative overflow-hidden rounded-[4px] bg-sunken border border-rule cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-topic ${className}`}
        aria-label={isLast ? `Open image ${index + 1} of ${images.length}, ${extra} more` : `Open image ${index + 1} of ${images.length}`}
        data-testid={`inspector-image-${index}`}
      >
        <img
          src={image.dataUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 ease-out group-hover/tile:scale-[1.04]"
        />
        {isLast && (
          <span
            className="absolute inset-0 flex items-end justify-end p-2 bg-black/35 font-mono text-[15px] font-medium text-white"
            data-testid="inspector-image-more"
          >
            +{extra}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <div
        className="grid gap-1.5"
        style={{
          height: MOSAIC_HEIGHT,
          gridTemplateColumns: shown.length === 1 ? '1fr' : '1fr 1fr',
          gridTemplateRows: shown.length === 3 ? '1fr 1fr' : '1fr',
        }}
        data-testid="inspector-image-mosaic"
        data-count={images.length}
      >
        {shown.length === 3
          ? [tile(0, 'row-span-2'), tile(1, ''), tile(2, '')]
          : shown.map((_, i) => tile(i, ''))}
      </div>
      {openAt !== null && <ImageLightbox images={images} start={openAt} onClose={close} />}
    </>
  );
}

export function ImageLightbox({
  images,
  start,
  onClose,
}: {
  readonly images: readonly ImageEntry[];
  readonly start: number;
  readonly onClose: () => void;
}): JSX.Element {
  const [index, setIndex] = useState(start);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const count = images.length;
  const image = images[Math.min(index, count - 1)]!;
  const step = useCallback((by: number) => setIndex((i) => (i + by + count) % count), [count]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [onClose, step]);

  useEffect(() => setDimensions(null), [index]);

  const navButton = (by: 1 | -1): JSX.Element => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        step(by);
      }}
      className={`absolute top-1/2 -translate-y-1/2 ${by < 0 ? 'left-4' : 'right-4'} w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white`}
      aria-label={by < 0 ? 'Previous image' : 'Next image'}
      data-testid={by < 0 ? 'lightbox-prev' : 'lightbox-next'}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={by < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
      </svg>
    </button>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
      className="root-modal-backdrop fixed inset-0 z-[80] flex flex-col items-center justify-center select-none"
      style={{ background: 'rgba(12, 12, 12, 0.88)' }}
      onClick={onClose}
      data-testid="image-lightbox"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Close gallery"
        data-testid="lightbox-close"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <img
        key={image.id}
        src={image.dataUrl}
        alt={`Image ${index + 1} of ${count}`}
        className="root-modal-panel max-w-[86vw] max-h-[80vh] object-contain rounded-[4px] cursor-default"
        onClick={(e) => e.stopPropagation()}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0) setDimensions(`${img.naturalWidth}×${img.naturalHeight}`);
        }}
        data-testid="lightbox-image"
      />

      <div className="mt-4 font-mono text-[11px] text-white/70" onClick={(e) => e.stopPropagation()}>
        <span data-testid="lightbox-counter">
          {index + 1} / {count}
        </span>
        <span className="text-white/40">
          {' · '}
          {dimensions ? `${dimensions} · ` : ''}
          {formatDataUrlSize(image.dataUrl)}
        </span>
      </div>

      {count > 1 && navButton(-1)}
      {count > 1 && navButton(1)}
    </div>,
    document.body,
  );
}
