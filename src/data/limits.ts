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
