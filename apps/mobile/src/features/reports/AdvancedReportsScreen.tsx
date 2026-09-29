import {
  PERMISSIONS,
  REPORT_TYPE_LABELS,
  type ReportFilters,
  type ReportType,
} from '@ashniva/types';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { StatTile, TileGrid } from '../../shared/components/data-display';
import { SectionHeader } from '../../shared/components/layout';
import { AppText, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { SelectField } from '../../shared/components/SelectField';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { useAdvancedReport, useAvailableReports } from './api';
import { ReportBreakdown } from './ReportBreakdown';
import { activeFilters, ReportFilterChips } from './ReportFilterChips';
import { ReportFiltersSheet, reportTakesPerson } from './ReportFiltersSheet';
import { ReportRowCard } from './ReportRowCard';
import { NotAvailable } from './ReportsScreen';
import { ReportTypeList } from './ReportTypeList';
import { useReportFilterOptions } from './use-report-filter-options';

/**
 * The organization's reports: pick one, narrow it, read the totals, the breakdown and the rows.
 *
 * Which reports appear is the API's answer (`GET /reports/advanced`): everything for somebody with
 * report:read-all, only the team-scoped two otherwise. Every figure is computed and scoped on the
 * server; the phone draws what it is sent.
 */
export function AdvancedReportsScreen() {
  const theme = useTheme();
  const canRead = useSession().can(PERMISSIONS.REPORT_READ_OWN);
  const [type, setType] = useState<ReportType | null>(null);
  const [chosenFilters, setFilters] = useState<ReportFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const options = useReportFilterOptions();

  // A person filter left over from a report about people is not sent to one that ignores it.
  const filters = useMemo<ReportFilters>(() => {
    if (reportTakesPerson(type)) {
      return chosenFilters;
    }
    const { userId: _unused, ...rest } = chosenFilters;
    return rest;
  }, [chosenFilters, type]);

  const available = useAvailableReports(canRead);
  const report = useAdvancedReport(type, filters);
  const active = activeFilters(filters, options);
  const result = type ? report.data : undefined;

  if (!canRead) {
    return <NotAvailable />;
  }

  const refresh = () => {
    void available.refetch();
    if (type) {
      void report.refetch();
    }
  };

  const typeOptions = (available.data ?? []).map((entry) => ({
    value: entry.type,
    label: entry.label || REPORT_TYPE_LABELS[entry.type],
    icon: 'bar-chart-outline' as const,
  }));

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      {typeOptions.length > 0 ? (
        <SelectField
          label="Report"
          icon="document-text-outline"
          options={typeOptions}
          value={type ? [type] : []}
          onChange={(values) => setType(values[0] ?? null)}
          placeholder="Choose a report"
        />
      ) : null}
      {type ? (
        <ReportFilterChips
          active={active}
          onOpen={() => setFiltersOpen(true)}
          onRemove={(key) => setFilters({ ...chosenFilters, [key]: undefined })}
        />
      ) : null}
      {result && result.totals.length > 0 ? (
        <TileGrid>
          {result.totals.map((total) => (
            <StatTile key={total.label} label={total.label} value={total.value} />
          ))}
        </TileGrid>
      ) : null}
      {result ? <ReportBreakdown key={result.type} report={result} /> : null}
      {result && result.rows.length > 0 ? (
        <SectionHeader title={result.title} count={result.rows.length} icon="list-outline" />
      ) : null}
    </View>
  );

  let empty: ReactNode = null;
  if (available.isLoading) {
    empty = <LoadingState label="Loading reports" />;
  } else if (available.error) {
    empty = errorState(available.error, () => void available.refetch());
  } else if (typeOptions.length === 0) {
    empty = (
      <EmptyState
        icon="bar-chart-outline"
        title="No reports available"
        description="Your role cannot run any of the organization's reports."
      />
    );
  } else if (!type) {
    empty = <ReportTypeList options={typeOptions} onPick={setType} />;
  } else if (report.isLoading) {
    empty = <LoadingState label="Running the report" />;
  } else if (report.error) {
    empty = errorState(report.error, () => void report.refetch());
  } else if (result) {
    empty = (
      <EmptyState
        icon="funnel-outline"
        title="No rows for these filters"
        description="Widen the dates or take a filter off."
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={result && !report.error ? result.rows : []}
        keyExtractor={(_row, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh busy={report.isRefetching || available.isRefetching} onRefresh={refresh} />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={<>{empty}</>}
        ListFooterComponent={
          result ? (
            <AppText size="xs" tone="faint" align="center">
              Generated {formatDateTime(result.generatedAt)}
            </AppText>
          ) : null
        }
        initialNumToRender={8}
        renderItem={({ item }) => (result ? <ReportRowCard report={result} row={item} /> : null)}
      />
      <ReportFiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        type={type}
        filters={filters}
        onChange={setFilters}
        options={options}
      />
    </Screen>
  );
}

function errorState(error: unknown, onRetry: () => void) {
  return (
    <ErrorState
      message={errorMessage(error)}
      offline={error instanceof Error && error.name === 'NetworkError'}
      onRetry={onRetry}
    />
  );
}
