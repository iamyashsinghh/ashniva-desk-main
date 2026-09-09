import { WORK_AREAS, normalizeWorkArea } from '@ashniva/types';
import { Button, Input } from '@ashniva/ui';
import { useState } from 'react';

import './work-areas.css';

/**
 * Picks what a piece of work is — Frontend, API, DevOps — from suggestions or by typing.
 *
 * The suggestions are the common answers, not the permitted ones: a team that calls it "Data
 * engineering" types that and it is kept. Everything is normalised on the way in so the tags a
 * support router later matches against do not fragment into "api", "API" and "Api".
 */
export function WorkAreaPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (areas: string[]) => void;
  disabled?: boolean;
}) {
  const [typed, setTyped] = useState('');

  const has = (area: string) => value.some((entry) => entry.toLowerCase() === area.toLowerCase());

  const toggle = (area: string) => {
    const normalized = normalizeWorkArea(area);
    onChange(
      has(normalized)
        ? value.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())
        : [...value, normalized],
    );
  };

  const addTyped = () => {
    const area = normalizeWorkArea(typed);
    if (area && !has(area)) {
      onChange([...value, area]);
    }
    setTyped('');
  };

  // Anything the manager added that is not one of the suggestions still needs a chip to remove it.
  const extras = value.filter(
    (entry) => !WORK_AREAS.some((area) => area.toLowerCase() === entry.toLowerCase()),
  );

  return (
    <div className="work-areas">
      <div className="work-areas__chips">
        {[...WORK_AREAS, ...extras].map((area) => (
          <button
            key={area}
            type="button"
            disabled={disabled}
            aria-pressed={has(area)}
            className={`work-areas__chip${has(area) ? ' work-areas__chip--on' : ''}`}
            onClick={() => toggle(area)}
          >
            {area}
          </button>
        ))}
      </div>
      <div className="work-areas__add">
        <Input
          value={typed}
          disabled={disabled}
          placeholder="Another area"
          aria-label="Add another work area"
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Otherwise this submits the surrounding form instead of adding the tag.
              event.preventDefault();
              addTyped();
            }
          }}
        />
        <Button type="button" disabled={disabled || typed.trim() === ''} onClick={addTyped}>
          Add
        </Button>
      </div>
    </div>
  );
}
