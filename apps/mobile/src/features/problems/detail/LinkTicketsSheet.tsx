import {
  PROBLEM_TICKET_RELATION,
  PROBLEM_TICKET_RELATION_LABELS,
  type ProblemDetail,
  type ProblemTicketRelation,
} from '@ashniva/types';
import { useState } from 'react';

import { useDebounced } from '../../../shared/components/FilterSheet';
import { Banner } from '../../../shared/components/feedback';
import { Segmented } from '../../../shared/components/navigation-list';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useTicketOptions } from '../components/work-pickers';
import { useProblemWrite } from '../problem-api';

const RELATIONS = Object.values(PROBLEM_TICKET_RELATION).map((value) => ({
  value,
  label: PROBLEM_TICKET_RELATION_LABELS[value],
}));

/**
 * Linking tickets into a problem, as a duplicate of the same fault or as related to it.
 *
 * The web's empty state says "link tickets from here"; `POST /problems/:id/tickets` is the route
 * behind that, and it takes several at once. Tickets already in the problem are not offered.
 */
export function LinkTicketsSheet({
  problem,
  onClose,
}: {
  problem: ProblemDetail;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [relation, setRelation] = useState<ProblemTicketRelation>(
    PROBLEM_TICKET_RELATION.DUPLICATE,
  );
  const [ticketIds, setTicketIds] = useState<string[]>([]);
  const term = useDebounced(search.trim());
  const tickets = useTicketOptions({ projectId: problem.project?.id, search: term, enabled: true });
  const linked = new Set(problem.tickets.map((ticket) => ticket.ticketId));
  const options = tickets.options.filter((option) => !linked.has(option.value));

  const link = useProblemWrite<void>({
    path: `/problems/${problem.id}/tickets`,
    body: () => ({ ticketIds, relation }),
    onDone: onClose,
  });

  return (
    <Sheet
      visible
      title="Link tickets"
      subtitle={`${problem.key} · ${problem.title}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Back" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label={ticketIds.length > 1 ? `Link ${ticketIds.length}` : 'Link'}
            icon="link-outline"
            loading={link.busy}
            disabled={ticketIds.length === 0}
            onPress={() => void link.run()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Segmented
        label="How they relate"
        options={RELATIONS}
        value={relation}
        onChange={setRelation}
      />
      <Field label="Find tickets" hint="Matches the title and the key">
        <Input
          icon="search"
          accessibilityLabel="Find tickets"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </Field>
      <SelectField
        label="Tickets"
        required
        multiple
        icon="ticket-outline"
        options={options}
        value={ticketIds}
        onChange={setTicketIds}
        loading={tickets.isLoading}
        hint={
          problem.project
            ? `On ${problem.project.name}. Each client still sees only their own ticket.`
            : 'Each client still sees only their own ticket.'
        }
        placeholder="Choose tickets"
      />
      {link.error ? (
        <Banner tone="danger" role="alert">
          {link.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
