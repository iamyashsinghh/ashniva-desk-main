import type { ProductCallbackEndpointWithSecret } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { KeyValueRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Divider, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { OneTimeSecretSheet } from '../shared/OneTimeSecretSheet';
import { useCallbackEndpoint, useRotateCallbackSecret } from './api';
import { CallbackDeliveries } from './CallbackDeliveries';
import { CallbackSheet } from './CallbackSheet';

/**
 * Status callbacks: where Desk tells the product about its own tickets.
 *
 * Only for somebody who may manage the product, as on the web — the endpoint itself is read behind
 * the same permission. The signing secret is shown once, on the first save and on rotation.
 */
export function CallbacksSection({ productId }: { productId: string }) {
  const theme = useTheme();
  const endpoint = useCallbackEndpoint(productId, true);
  const rotate = useRotateCallbackSecret(productId);
  const [editing, setEditing] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [issued, setIssued] = useState<ProductCallbackEndpointWithSecret | null>(null);
  const saved = endpoint.data ?? null;

  const rotateNow = async () => {
    const result = await rotate.run();
    if (result) {
      setConfirmRotate(false);
      setIssued(result);
    }
  };

  return (
    <Section title="Status callbacks" icon="git-network-outline">
      <EndpointSummary endpoint={endpoint} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Button
          label={saved ? 'Edit' : 'Configure'}
          icon={saved ? 'create-outline' : 'add'}
          size="sm"
          variant="secondary"
          disabled={endpoint.isLoading}
          onPress={() => setEditing(true)}
        />
        {saved ? (
          <Button
            label="Rotate signing secret"
            icon="refresh"
            size="sm"
            variant="ghost"
            onPress={() => setConfirmRotate(true)}
          />
        ) : null}
      </View>
      {saved ? (
        <>
          <Divider />
          <CallbackDeliveries productId={productId} />
        </>
      ) : null}

      {editing ? (
        <CallbackSheet
          productId={productId}
          endpoint={saved}
          onClose={() => setEditing(false)}
          onSaved={(result) => {
            setEditing(false);
            if ('signingSecret' in result) {
              setIssued(result);
            }
          }}
        />
      ) : null}
      {confirmRotate ? (
        <ConfirmSheet
          title="Rotate the signing secret?"
          message="Deliveries signed with the new secret will not verify against the old one, so the receiver has to be updated at the same moment."
          confirmLabel="Rotate"
          busy={rotate.busy}
          error={rotate.error}
          onConfirm={() => void rotateNow()}
          onClose={() => {
            rotate.reset();
            setConfirmRotate(false);
          }}
        />
      ) : null}
      {issued ? (
        <OneTimeSecretSheet
          title="Callback signing secret"
          secret={issued.signingSecret}
          warning="This is the only time this secret is shown. If it is lost, rotate it — which means updating the receiver at the same moment."
          onClose={() => setIssued(null)}
        >
          <AppText size="sm" tone="muted">
            Configure it at {issued.endpoint.url} to verify X-Ashniva-Signature: HMAC-SHA256 over
            “timestamp.raw body”, hex, prefixed sha256=. Refuse a timestamp older than five minutes
            and ignore a delivery id you have already processed.
          </AppText>
        </OneTimeSecretSheet>
      ) : null}
    </Section>
  );
}

function EndpointSummary({ endpoint }: { endpoint: ReturnType<typeof useCallbackEndpoint> }) {
  const saved = endpoint.data ?? null;

  if (endpoint.isLoading) {
    return (
      <AppText size="sm" tone="muted">
        Loading…
      </AppText>
    );
  }
  if (endpoint.error) {
    return (
      <Banner tone="danger" role="alert">
        The callback settings could not be loaded.
      </Banner>
    );
  }
  if (!saved) {
    return (
      <AppText size="sm" tone="muted">
        Not configured. The product has to poll to learn what happened to its tickets.
      </AppText>
    );
  }
  return (
    <>
      <Pill
        label={saved.enabled ? 'Enabled' : 'Paused'}
        tone={saved.enabled ? 'success' : 'neutral'}
      />
      <KeyValueRow label="Endpoint" value={saved.url} />
      <KeyValueRow
        label="Events"
        value={saved.events.length === 0 ? 'All events' : `${saved.events.length} selected`}
      />
      <KeyValueRow
        label="Secret rotated"
        value={saved.rotatedAt ? (formatDateTime(saved.rotatedAt) ?? '—') : 'Never'}
      />
    </>
  );
}
