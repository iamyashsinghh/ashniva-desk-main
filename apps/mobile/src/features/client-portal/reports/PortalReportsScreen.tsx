import {
  PERMISSIONS,
  REPORT_TYPE_LABELS,
  type ReportResult,
  type ReportType,
} from '@ashniva/types';
import { useState } from 'react';

import { errorMessage } from '../../../shared/api/client';
import { useResource } from '../../../shared/api/queries';
import { DateTimeField } from '../../../shared/components/DateTimeField';
import { Section } from '../../../shared/components/layout';
import { SelectField } from '../../../shared/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components/states';
import { portalKeys } from '../portal-keys';
import { DetailFrame, PermissionGate } from '../PortalFrame';
import { ReportResultView } from './ReportResultView';

interface ReportTypeInfo {
  type: ReportType;
  label: string;
}

/**
 * The client's reports: progress, support hours, SLA and ticket figures for their own
 * organization. The API lists which reports this client may run and builds each one from
 * client-visible data only; the phone picks a report and a period, and shows the result.
 */
export function PortalReportsScreen() {
  return (
    <PermissionGate
      permission={PERMISSIONS.REPORT_READ_OWN}
      title="Reports are not shared with you"
      description="Ask your administrator if you need your organization’s reports."
    >
      <Reports />
    </PermissionGate>
  );
}

function Reports() {
  const [type, setType] = useState<ReportType | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  const available = useResource<ReportTypeInfo[]>(portalKeys.reportTypes, '/portal/reports');
  const report = useResource<ReportResult>(
    portalKeys.report(type ?? '', from, to),
    `/portal/reports/${type ?? ''}`,
    {
      enabled: type !== null,
      query: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    },
  );

  const options = (available.data ?? []).map((entry) => ({
    value: entry.type,
    label: entry.label || REPORT_TYPE_LABELS[entry.type],
  }));

  let body = (
    <EmptyState
      title="Pick a report"
      description="Choose a report above. Without dates it covers the last 30 days."
      icon="bar-chart-outline"
    />
  );
  if (type && report.data) {
    body = <ReportResultView report={report.data} />;
  } else if (type && report.error) {
    body = (
      <ErrorState message={errorMessage(report.error)} onRetry={() => void report.refetch()} />
    );
  } else if (type) {
    body = <LoadingState label="Building the report" variant="spinner" />;
  }

  return (
    <DetailFrame
      refreshing={available.isRefetching || report.isRefetching}
      onRefresh={() => {
        void available.refetch();
        if (type) {
          void report.refetch();
        }
      }}
    >
      <Section title="Report" icon="options-outline">
        <SelectField
          label="Report type"
          required
          placeholder={available.isLoading ? 'Loading…' : 'Choose a report'}
          loading={available.isLoading}
          options={options}
          value={type ? [type] : []}
          onChange={(values) => setType(values[0] ?? null)}
          {...(available.error ? { error: errorMessage(available.error) } : {})}
        />
        <DateTimeField label="From" value={from} onChange={setFrom} mode="date" />
        <DateTimeField label="To" value={to} onChange={setTo} mode="date" />
      </Section>
      {body}
    </DetailFrame>
  );
}
