/**
 * Speaker notes for a walkthrough, written by AI: an opening, a note per
 * idea and a closing. The walkthrough bar shows the note for the idea just
 * revealed.
 *
 * View state for the project in front of the person, like the walkthrough
 * itself: kept in memory, never saved, dropped when another project opens.
 */

import { create } from 'zustand';

import type { UUID } from './types';

export interface SpeakerNotes {
  /** The canvas the notes were written for. */
  readonly canvasId: string;
  readonly opening: string;
  /** Ideas in presentation order, each with its note (may be empty). */
  readonly steps: ReadonlyArray<{ readonly ideaId: UUID; readonly note: string }>;
  readonly closing: string;
  /** Which model wrote them. */
  readonly modelLabel: string;
}

export interface SpeakerNotesState {
  notes: SpeakerNotes | null;
}

export const useSpeakerNotesStore = create<SpeakerNotesState>(() => ({ notes: null }));

export const speakerNotesActions = {
  set(notes: SpeakerNotes): void {
    useSpeakerNotesStore.setState({ notes });
  },
  clear(): void {
    useSpeakerNotesStore.setState({ notes: null });
  },
};

/** The note for `ideaId` in `notes`, or null. */
export function noteFor(notes: SpeakerNotes | null, ideaId: UUID): string | null {
  return notes?.steps.find((s) => s.ideaId === ideaId)?.note || null;
}

/** The whole script as plain text, for copying into slides or a document. */
export function scriptText(notes: SpeakerNotes, titleOf: (ideaId: UUID) => string): string {
  const parts = [notes.opening.trim()];
  notes.steps.forEach((step, i) => {
    parts.push(`${i + 1}. ${titleOf(step.ideaId)}${step.note ? `\n${step.note}` : ''}`);
  });
  parts.push(notes.closing.trim());
  return parts.filter(Boolean).join('\n\n');
}
