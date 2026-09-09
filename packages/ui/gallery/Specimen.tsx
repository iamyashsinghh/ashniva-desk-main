import type { ReactNode } from 'react';

/**
 * One labelled example.
 *
 * The caption is part of the point: a gallery of unlabelled components tells a reviewer what
 * exists but not which state they are looking at, and states are what this page is for.
 */
export function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="specimen">
      <p className="specimen__label">{label}</p>
      <div className="specimen__stage">{children}</div>
    </div>
  );
}

/** A titled block of specimens, targeted by the side navigation. */
export function Section({
  id,
  title,
  summary,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section className="section" id={id} aria-labelledby={`${id}-heading`}>
      <h2 className="section__title" id={`${id}-heading`}>
        {title}
      </h2>
      {summary ? <p className="section__summary">{summary}</p> : null}
      <div className="section__body">{children}</div>
    </section>
  );
}

/** A row of specimens that sit side by side, e.g. every variant of a button. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="specimen-row">{children}</div>;
}
