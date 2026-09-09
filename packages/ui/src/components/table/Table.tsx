import type { ReactNode } from 'react';

import { Skeleton } from '../skeleton/Skeleton';

import './table.css';

export interface TableColumn<TRow> {
  key: string;
  header: ReactNode;
  render: (row: TRow) => ReactNode;
  /** CSS width (e.g. "140px"). */
  width?: string;
  align?: 'left' | 'center' | 'right';
  /** Hidden below 700px — keep the essential columns visible on phones. */
  hideOnMobile?: boolean;
  /** Never wraps. Use for dates, durations and counts, not for titles. */
  nowrap?: boolean;
}

export interface TableProps<TRow> {
  columns: TableColumn<TRow>[];
  rows: TRow[];
  rowKey: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  /** Rendered when there are no rows. */
  empty?: ReactNode;
  /**
   * Shows placeholder rows instead of the data.
   *
   * A table that vanishes and comes back moves everything below it twice; placeholder rows in the
   * table's own shape hold the layout still and say which part of the page is busy — which a
   * spinner in the middle of an empty box does not.
   */
  loading?: boolean;
  loadingRows?: number;
  /** `compact` for operational boards where thirty rows have to be comparable at a glance. */
  density?: 'comfortable' | 'compact';
  /** Keeps the header visible while the body scrolls. Needs a height limit on an ancestor. */
  stickyHeader?: boolean;
  /** Sets the table's own max height, so the sticky header has something to stick inside. */
  maxHeight?: string;
  'aria-label': string;
}

/** Dense data table; rows become clickable (keyboard too) when onRowClick is given. */
export function Table<TRow>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading = false,
  loadingRows = 5,
  density = 'comfortable',
  stickyHeader = false,
  maxHeight,
  ...rest
}: TableProps<TRow>) {
  if (!loading && rows.length === 0 && empty) {
    return <div className="ui-table__empty">{empty}</div>;
  }

  const wrapClasses = ['ui-table-wrap', stickyHeader ? 'ui-table-wrap--sticky' : '']
    .filter(Boolean)
    .join(' ');
  const tableClasses = ['ui-table', `ui-table--${density}`].join(' ');

  return (
    /*
     * No tab stop on the scroll container. Browsers now make an overflowing element keyboard
     * focusable on their own, and adding one by hand puts an extra stop in front of every table
     * on every dashboard — which costs a keyboard user more than it buys them.
     */
    <div className={wrapClasses} style={{ maxHeight }}>
      <table className={tableClasses} aria-label={rest['aria-label']} aria-busy={loading}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{ width: column.width, textAlign: column.align ?? 'left' }}
                className={cellClass(column)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: loadingRows }, (_, index) => (
                <tr key={`loading-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key} className={cellClass(column)}>
                      <Skeleton />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? 'ui-table__row--clickable' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{ textAlign: column.align ?? 'left' }}
                      className={cellClass(column)}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function cellClass<TRow>(column: TableColumn<TRow>): string | undefined {
  return (
    [
      column.hideOnMobile ? 'ui-table__cell--desktop' : '',
      column.nowrap ? 'ui-table__cell--nowrap' : '',
      // Right-aligned columns are numbers; tabular figures keep the digits in a column too.
      column.align === 'right' ? 'ui-table__cell--numeric' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined
  );
}
