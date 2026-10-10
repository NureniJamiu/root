/**
 * The floating menus that open while typing: `@` to cite an idea and `/` for
 * blocks. One list component serves both; `popupRenderer` mounts it next to
 * the caret and forwards the arrow keys, Enter and Escape to it.
 */

import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/* Items                                                                      */
/* -------------------------------------------------------------------------- */

export interface MenuItem {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  /** Small coloured dot (idea type) or a glyph shown at the start of the row. */
  readonly color?: string;
  readonly glyph?: ReactNode;
}

export interface MenuListProps<I extends MenuItem> {
  readonly items: readonly I[];
  readonly command: (item: I & { embed?: boolean }) => void;
  readonly heading: string;
  readonly empty: string;
  /** Shown under the list, e.g. what Shift+Enter does. */
  readonly footer?: string;
  /** Shift+Enter picks the item with `embed: true`. */
  readonly allowEmbed?: boolean;
}

export interface MenuListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

function MenuListInner<I extends MenuItem>(
  { items, command, heading, empty, footer, allowEmbed }: MenuListProps<I>,
  ref: React.Ref<MenuListHandle>,
): JSX.Element {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIndex(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const pick = (i: number, embed = false): void => {
    const item = items[i];
    if (item) command(embed && allowEmbed ? { ...item, embed: true } : item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        setIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(index, event.shiftKey);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="doc-menu" role="listbox" aria-label={heading} data-testid="doc-suggestion-menu">
      <div className="doc-menu-heading">{heading}</div>
      <div ref={listRef} className="doc-menu-list">
        {items.length === 0 ? (
          <div className="doc-menu-empty">{empty}</div>
        ) : (
          items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={i === index}
              data-index={i}
              className={`doc-menu-item ${i === index ? 'is-active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => pick(i, e.shiftKey)}
            >
              {item.color ? (
                <span className="doc-menu-dot" style={{ background: item.color }} aria-hidden="true" />
              ) : (
                <span className="doc-menu-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
              )}
              <span className="doc-menu-label">{item.label}</span>
              {item.hint && <span className="doc-menu-hint">{item.hint}</span>}
            </button>
          ))
        )}
      </div>
      {footer && items.length > 0 && <div className="doc-menu-footer">{footer}</div>}
    </div>
  );
}

export const MenuList = forwardRef(MenuListInner) as <I extends MenuItem>(
  props: MenuListProps<I> & { ref?: React.Ref<MenuListHandle> },
) => JSX.Element;

/* -------------------------------------------------------------------------- */
/* Popup renderer                                                             */
/* -------------------------------------------------------------------------- */

type Static<I extends MenuItem> = Omit<MenuListProps<I>, 'items' | 'command'>;

/** A `render` for `@tiptap/suggestion` that shows `MenuList` beside the caret. */
export function popupRenderer<I extends MenuItem>(
  staticProps: Static<I>,
): NonNullable<SuggestionOptions<I, I & { embed?: boolean }>['render']> {
  return () => {
    let renderer: ReactRenderer<MenuListHandle, MenuListProps<I>> | null = null;
    let host: HTMLDivElement | null = null;

    const place = (props: SuggestionProps<I, I & { embed?: boolean }>): void => {
      const rect = props.clientRect?.();
      if (!host || !rect) return;
      const virtual = { getBoundingClientRect: () => rect };
      void computePosition(virtual, host, {
        placement: 'bottom-start',
        strategy: 'fixed',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (host) Object.assign(host.style, { left: `${x}px`, top: `${y}px` });
      });
    };

    return {
      onStart(props) {
        renderer = new ReactRenderer(MenuList as never, {
          editor: props.editor,
          props: { ...staticProps, items: props.items, command: props.command },
        }) as unknown as ReactRenderer<MenuListHandle, MenuListProps<I>>;
        host = document.createElement('div');
        host.className = 'doc-menu-host';
        Object.assign(host.style, { position: 'fixed', left: '0px', top: '0px', zIndex: '80' });
        host.appendChild(renderer.element);
        document.body.appendChild(host);
        place(props);
      },
      onUpdate(props) {
        renderer?.updateProps({ ...staticProps, items: props.items, command: props.command });
        place(props);
      },
      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === 'Escape') {
          host?.remove();
          host = null;
          return true;
        }
        return renderer?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit() {
        host?.remove();
        host = null;
        renderer?.destroy();
        renderer = null;
      },
    };
  };
}
