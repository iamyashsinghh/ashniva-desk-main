import { REPORT_TYPE_LABELS, type ReportFilters, type ReportType } from '@ashniva/types';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FormField,
  FormGrid,
  Input,
  Kpi,
  KpiGrid,
  PageHeader,
  Select,
} from '@ashniva/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useProjectsQuery } from '../../projects/api';
import { useOrganizationsQuery } from '../../users/api';
import {
  downloadReportCsv,
  useAdvancedReportQuery,
  useAvailableReportsQuery,
} from '../advanced-api';
import { ReportTable } from '../components/ReportTable';

import '../../dashboard/dashboard.css';

/** Report picker + filters + table + CSV. The same screen serves staff and the client portal. */
export function AdvancedReportsPage({ portal = false }: { portal?: boolean }) {
  const [params, setParams] = useSearchParams();
  const available = useAvailableReportsQuery(portal);
  const type = (params.get('type') ?? undefined) as ReportType | undefined;
  const filters: ReportFilters = {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    projectId: params.get('projectId') ?? undefined,
    clientOrganizationId: params.get('clientOrganizationId') ?? undefined,
  };
  const report = useAdvancedReportQuery(type, filters, portal);
  const projects = useProjectsQuery({}, !portal);
  const organizations = useOrganizationsQuery(!portal);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | undefined>();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setParams(next, { replace: true });
  };

  async function exportCsv() {
    if (!type) {
      return;
    }
    setExporting(true);
    setExportError(undefined);
    try {
      await downloadReportCsv(type, filters, portal);
    } catch (cause) {
      setExportError(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="dashboard">
      <PageHeader
        title="Reports"
        subtitle={
          portal
            ? 'Client-visible progress, support and SLA figures for your organization.'
            : 'Organization-wide reports; each one is authorized and scoped on the server.'
        }
        actions={
          type ? (
            <Button
              variant="primary"
              loading={exporting}
              disabled={!report.data}
              onClick={() => void exportCsv()}
            >
              Download CSV
            </Button>
          ) : undefined
        }
      />
      <Card title="Report">
        <FormGrid>
          <FormField label="Report type" required>
            <Select
              value={type ?? ''}
              placeholder="Choose a report"
              onChange={(event) => setParam('type', event.target.value)}
              options={(available.data ?? []).map((entry) => ({
                value: entry.type,
                label: entry.label ?? REPORT_TYPE_LABELS[entry.type],
              }))}
            />
          </FormField>
          <FormField label="From">
            <Input
              type="date"
              value={filters.from ?? ''}
              onChange={(event) => setParam('from', event.target.value)}
            />
          </FormField>
          <FormField label="To">
            <Input
              type="date"
              value={filters.to ?? ''}
              onChange={(event) => setParam('to', event.target.value)}
            />
          </FormField>
          {!portal ? (
            <>
              <FormField label="Client">
                <Select
                  value={filters.clientOrganizationId ?? ''}
                  onChange={(event) => setParam('clientOrganizationId', event.target.value)}
                  options={[
                    { value: '', label: 'All clients' },
                    ...(organizations.data ?? [])
                      .filter((org) => !org.isServiceProvider)
                      .map((org) => ({ value: org.id, label: org.name })),
                  ]}
                />
              </FormField>
              <FormField label="Project">
                <Select
                  value={filters.projectId ?? ''}
                  onChange={(event) => setParam('projectId', event.target.value)}
                  options={[
                    { value: '', label: 'All projects' },
                    ...(projects.data ?? []).map((project) => ({
                      value: project.id,
                      label: `${project.code} ${project.name}`,
                    })),
                  ]}
                />
              </FormField>
            </>
          ) : null}
        </FormGrid>
        {exportError ? <Alert tone="danger">{exportError}</Alert> : null}
      </Card>
      {!type ? (
        <EmptyState
          title="Pick a report"
          description="Choose a report type above; filters apply immediately."
        />
      ) : (
        <QueryState
          isLoading={report.isLoading}
          isError={report.isError}
          error={report.error}
          onRetry={() => void report.refetch()}
        >
          {report.data ? (
            <>
              {report.data.totals.length > 0 ? (
                <KpiGrid>
                  {report.data.totals.map((total) => (
                    <Kpi key={total.label} label={total.label} value={total.value} />
                  ))}
                </KpiGrid>
              ) : null}
              <Card
                title={report.data.title}
                headerAddon={
                  <span className="muted">Generated {formatDateTime(report.data.generatedAt)}</span>
                }
              >
                <ReportTable report={report.data} />
              </Card>
            </>
          ) : null}
        </QueryState>
      )}
    </div>
  );
}
