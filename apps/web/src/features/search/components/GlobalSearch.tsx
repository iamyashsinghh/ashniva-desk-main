import { SEARCH_MIN_QUERY_LENGTH, type SearchHit } from '@ashniva/types';
import { Input, Spinner } from '@ashniva/ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useSearchQuery } from '../api';

import '../search.css';

/** Long enough that a typist does not fire a request per keystroke, short enough to feel live. */
const DEBOUNCE_MS = 250;

interface GlobalSearchProps {
  /** Where "See all results" goes: the internal results page or the portal's. */
  resultsPath: string;
}

const keyOf = (hit: SearchHit) => `${hit.type}-${hit.id}`;

/**
 * The topbar search box: a combobox whose listbox is grouped by entity type.
 *
 * Keyboard: ↓/↑ walk every hit in the panel as one list, across the group headings, and wrap;
 * Home and End jump to the ends; Enter opens the active hit, or the full results page when
 * nothing is active; Escape closes the panel, and closes it a second time by clearing the box.
 * The input keeps DOM focus throughout and `aria-activedescendant` names the active row, which is
 * what lets a screen reader announce the row while typing still goes to the input.
 *
 * What is active is remembered as the *hit's* key, not its position. A new result set arrives
 * while somebody is still typing; an index would keep the highlight on row 2 of a list that is
 * now about something else, and Enter would open the wrong thing.
 *
 * The panel shows only what the API returned. It has no idea which modules the caller can search
 * — the server decides that per module — so there is nothing here to keep in step with it.
 */
export function GlobalSearch({ resultsPath }: GlobalSearchProps) {
  const navigate = useNavigate();
  const listId = useId();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const query = useSearchQuery(debounced);
  const groups = useMemo(() => query.data?.groups ?? [], [query.data]);
  /** The panel read as one list, which is what the arrow keys move through. */
  const flat = useMemo(() => groups.flatMap((group) => group.hits), [groups]);
  /** Where each group starts in that list, so a row can name its own position. */
  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let running = 0;
    for (const group of groups) {
      offsets.push(running);
      running += group.hits.length;
    }
    return offsets;
  }, [groups]);

  // Derived, not stored: a key that is no longer in the results simply stops being active.
  const activeIndex = activeKey === null ? -1 : flat.findIndex((hit) => keyOf(hit) === activeKey);

  const trimmed = term.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < SEARCH_MIN_QUERY_LENGTH;
  const showPanel = open && trimmed.length > 0;

  function go(hit: SearchHit) {
    setOpen(false);
    setTerm('');
    setActiveKey(null);
    void navigate(hit.href);
  }

  function seeAll() {
    setOpen(false);
    void navigate(`${resultsPath}?q=${encodeURIComponent(trimmed)}`);
  }

  /** Moves the active row by one, wrapping. `-1` (nothing active) enters at the matching end. */
  function move(step: 1 | -1) {
    if (flat.length === 0) {
      return;
    }
    let next: number;
    if (activeIndex < 0) {
      next = step === 1 ? 0 : flat.length - 1;
    } else {
      next = (activeIndex + step + flat.length) % flat.length;
    }
    activate(next);
  }

  function activate(index: number) {
    const hit = flat[index];
    if (hit) {
      setActiveKey(keyOf(hit));
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (open) {
        setOpen(false);
      } else {
        setTerm('');
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if ((event.key === 'Home' || event.key === 'End') && flat.length > 0) {
      event.preventDefault();
      activate(event.key === 'Home' ? 0 : flat.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = flat[activeIndex];
      if (hit) {
        go(hit);
      } else if (trimmed.length >= SEARCH_MIN_QUERY_LENGTH) {
        seeAll();
      }
    }
  }

  return (
    <div className="global-search" ref={containerRef}>
      <Input
        type="search"
        className="global-search__input"
        placeholder="Search"
        aria-label="Search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showPanel ? (
        <div className="global-search__panel">
          {tooShort ? (
            <p className="global-search__status">
              Keep typing — at least {SEARCH_MIN_QUERY_LENGTH} characters.
            </p>
          ) : null}
          {!tooShort && query.isPending ? (
            <p className="global-search__status">
              <Spinner size="sm" label="Searching" />
              Searching…
            </p>
          ) : null}
          {!tooShort && query.isError ? (
            <p className="global-search__status">Search is unavailable right now.</p>
          ) : null}
          {!tooShort && query.isSuccess && flat.length === 0 ? (
            <p className="global-search__status">No matches.</p>
          ) : null}
          <div id={listId} role="listbox" aria-label="Search results">
            {groups.map((group, groupIndex) => (
              <div key={group.type} role="group" aria-label={group.label}>
                <p className="global-search__group-label">
                  <span>{group.label}</span>
                  {group.hasMore ? <span>more</span> : null}
                </p>
                {group.hits.map((hit, hitIndex) => {
                  const index = (groupOffsets[groupIndex] ?? 0) + hitIndex;
                  return (
                    <button
                      type="button"
                      key={keyOf(hit)}
                      id={`${listId}-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`global-search__option${
                        index === activeIndex ? ' global-search__option--active' : ''
                      }`}
                      onMouseEnter={() => setActiveKey(keyOf(hit))}
                      onClick={() => go(hit)}
                    >
                      {hit.reference ? (
                        <span className="global-search__reference">{hit.reference}</span>
                      ) : null}
                      <span className="global-search__title">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="global-search__subtitle">{hit.subtitle}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {flat.length > 0 ? (
            <button type="button" className="global-search__more" onClick={seeAll}>
              See all results for “{trimmed}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
