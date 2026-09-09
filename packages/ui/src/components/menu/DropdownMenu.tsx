import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import './menu.css';

export interface MenuItem {
  key: string;
  label: ReactNode;
  /** Runs when the item is chosen. */
  onSelect?: () => void;
  /** Renders the item as a link instead. Pass `renderLink` to route it client-side. */
  href?: string;
  disabled?: boolean;
  /** Destructive actions read as danger. */
  danger?: boolean;
}

/** Everything a link item must carry to behave as a menu item. Spread it, do not cherry-pick. */
export interface MenuLinkProps {
  role: 'menuitem';
  tabIndex: -1;
  className: string;
  ref: (element: HTMLAnchorElement | null) => void;
  onClick: () => void;
}

export interface DropdownMenuProps {
  /** The button's content. */
  trigger: ReactNode;
  items: MenuItem[];
  /** Accessible name for the trigger and the menu, needed when the trigger is an icon. */
  triggerLabel?: string;
  /** Non-interactive content at the top of the menu, e.g. who is signed in. */
  header?: ReactNode;
  align?: 'start' | 'end';
  /**
   * Renders an `href` item with the app's router link.
   *
   * `packages/ui` cannot import the router, and a menu whose links reload the page is a menu
   * people avoid — so the app hands its `<Link>` in and spreads the props it is given.
   */
  renderLink?: (href: string, label: ReactNode, props: MenuLinkProps) => ReactNode;
  className?: string;
}

/** Indexes a keyboard can land on. A disabled item stays visible and stays unreachable. */
function enabledIndexes(items: MenuItem[]): number[] {
  return items.flatMap((item, index) => (item.disabled ? [] : [index]));
}

/**
 * A button that opens a list of actions.
 *
 * The one in the top bar is a `role="menu"` div that opens on click and does nothing else: no
 * arrow keys, no Escape, no closing when you click elsewhere, and focus left behind on the trigger
 * while the menu is open. `role="menu"` is a promise of keyboard behaviour, and this keeps it —
 * arrows and Home/End move, Escape and Tab close and return focus to the trigger, a pointer press
 * outside closes, and the first item takes focus when the menu opens.
 */
export function DropdownMenu({
  trigger,
  items,
  triggerLabel,
  header,
  align = 'end',
  renderLink,
  className,
}: DropdownMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const reachable = enabledIndexes(items);

  const closeAndRestore = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Focus follows the active index, which is what makes an arrow key read out the item it landed
  // on rather than moving a highlight nobody is told about.
  useEffect(() => {
    if (open) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [open, activeIndex]);

  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAt(reachable[0] ?? 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(reachable[reachable.length - 1] ?? 0);
    }
  }

  function moveBy(step: number) {
    const position = reachable.indexOf(activeIndex);
    const next = (position + step + reachable.length) % reachable.length;
    setActiveIndex(reachable[next] ?? activeIndex);
  }

  function onMenuKeyDown(event: ReactKeyboardEvent) {
    // Tab closes rather than stepping through the items: a menu is one tab stop, not a set of them.
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeAndRestore();
      return;
    }
    if (reachable.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveBy(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveBy(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(reachable[0] ?? activeIndex);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(reachable[reachable.length - 1] ?? activeIndex);
    }
  }

  function choose(item: MenuItem) {
    closeAndRestore();
    item.onSelect?.();
  }

  function itemProps(index: number, item: MenuItem) {
    const className = ['ui-menu__item', item.danger ? 'ui-menu__item--danger' : '']
      .filter(Boolean)
      .join(' ');
    return {
      className,
      setRef: (element: HTMLElement | null) => {
        itemRefs.current[index] = element;
      },
    };
  }

  return (
    <div className={['ui-menu', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? setOpen(false) : openAt(reachable[0] ?? 0))}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          // The container is never tabbed to — focus goes straight to an item — but it must be
          // programmatically focusable for the role to be valid.
          tabIndex={-1}
          aria-label={triggerLabel}
          className={`ui-menu__list ui-menu__list--${align}`}
          onKeyDown={onMenuKeyDown}
        >
          {header ? <div className="ui-menu__header">{header}</div> : null}
          {items.map((item, index) => {
            const { className, setRef } = itemProps(index, item);
            if (item.href !== undefined && !item.disabled) {
              const linkProps: MenuLinkProps = {
                role: 'menuitem',
                tabIndex: -1,
                className,
                ref: setRef,
                onClick: () => choose(item),
              };
              if (renderLink) {
                return (
                  <ItemFragment key={item.key}>
                    {renderLink(item.href, item.label, linkProps)}
                  </ItemFragment>
                );
              }
              return (
                <a key={item.key} href={item.href} {...linkProps}>
                  {item.label}
                </a>
              );
            }
            return (
              <button
                key={item.key}
                ref={setRef}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={className}
                disabled={item.disabled}
                onClick={() => choose(item)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Renders a caller-supplied link as-is. Its own component only so the key lives on one node. */
function ItemFragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
