import {
  SUPPORT_CALLBACK_EVENTS,
  SUPPORT_CALLBACK_EVENT_LABELS,
  type ProductCallbackEndpointSummary,
  type ProductCallbackEndpointWithSecret,
  type SupportCallbackEvent,
} from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  FormActions,
  FormField,
  FormGrid,
  Input,
  Switch,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import {
  useCallbackEndpointQuery,
  useCallbackMutations,
  type CallbackEndpointInput,
} from '../callbacks-api';
import { CallbackDeliveriesTable } from './CallbackDeliveriesTable';
import { CallbackSecretModal } from './CallbackSecretModal';

export interface CallbacksCardProps {
  productId: string;
  canManage: boolean;
}

/**
 * Where this product's status callbacks go.
 *
 * The event list is empty by default and empty means every event, following the same convention as
 * a product's allowed sources and an IVR policy's allowed tiers: an operator who configured an
 * endpoint and left the subscription alone meant to be told things, and reading that as "nothing"
 * would leave them with a configured endpoint that silently receives none.
 *
 * Nothing here is a control. The URL is checked against the address it resolves to by the API, on
 * save and again on every delivery; this is where somebody states the destination.
 */
export function CallbacksCard({ productId, canManage }: CallbacksCardProps) {
  const endpoint = useCallbackEndpointQuery(productId, canManage);
  const mutations = useCallbackMutations(productId);
  const [issued, setIssued] = useState<ProductCallbackEndpointWithSecret | null>(null);
  const [error, setError] = useState<string | undefined>();

  if (!canManage) {
    return null;
  }

  async function run(work: () => Promise<unknown>): Promise<void> {
    setError(undefined);
    try {
      const result = await work();
      if (result && typeof result === 'object' && 'signingSecret' in result) {
        setIssued(result as ProductCallbackEndpointWithSecret);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const saved = endpoint.data ?? null;

  return (
    <Card
      title="Status callbacks"
      headerAddon={
        saved ? (
          <Badge tone={saved.enabled ? 'success' : 'neutral'}>
            {saved.enabled ? 'Enabled' : 'Paused'}
          </Badge>
        ) : (
          <span className="muted">Not configured</span>
        )
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {endpoint.isLoading ? (
        <p className="muted">Loading…</p>
      ) : (
        <CallbackForm
          // Keyed on what was saved, so the form's initial state comes from the fetched row
          // instead of being copied into state by an effect after the first render.
          key={saved?.updatedAt ?? 'unconfigured'}
          endpoint={saved}
          busy={mutations.save.isPending}
          onSave={(input) => run(() => mutations.save.mutateAsync(input))}
          onRotate={saved ? () => run(() => mutations.rotateSecret.mutateAsync()) : undefined}
        />
      )}

      {saved ? <CallbackDeliveriesTable productId={productId} /> : null}

      {issued ? (
        <CallbackSecretModal
          secret={issued.signingSecret}
          url={issued.endpoint.url}
          onClose={() => setIssued(null)}
        />
      ) : null}
    </Card>
  );
}

function CallbackForm({
  endpoint,
  busy,
  onSave,
  onRotate,
}: {
  endpoint: ProductCallbackEndpointSummary | null;
  busy: boolean;
  onSave: (input: CallbackEndpointInput) => Promise<void>;
  onRotate?: () => Promise<void>;
}) {
  const [url, setUrl] = useState(endpoint?.url ?? '');
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true);
  const [events, setEvents] = useState<SupportCallbackEvent[]>(endpoint?.events ?? []);

  const toggleEvent = (event: SupportCallbackEvent) =>
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );

  return (
    <>
      <FormGrid>
        <FormField
          label="Endpoint"
          hint="HTTPS only. Refused if it resolves to a private or loopback address."
        >
          <Input
            value={url}
            placeholder="https://hooks.example.com/ashniva"
            onChange={(event) => setUrl(event.target.value)}
          />
        </FormField>
        <FormField label="Send callbacks">
          <Switch checked={enabled} onChange={setEnabled} label="Deliveries are attempted" />
        </FormField>
      </FormGrid>

      <fieldset className="form-fieldset">
        <legend className="muted">Events — leave every box clear to receive all of them</legend>
        {SUPPORT_CALLBACK_EVENTS.map((event) => (
          <label key={event} className="checkbox-row">
            <input
              type="checkbox"
              checked={events.includes(event)}
              onChange={() => toggleEvent(event)}
            />
            <span>
              {SUPPORT_CALLBACK_EVENT_LABELS[event]} <code>{event}</code>
            </span>
          </label>
        ))}
      </fieldset>

      <FormActions>
        <Button
          variant="primary"
          disabled={busy || url.trim().length === 0}
          disabledReason="Give the callback an HTTPS endpoint first"
          onClick={() => void onSave({ url: url.trim(), events, enabled })}
        >
          Save
        </Button>
        {onRotate ? (
          <Button disabled={busy} onClick={() => void onRotate()}>
            Rotate signing secret
          </Button>
        ) : null}
      </FormActions>
    </>
  );
}
