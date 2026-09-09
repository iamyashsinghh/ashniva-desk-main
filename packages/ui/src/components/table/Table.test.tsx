import { fireEvent, render, screen } from '@testing-library/react';

import { Table, type TableColumn } from './Table';

interface Row {
  id: string;
  key: string;
  minutes: number;
}

const columns: TableColumn<Row>[] = [
  { key: 'key', header: 'Task', render: (row) => row.key },
  { key: 'minutes', header: 'Time', align: 'right', render: (row) => row.minutes },
];

const rows: Row[] = [
  { id: '1', key: 'ACM-1', minutes: 30 },
  { id: '2', key: 'ACM-2', minutes: 90 },
];

describe('Table', () => {
  it('renders headers as column headers', () => {
    render(<Table aria-label="Tasks" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Task' })).toHaveAttribute('scope', 'col');
  });

  it('opens a row with Enter as well as with a click', () => {
    const onRowClick = vi.fn();
    render(
      <Table
        aria-label="Tasks"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
      />,
    );

    const firstRow = screen.getAllByRole('row')[1]!;
    fireEvent.keyDown(firstRow, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  /**
   * A table that vanishes while it reloads moves everything below it twice. Placeholder rows in
   * the table's own shape keep the page still, and `aria-busy` says which part is working.
   */
  it('holds its shape while loading and says it is busy', () => {
    render(
      <Table
        aria-label="Tasks"
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        loading
        loadingRows={3}
        empty={<p>No tasks</p>}
      />,
    );

    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    // Three placeholder rows plus the header row; the empty state is not shown while loading.
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByText('No tasks')).not.toBeInTheDocument();
  });

  it('shows the empty state only once loading is done', () => {
    render(
      <Table
        aria-label="Tasks"
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        empty={<p>No tasks</p>}
      />,
    );
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('marks a right-aligned column as numeric so its digits line up', () => {
    render(<Table aria-label="Tasks" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getByRole('columnheader', { name: 'Time' })).toHaveClass(
      'ui-table__cell--numeric',
    );
  });
});
