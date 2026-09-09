import type { CSSProperties } from 'react';

import './skeleton.css';

export interface SkeletonProps {
  /** Any CSS width; defaults to filling the parent. */
  width?: string;
  /** Any CSS height; defaults to one line of text at the current size. */
  height?: string;
  /** A circle for avatars, a pill for chips, otherwise the small radius. */
  shape?: 'block' | 'pill' | 'circle';
  className?: string;
}

/**
 * A placeholder in the shape of the thing that is loading.
 *
 * Deliberately `aria-hidden`. A skeleton is a picture of content that does not exist yet, and
 * announcing it announces nothing; the container that is loading owns the live region and says
 * "Loading" once, rather than a screen reader reading out eleven grey boxes.
 */
export function Skeleton({ width, height, shape = 'block', className }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  const classes = ['ui-skeleton', `ui-skeleton--${shape}`, className].filter(Boolean).join(' ');
  return <span className={classes} style={style} aria-hidden="true" />;
}

export interface SkeletonTextProps {
  /** How many lines of body text to stand in for. */
  lines?: number;
  className?: string;
}

/**
 * Several lines of placeholder text, the last one short.
 *
 * The short last line is the whole trick: equal-length bars read as a table, ragged ones read as
 * a paragraph, and the reader knows which is coming before it arrives.
 */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  const classes = ['ui-skeleton-text', className].filter(Boolean).join(' ');
  return (
    <span className={classes} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '55%' : '100%'} />
      ))}
    </span>
  );
}
