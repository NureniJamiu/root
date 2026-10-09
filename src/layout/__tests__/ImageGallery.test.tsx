import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ImageEntry } from '../../data';
import { ImageMosaic } from '../ImageGallery';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const images = (n: number): ImageEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    dataUrl: PIXEL,
    addedAt: new Date(0).toISOString(),
  }));

describe('ImageMosaic', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [6, 3],
  ])('%i images show %i tiles', (count, tiles) => {
    render(<ImageMosaic images={images(count)} />);
    expect(screen.getAllByRole('button', { name: /Open image/ })).toHaveLength(tiles);
  });

  it('three images: a tall tile on the left, two stacked on the right', () => {
    render(<ImageMosaic images={images(3)} />);
    expect(screen.getByTestId('inspector-image-0').className).toContain('row-span-2');
    expect(screen.queryByTestId('inspector-image-more')).toBeNull();
  });

  it('more than three images: the last tile shows how many more there are', () => {
    render(<ImageMosaic images={images(6)} />);
    expect(screen.getByTestId('inspector-image-more')).toHaveTextContent('+3');
  });

  it('clicking a tile opens the gallery there; next and previous wrap around', () => {
    render(<ImageMosaic images={images(4)} />);
    fireEvent.click(screen.getByTestId('inspector-image-1'));
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('2 / 4');

    fireEvent.click(screen.getByTestId('lightbox-next'));
    fireEvent.click(screen.getByTestId('lightbox-next'));
    fireEvent.click(screen.getByTestId('lightbox-next'));
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('1 / 4');
    fireEvent.click(screen.getByTestId('lightbox-prev'));
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('4 / 4');

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('3 / 4');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('image-lightbox')).toBeNull();
  });

  it('the "+N" tile opens the gallery where you can reach the hidden images', () => {
    render(<ImageMosaic images={images(5)} />);
    fireEvent.click(screen.getByTestId('inspector-image-2'));
    fireEvent.click(screen.getByTestId('lightbox-next'));
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('4 / 5');
  });

  it('a single image has no next or previous buttons; clicking the backdrop closes it', () => {
    render(<ImageMosaic images={images(1)} />);
    fireEvent.click(screen.getByTestId('inspector-image-0'));
    expect(screen.queryByTestId('lightbox-next')).toBeNull();
    fireEvent.click(screen.getByTestId('image-lightbox'));
    expect(screen.queryByTestId('image-lightbox')).toBeNull();
  });
});
