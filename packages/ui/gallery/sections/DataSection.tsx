import { useState } from 'react';

import { Avatar } from '../../src/components/avatar/Avatar';
import { Badge } from '../../src/components/badge/Badge';
import { PriorityDot } from '../../src/components/badge/PriorityDot';
import { StatusPill } from '../../src/components/badge/StatusPill';
import { VisibilityBadge } from '../../src/components/badge/VisibilityBadge';
import { Card } from '../../src/components/card/Card';
import { DescriptionList } from '../../src/components/description-list/DescriptionList';
import { EmptyState } from '../../src/components/empty-state/EmptyState';
import { Kpi, KpiGrid } from '../../src/components/kpi/Kpi';
import { Meter } from '../../src/components/meter/Meter';
import { Table, type TableColumn } from '../../src/components/table/Table';
import { SegmentedControl } from '../../src/components/tabs/Tabs';
import type { Tone } from '../../src/tokens/status-tone';
import { Row, Section, Specimen } from '../Specimen';

const TONES: Tone[] = ['neutral', 'info', 'progress', 'warning', 'success', 'review', 'danger'];

interface DemoRow {
  id: string;
  key: string;
  title: string;
  assignee: string;
  minutes: number;
  tone: Tone;
  status: string;
}

const ROWS: DemoRow[] = [
  {
    id: '1',
    key: 'ACM-412',
    title: 'Migrate the billing importer',
    assignee: 'Ada Lovelace',
    minutes: 145,
    tone: 'progress',
    status: 'In progress',
  },
  {
    id: '2',
    key: 'ACM-418',
    title: 'Retire the nightly cron',
    assignee: 'Priya Raman',
    minutes: 30,
    tone: 'warning',
    status: 'In review',
  },
  {
    id: '3',
    key: 'ACM-421',
    title: 'Portal: broken invoice link',
    assignee: 'Sam Okafor',
    minutes: 0,
    tone: 'danger',
    status: 'Blocked',
  },
];

const COLUMNS: TableColumn<DemoRow>[] = [
  {
    key: 'task',
    header: 'Task',
    render: (row) => (
      <span className="cell-stack">
        <span className="cell-stack__key">
          <PriorityDot priority="HIGH" />
          {row.key}
        </span>
        <span>{row.title}</span>
      </span>
    ),
  },
  {
    key: 'assignee',
    header: 'Assignee',
    width: '180px',
    hideOnMobile: true,
    render: (row) => (
      <span className="cell-person">
        <Avatar name={row.assignee} size="sm" />
        {row.assignee}
      </span>
    ),
  },
  {
    key: 'time',
    header: 'Time',
    width: '90px',
    align: 'right',
    nowrap: true,
    render: (row) => `${row.minutes}m`,
  },
  {
    key: 'status',
    header: 'Status',
    width: '150px',
    render: (row) => <StatusPill tone={row.tone} label={row.status} />,
  },
];

export function DataSection() {
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  return (
    <Section
      id="data"
      title="Data"
      summary="The table at both densities, loading, and empty. Density is a prop rather than a global setting, because one screen can need both."
    >
      <Specimen label="KPI row">
        <KpiGrid>
          <Kpi label="Open tasks" value={34} />
          <Kpi label="Due today" value={6} hint="2 overdue" warn />
          <Kpi label="Resolved" value={18} tone="success" />
          <Kpi label="Average first response" value="—" loading />
        </KpiGrid>
      </Specimen>

      <Specimen label="Table density">
        <div className="stack">
          <SegmentedControl
            aria-label="Density"
            size="sm"
            value={density}
            onChange={setDensity}
            options={[
              { key: 'comfortable', label: 'Comfortable' },
              { key: 'compact', label: 'Compact' },
            ]}
          />
          <Table
            aria-label="Tasks"
            columns={COLUMNS}
            rows={ROWS}
            rowKey={(row) => row.id}
            density={density}
            onRowClick={() => {}}
          />
        </div>
      </Specimen>

      <Specimen label="Table — sticky header inside a fixed height">
        <Table
          aria-label="Tasks, scrolling"
          columns={COLUMNS}
          rows={[
            ...ROWS,
            ...ROWS.map((row) => ({ ...row, id: `${row.id}b` })),
            ...ROWS.map((row) => ({ ...row, id: `${row.id}c` })),
          ]}
          rowKey={(row) => row.id}
          density="compact"
          stickyHeader
          maxHeight="180px"
        />
      </Specimen>

      <Specimen label="Table — loading, then empty">
        <div className="stack">
          <Table
            aria-label="Tasks, loading"
            columns={COLUMNS}
            rows={[]}
            rowKey={(row) => row.id}
            loading
            loadingRows={3}
          />
          <Table
            aria-label="Tasks, empty"
            columns={COLUMNS}
            rows={[]}
            rowKey={(row) => row.id}
            empty={
              <EmptyState
                title="No tasks match"
                description="Try another view or clear the filters."
                size="sm"
              />
            }
          />
        </div>
      </Specimen>

      <Specimen label="Status pills, badges and priority">
        <div className="stack">
          <Row>
            {TONES.map((tone) => (
              <StatusPill key={tone} tone={tone} label={tone} />
            ))}
          </Row>
          <Row>
            {TONES.map((tone) => (
              <StatusPill key={tone} tone={tone} label={tone} outline size="sm" />
            ))}
          </Row>
          <Row>
            <VisibilityBadge visibility="CLIENT" />
            <VisibilityBadge visibility="INTERNAL" />
            <Badge tone="warning">SLA at risk</Badge>
            <Badge tone="info" outline>
              Auto-assigned
            </Badge>
          </Row>
          <Row>
            <PriorityDot priority="CRITICAL" showLabel />
            <PriorityDot priority="HIGH" showLabel />
            <PriorityDot priority="MEDIUM" showLabel />
            <PriorityDot priority="LOW" showLabel />
          </Row>
        </div>
      </Specimen>

      <Specimen label="Avatars">
        <Row>
          <Avatar name="Ada Lovelace" size="sm" />
          <Avatar name="Priya Raman" />
          <Avatar name="Sam Okafor" size="lg" />
        </Row>
      </Specimen>

      <Specimen label="Meters">
        <div className="stack" style={{ maxWidth: '22rem' }}>
          <Meter percent={72} label="Milestone progress" />
          <Meter percent={118} label="Workload" warn valueText="9 of 8 tasks" />
          <Meter percent={30} label="Storage used" size="sm" showValue={false} />
        </div>
      </Specimen>

      <Specimen label="Description list and cards">
        <Row>
          <Card title="Details" subtitle="Everything the workflow reads" headingLevel={3}>
            <DescriptionList
              items={[
                { key: 'project', term: 'Project', description: 'Apollo · Northwind Ltd' },
                { key: 'assigned', term: 'Assigned', description: 'Ada Lovelace → Priya Raman' },
                { key: 'due', term: 'Due', description: 'Tomorrow, 17:00' },
                { key: 'time', term: 'Time', description: '2h 25m / est 3h' },
              ]}
            />
          </Card>
          <Card
            title="Elevated with a footer"
            headingLevel={3}
            elevated
            footer={<span className="muted">Updated 4 minutes ago</span>}
          >
            <DescriptionList
              layout="stacked"
              items={[
                {
                  key: 'a',
                  term: 'Stacked layout',
                  description: 'Term above value, for a narrow column',
                },
                { key: 'b', term: 'Second', description: 'Another value' },
              ]}
            />
          </Card>
        </Row>
      </Specimen>
    </Section>
  );
}
