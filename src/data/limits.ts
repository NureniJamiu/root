/**
 * Size limits shared by the schema, the mutators and every input that edits
 * the matching field, so the UI and the validation never disagree.
 */

/** Maximum length of an idea's title. */
export const NODE_TITLE_MAX = 200;

/** Maximum length of an idea's notes. */
export const NODE_BODY_MAX = 20_000;

/** Maximum length of a project (canvas) title. */
export const CANVAS_TITLE_MAX = 200;

/** Per-image data-URL byte cap: 2 MB (design.md §Error Handling, R4.4). */
export const IMAGE_DATA_URL_MAX_BYTES = 2 * 1024 * 1024;

/** Maximum length of an image's caption (written by AI image descriptions). */
export const IMAGE_CAPTION_MAX = 300;

/** Maximum length of the text read out of an image. */
export const IMAGE_TEXT_MAX = 2_000;

/** Maximum length of a source's title, site or publisher. */
export const SOURCE_TEXT_MAX = 500;

/** Maximum length of a source's web address. */
export const SOURCE_URL_MAX = 2_000;

/** Most authors kept for one source. */
export const SOURCE_AUTHORS_MAX = 30;

/** Maximum length of the passage quoted from a source. */
export const SOURCE_QUOTE_MAX = 4_000;
