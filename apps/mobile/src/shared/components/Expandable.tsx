import { useState, type ReactNode } from 'react';

import { animateLayout } from '../theme/motion';
import { Button } from './primitives';

/**
 * The first few of a list the screen already has, and a button for the rest.
 *
 * Only ever over data already on the device: "show all" never asks the server for more, it
 * reveals what was folded away so a long history does not push everything else off the screen.
 */
export function Expandable<T>({
  items,
  initial,
  noun,
  children,
}: {
  items: readonly T[];
  initial: number;
  /** What the items are, for the button: "Show all 14 comments". */
  noun: string;
  children: (item: T, index: number) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, initial);
  const hidden = items.length - shown.length;

  return (
    <>
      {shown.map((item, index) => children(item, index))}
      {hidden > 0 ? (
        <Button
          label={`Show all ${items.length} ${noun}`}
          variant="ghost"
          size="sm"
          onPress={() => {
            animateLayout();
            setAll(true);
          }}
        />
      ) : null}
    </>
  );
}
