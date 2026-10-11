/**
 * Make a card image small enough to send for an AI description: at most
 * `maxSide` pixels on its longer side, as JPEG. Images already small and in
 * a format models read are sent as they are.
 */

import { DESCRIBE_IMAGE_MAX_CHARS } from '../lib/ai/contracts';

const SENDABLE = /^data:image\/(png|jpeg|webp|gif);base64,/;

function load(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be read.'));
    img.src = dataUrl;
  });
}

/** The image as a data URL a model accepts, or null when it cannot be made one. */
export async function shrinkImage(dataUrl: string, maxSide = 1280): Promise<string | null> {
  const sendable = SENDABLE.test(dataUrl) && dataUrl.length <= DESCRIBE_IMAGE_MAX_CHARS;
  try {
    const img = await load(dataUrl);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (sendable && longest <= maxSide) return dataUrl;
    if (longest === 0) return sendable ? dataUrl : null;
    const scale = Math.min(1, maxSide / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return sendable ? dataUrl : null;
    // JPEG has no transparency: put the image on white, as it shows on a card.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.85);
    return SENDABLE.test(out) && out.length <= DESCRIBE_IMAGE_MAX_CHARS ? out : sendable ? dataUrl : null;
  } catch {
    return sendable ? dataUrl : null;
  }
}
