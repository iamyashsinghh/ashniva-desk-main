import { PERMISSIONS, type IncidentSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { usePagedResource } from '../../../shared/api/queries';
import { Chip, ChipScroller } from '../../../shared/components/chips';
import { SearchFilterBar, useDebounced } from '../../../shared/components/FilterSheet';
import { AppText, Button } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { PagedList } from '../components/PagedList';
import { problemKeys } from '../problem-api';
import { INCIDENT_INTERNAL_NOTE, INCIDENT_VIEWS, type IncidentView } from '../problem-display';
import { DeclareIncidentSheet } from './DeclareIncidentSheet';
import { IncidentCard } from './IncidentCard';

const VIEW_KEYS = Object.keys(INCIDENT_VIEWS) as IncidentView[];

function emptyDescription(term: string, view: IncidentView): string {
  if (term) {
    return `Nothing in this view matches “${term}”.`;
  }
  return view === 'live'
    ? 'Nothing is broken right now.'
    : 'No incident has been declared in this view.';
}

/**
 * Incidents: something broken right now. "Live" leads, because on a phone the only question
 * worth answering first is what is still burning.
 */
export function IncidentsScreen({ onOpen }: { onOpen: (incidentId: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const [view, setView] = useState<IncidentView>('live');
  const [search, setSearch] = useState('');
  const [declaring, setDeclaring] = useState(false);
  const term = useDebounced(search.trim());
  const statuses = INCIDENT_VIEWS[view].statuses;

  const query = {
    ...(statuses ? { status: statuses.join(',') } : {}),
    ...(term ? { search: term } : {}),
    limit: 25,
  };
  const result = usePagedResource<IncidentSummary>(
    problemKeys.incidents(query),
    '/incidents',
    query,
  );

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search incidents" />
      <ChipScroller>
        {VIEW_KEYS.map((key) => (
          <Chip
            key={key}
            label={INCIDENT_VIEWS[key].label}
            selected={view === key}
            onPress={() => setView(key)}
          />
        ))}
      </ChipScroller>
      {can(PERMISSIONS.INCIDENT_MANAGE) ? (
        <Button
          label="Declare incident"
          icon="flame-outline"
          variant="secondary"
          onPress={() => setDeclaring(true)}
        />
      ) : null}
      <AppText size="xs" tone="faint">
        {INCIDENT_INTERNAL_NOTE}
      </AppText>
    </View>
  );

  return (
    <>
      <PagedList
        result={result}
        header={header}
        renderRow={(incident) => (
          <IncidentCard incident={incident} onPress={() => onOpen(incident.id)} />
        )}
        emptyTitle={term ? 'No matching incidents' : 'No incidents'}
        emptyDescription={emptyDescription(term, view)}
        emptyIcon="flame-outline"
        loadingLabel="Loading incidents"
      />
      {declaring ? (
        <DeclareIncidentSheet
          onClose={() => setDeclaring(false)}
          onCreated={(incident) => {
            setDeclaring(false);
            onOpen(incident.id);
          }}
        />
      ) : null}
    </>
  );
}
