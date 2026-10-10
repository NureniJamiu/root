/**
 * How ideas look inside a document.
 *
 *   - `IdeaRefView`: an inline chip in the idea's type colour that always shows
 *     the idea's current title. Hover previews the card; click selects the
 *     idea on the canvas and brings it into view. A deleted idea keeps its
 *     last title, struck through.
 *   - `IdeaCardView`: the idea's card as a block, live from the canvas, with
 *     "Show on canvas" and "Convert to text" (which turns it into ordinary,
 *     editable paragraphs).
 */

import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { useRef, useState } from 'react';

import { useCanvasStore } from '../data';
import type { Node, NodeType } from '../data';
import { MarkdownText } from '../nodes';

import { useDocumentEditorServices } from './context';
import { notesToBlocks } from './draftFromBranch';
import { IDEA_REF } from './schema';

const TYPE_LABEL: Record<NodeType, string> = {
  topic: 'Topic',
  finding: 'Finding',
  question: 'Question',
  conclusion: 'Conclusion',
};

function useIdea(id: unknown): Node | undefined {
  return useCanvasStore((s) => (typeof id === 'string' ? s.canvas.nodes.find((n) => n.id === id) : undefined));
}

/* -------------------------------------------------------------------------- */
/* Inline mention                                                             */
/* -------------------------------------------------------------------------- */

function IdeaPreview({ idea }: { readonly idea: Node }): JSX.Element {
  const image = idea.images[0];
  return (
    <span className="idea-preview" role="tooltip" contentEditable={false}>
      <span className="idea-preview-type" style={{ color: `rgb(var(--${idea.type}))` }}>
        {TYPE_LABEL[idea.type]}
      </span>
      <span className="idea-preview-title">{idea.title || 'Untitled idea'}</span>
      {idea.body.trim() && <MarkdownText source={idea.body} className="idea-preview-body" />}
      {image && <img className="idea-preview-image" src={image.dataUrl} alt="" />}
      <span className="idea-preview-hint">Click to show on the canvas</span>
    </span>
  );
}

export function IdeaRefView({ node, selected }: ReactNodeViewProps): JSX.Element {
  const services = useDocumentEditorServices();
  const idea = useIdea(node.attrs.id);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const label = idea ? idea.title || 'Untitled idea' : (node.attrs.label as string) || 'Removed idea';

  const show = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(true), 250);
  };
  const hide = (): void => {
    if (timer.current) clearTimeout(timer.current);
    setHover(false);
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`idea-ref ${idea ? `idea-ref--${idea.type}` : 'idea-ref--missing'} ${selected ? 'is-selected' : ''}`}
      data-idea-ref=""
      data-node-id={node.attrs.id}
      data-testid="idea-ref"
      title={idea ? undefined : 'This idea was removed from the canvas'}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={() => {
        hide();
        if (idea) services.focusIdea(idea.id);
      }}
    >
      <span className="idea-ref-dot" aria-hidden="true" />
      {label}
      {hover && idea && <IdeaPreview idea={idea} />}
    </NodeViewWrapper>
  );
}

/* -------------------------------------------------------------------------- */
/* Embedded card                                                              */
/* -------------------------------------------------------------------------- */

export function IdeaCardView({ node, selected, editor, getPos, deleteNode }: ReactNodeViewProps): JSX.Element {
  const services = useDocumentEditorServices();
  const idea = useIdea(node.attrs.nodeId);
  const label = (node.attrs.label as string) || 'Removed idea';

  const convertToText = (): void => {
    if (!idea) return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const heading = {
      type: 'paragraph',
      content: [{ type: IDEA_REF, attrs: { id: idea.id, label: idea.title || 'Untitled idea' } }],
    };
    editor
      .chain()
      .focus()
      .insertContentAt({ from: pos, to: pos + node.nodeSize }, [heading, ...notesToBlocks(idea.body)])
      .run();
  };

  return (
    <NodeViewWrapper
      className={`idea-card ${selected ? 'is-selected' : ''} ${idea ? '' : 'idea-card--missing'}`}
      data-idea-card=""
      data-node-id={node.attrs.nodeId}
      data-testid="idea-card"
      contentEditable={false}
    >
      <div className="idea-card-bar" style={idea ? { background: `rgb(var(--${idea.type}))` } : undefined} />
      <div className="idea-card-body" data-drag-handle="">
        {idea ? (
          <>
            <div className="idea-card-head">
              <span className="idea-card-type" style={{ color: `rgb(var(--${idea.type}))` }}>
                {TYPE_LABEL[idea.type]}
              </span>
              <span className="idea-card-actions">
                <button type="button" onClick={() => services.focusIdea(idea.id)} data-testid="idea-card-show">
                  Show on canvas
                </button>
                <button type="button" onClick={convertToText} data-testid="idea-card-convert">
                  Convert to text
                </button>
                <button type="button" onClick={() => deleteNode()} aria-label="Remove card from document">
                  Remove
                </button>
              </span>
            </div>
            <div className="idea-card-title">{idea.title || 'Untitled idea'}</div>
            {idea.body.trim() && <MarkdownText source={idea.body} className="idea-card-notes" />}
            {idea.images.length > 0 && (
              <div className="idea-card-images">
                {idea.images.slice(0, 3).map((img) => (
                  <img key={img.id} src={img.dataUrl} alt="" />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="idea-card-head">
            <span className="idea-card-title">{label}</span>
            <span className="idea-card-actions">
              <span className="idea-card-missing-note">Removed from the canvas</span>
              <button type="button" onClick={() => deleteNode()}>
                Remove
              </button>
            </span>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
