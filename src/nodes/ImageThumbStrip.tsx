/**
 * `ImageThumbStrip` — horizontal strip of small image thumbnails shown at
 * the bottom of a `NodeCard` (design.md §Node UI Layer).
 *
 * Renders one `<img>` per `ImageEntry`, using the entry's `dataUrl`
 * verbatim. This component is presentation-only: it does not open the
 * editor, delete images, or preview at full size — those flows live in
 * `NodeEditor` (task 11.1).
 */

import type { ImageEntry } from '../data';

export interface ImageThumbStripProps {
  readonly images: readonly ImageEntry[];
}

export function ImageThumbStrip({
  images,
}: ImageThumbStripProps): JSX.Element | null {
  if (images.length === 0) return null;
  return (
    <div
      className="flex flex-row flex-wrap gap-1.5 mt-2"
      data-testid="image-thumb-strip"
    >
      {images.map((img) => (
        <img
          key={img.id}
          src={img.dataUrl}
          alt=""
          className="rounded-xs transition-transform duration-120 hover:scale-105"
          // Fixed thumbnail dimensions keep card layout predictable
          // regardless of source image aspect ratio.
          style={{
            width: 36,
            height: 36,
            objectFit: 'cover',
            borderRadius: 6,
            border: '1px solid #312e2e',
            background: '#ffffff',
          }}
        />
      ))}
    </div>
  );
}
