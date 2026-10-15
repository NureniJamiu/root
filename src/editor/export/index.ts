/**
 * Download the open document as Markdown or Word, its idea citations turned
 * into footnotes. Browser glue around the pure exporters: reads the canvas
 * ideas, fetches images and saves the file. Imported on demand from the
 * document pane, so neither exporter (nor the `docx` library) loads until
 * someone exports.
 */

import type { JSONContent } from '@tiptap/core';

import { useCanvasStore } from '../../data';
import type { Node } from '../../data';

import type { LoadedImage } from './docx';
import { documentToMarkdown } from './markdown';

export type ExportFormat = 'markdown' | 'docx';

/** Widest an image is placed in a Word page, in pixels (about the text width). */
const DOCX_IMAGE_MAX_WIDTH = 600;

function canvasIdeas(): Map<string, Node> {
  return new Map(useCanvasStore.getState().canvas.nodes.map((n) => [n.id, n]));
}

function absolute(src: string): string {
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

/** A file name from the document title. */
export function exportFileName(title: string, format: ExportFormat): string {
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim() || 'Untitled document';
  return `${base}.${format === 'markdown' ? 'md' : 'docx'}`;
}

/** Fetch an image and redraw it as a PNG Word can show, scaled to the page. */
async function loadImage(src: string): Promise<LoadedImage | null> {
  const response = await fetch(src, { credentials: 'include' });
  if (!response.ok) return null;
  const bitmap = await createImageBitmap(await response.blob());
  const scale = Math.min(1, DOCX_IMAGE_MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return png ? { data: await png.arrayBuffer(), type: 'png', width, height } : null;
}

function save(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build the file for `format` and hand it to the browser to save. */
export async function exportDocument(
  format: ExportFormat,
  doc: { readonly title: string; readonly content: JSONContent },
): Promise<void> {
  const ideas = canvasIdeas();
  let blob: Blob;
  if (format === 'markdown') {
    const text = documentToMarkdown({ title: doc.title, content: doc.content, ideas, resolveSrc: absolute });
    blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  } else {
    const { documentToDocx } = await import('./docx');
    blob = await documentToDocx({ title: doc.title, content: doc.content, ideas, loadImage });
  }
  save(blob, exportFileName(doc.title, format));
}
