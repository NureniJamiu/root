/**
 * Placeholder `dataUrl` the client sends for an image the server already
 * stores, so saving a canvas does not re-upload every image on every edit.
 * It satisfies `imageEntrySchema` (`startsWith('data:')`) but is never
 * rendered: the server swaps it for the stored image on every read.
 */
export const IMAGE_REF_DATA_URL = 'data:;root-image-ref';
