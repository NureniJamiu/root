/**
 * `ChildRevealMenu` — the small list that opens from the arrow beside a
 * card's collapse button. It names each idea this card connects to and lets
 * the user show or hide them one at a time, in any order (handy when
 * presenting: reveal the second finding before the first).
 *
 * A thin line drops from the arrow and each idea hangs off it in its own
 * small box, like a branch. Shown ideas are in dark text, hidden ones in
 * grey; a box grows a little under the pointer. Clicking a hidden idea
 * reveals just it and its connector; clicking a shown one hides it again.
 * A revealed idea is selected, so the inspector opens on it. Either way the
 * list closes; open it again for the next one. It works from
 * the keyboard too (arrows, Enter or Space) and also closes on a click
 * elsewhere, Escape, Tab or zooming. It is drawn in a portal on top of the
 * page so other cards never cover it.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { canvasActions, childReveals, formatNodeLabel, nodeOrdinals, useCanvasStore } from '../data';
import type { UUID } from '../data';

export interface ChildRevealMenuProps {
  readonly nodeId: UUID;
  /** Viewport rectangle of the arrow button the menu hangs from. */
  readonly anchor: DOMRect;
  /** `true` when closed from the keyboard, so focus can go back to the arrow. */
  readonly onClose: (fromKeyboard?: boolean) => void;
}

/** Branch line plus box: the whole width the list takes beside the arrow. */
const MENU_WIDTH = 224;

export function ChildRevealMenu({ nodeId, anchor, onClose }: ChildRevealMenuProps): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const children = useMemo(() => childReveals(canvas, nodeId), [canvas, nodeId]);
  const ordinals = useMemo(() => nodeOrdinals(canvas), [canvas]);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Keyboard: the first idea takes focus when the list opens; arrows,
  // Home and End move between ideas; Enter or Space toggles one.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')?.focus({ preventScroll: true });
  }, []);
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]') ?? [])];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number): void => {
      e.preventDefault();
      e.stopPropagation();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if ((e.key === ' ' || e.key === 'Enter') && at >= 0) {
      // Toggle here rather than on the native key-up click, which the
      // canvas's own Space handling can swallow.
      e.preventDefault();
      e.stopPropagation();
      items[at]?.click();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onClose(true);
    }
  };

  useEffect(() => {
    const onPointer = (e: MouseEvent): void => {
      const target = e.target as globalThis.Node | null;
      if (target && menuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-child-reveal-toggle]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(true);
      }
    };
    const onWheel = (e: WheelEvent): void => {
      if (menuRef.current?.contains(e.target as globalThis.Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('wheel', onWheel, true);
    };
  }, [onClose]);

  // Nothing left to list (the last child was deleted or disconnected).
  useEffect(() => {
    if (children.length === 0) onClose();
  }, [children.length, onClose]);

  // A line drops from the arrow and each idea hangs off it in its own box,
  // out to the right over the card's edge (mirrored when there is no room).
  const spineX = anchor.left + anchor.width / 2;
  const toRight = spineX + MENU_WIDTH <= window.innerWidth - 8;
  const top = anchor.bottom + 2;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Show or hide connected ideas"
      data-testid="child-reveal-menu"
      data-side={toRight ? 'right' : 'left'}
      className="reveal-tree fixed z-[60] pt-1.5"
      style={toRight ? { left: spineX - 0.75, top, width: MENU_WIDTH } : { left: spineX - MENU_WIDTH + 0.75, top, width: MENU_WIDTH }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onMenuKeyDown}
    >
      {children.map(({ node, shown }, i) => {
        const label = formatNodeLabel(node, ordinals.get(node.id) ?? 0);
        const title = node.title.trim() || 'Untitled idea';
        const last = i === children.length - 1;
        return (
          <div
            key={node.id}
            className={`reveal-tree-row ${last ? 'is-last' : ''} ${toRight ? '' : 'is-mirrored'}`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span aria-hidden="true" className="reveal-tree-branch" />
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={shown}
              aria-label={`${title}, ${shown ? 'shown' : 'hidden'}`}
              data-testid={`child-reveal-item-${node.id}`}
              data-shown={shown ? 'true' : 'false'}
              title={shown ? 'Hide' : 'Reveal'}
              onClick={(e) => {
                if (shown) canvasActions.hideChild(nodeId, node.id);
                else {
                  canvasActions.revealChild(nodeId, node.id);
                  // Select the idea just revealed so the inspector shows it.
                  canvasActions.select(node.id);
                }
                // One pick per opening; a keyboard pick (detail 0) hands focus back to the arrow.
                onClose(e.detail === 0);
              }}
              className={`reveal-tree-item flex min-w-0 flex-1 items-baseline gap-1.5 rounded-[4px] bg-panel px-2.5 py-1.5 text-left text-[12px] leading-[17px] cursor-pointer focus-visible:outline-none ${shown ? 'is-shown text-ink font-medium' : 'text-faint'
                }`}
            >
              <span className="shrink-0 font-mono text-[9px] font-normal text-faint">{label}</span>
              <span className="min-w-0 flex-1 truncate hover:text-black">{title}</span>
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
