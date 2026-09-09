import { Card, Kpi, KpiGrid, Skeleton, SkeletonText } from '@ashniva/ui';

import '../../features/dashboard/dashboard.css';

/**
 * The loading shapes the list and detail screens hand to `QueryState`.
 *
 * One file rather than a private skeleton per screen, because the value of a skeleton is that it
 * is the *same* shape as what arrives, and there are only three shapes in this product: a page of
 * cards, a two-column detail page, and a table. A screen with a shape of its own still writes its
 * own; these cover the seventy that do not.
 *
 * Each one is `aria-busy` with a single visually hidden sentence. The placeholders themselves are
 * `aria-hidden` (see `Skeleton`), so a screen reader hears "Loading tickets" once instead of
 * reading out fourteen grey boxes.
 */

interface LoadingProps {
  /** What is loading, e.g. "tickets". Completes the sentence "Loading …". */
  label?: string;
}

/** A detail screen: a title block, then a wide column beside a narrow one. */
export function DetailSkeleton({ label = 'this page' }: LoadingProps) {
  return (
    <div className="detail-page" aria-busy="true">
      <span className="sr-only">Loading {label}</span>
      <div className="detail-skeleton__header">
        <Skeleton width="12rem" height="var(--font-size-sm)" />
        <Skeleton width="60%" height="var(--font-size-2xl)" />
        <Skeleton width="20rem" height="var(--font-size-sm)" />
      </div>
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <Card title="">
            <SkeletonText lines={6} />
          </Card>
          <Card title="">
            <SkeletonText lines={4} />
          </Card>
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="">
            <SkeletonText lines={3} />
          </Card>
          <Card title="">
            <SkeletonText lines={7} />
          </Card>
        </div>
      </div>
    </div>
  );
}

interface CardsSkeletonProps extends LoadingProps {
  /** How many placeholder cards to draw. Match what the screen usually shows above the fold. */
  cards?: number;
  /** Lines of body text inside each card. */
  lines?: number;
}

/** A grid of equal cards: the portal's screens, the settings screens, the policy lists. */
export function CardsSkeleton({ label = 'this page', cards = 4, lines = 4 }: CardsSkeletonProps) {
  return (
    <div className="dashboard__grid dashboard__grid--equal" aria-busy="true">
      <span className="sr-only">Loading {label}</span>
      {Array.from({ length: cards }, (_, index) => (
        <Card key={index} title="">
          <SkeletonText lines={lines} />
        </Card>
      ))}
    </div>
  );
}

interface StatsAndListSkeletonProps extends LoadingProps {
  /** Number of KPI tiles above the list. Zero for a screen with no tile row. */
  tiles?: number;
  lines?: number;
}

/** A row of KPI tiles above one wide card: the reports and queue screens. */
export function StatsAndListSkeleton({
  label = 'this page',
  tiles = 4,
  lines = 8,
}: StatsAndListSkeletonProps) {
  return (
    <div className="dashboard" aria-busy="true">
      <span className="sr-only">Loading {label}</span>
      {tiles > 0 ? (
        <KpiGrid>
          {Array.from({ length: tiles }, (_, index) => (
            <Kpi key={index} label="" value="" loading />
          ))}
        </KpiGrid>
      ) : null}
      <Card title="">
        <SkeletonText lines={lines} />
      </Card>
    </div>
  );
}
