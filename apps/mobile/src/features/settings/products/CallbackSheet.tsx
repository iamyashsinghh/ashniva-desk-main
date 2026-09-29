import {
  SUPPORT_CALLBACK_EVENTS,
  SUPPORT_CALLBACK_EVENT_LABELS,
  type ProductCallbackEndpointSummary,
  type SupportCallbackEvent,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '../../../shared/components/chips';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { SettingSwitch } from '../shared/SettingSwitch';
import { useSaveCallback, type CallbackSaveResult } from './api';

/**
 * Where a product's status callbacks go, and which events.
 *
 * No event selected means every event, as the web and the API read it: somebody who configured an
 * endpoint and left the subscription alone meant to be told things. The URL is checked against the
 * address it resolves to by the API, on save and on every delivery; this only states it.
 */
export function CallbackSheet({
  productId,
  endpoint,
  onClose,
  onSaved,
}: {
  productId: string;
  endpoint: ProductCallbackEndpointSummary | null;
  onClose: () => void;
  onSaved: (result: CallbackSaveResult) => void;
}) {
  const theme = useTheme();
  const [url, setUrl] = useState(endpoint?.url ?? '');
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true);
  const [events, setEvents] = useState<SupportCallbackEvent[]>(endpoint?.events ?? []);
  const save = useSaveCallback(productId);

  const toggle = (event: SupportCallbackEvent) =>
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );

  const submit = async () => {
    const result = await save.run({ url: url.trim(), events, enabled });
    if (result) {
      onSaved(result);
    }
  };

  return (
    <Sheet
      visible
      title="Status callbacks"
      onClose={onClose}
      maxHeightRatio={0.9}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save"
            icon="checkmark"
            loading={save.busy}
            disabled={url.trim().length === 0}
            onPress={() => void submit()}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Field
        label="Endpoint"
        required
        hint="HTTPS only. Refused if it resolves to a private or loopback address."
      >
        <Input
          accessibilityLabel="Endpoint"
          value={url}
          onChangeText={setUrl}
          placeholder="https://hooks.example.com/ashniva"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </Field>
      <SettingSwitch
        label="Send callbacks"
        description="Off pauses deliveries without forgetting the endpoint."
        value={enabled}
        onChange={setEnabled}
      />
      <AppText size="sm" weight="medium">
        Events
      </AppText>
      <AppText size="xs" tone="muted">
        Leave every event clear to receive all of them.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {SUPPORT_CALLBACK_EVENTS.map((event) => (
          <Chip
            key={event}
            label={SUPPORT_CALLBACK_EVENT_LABELS[event]}
            selected={events.includes(event)}
            onPress={() => toggle(event)}
            role="checkbox"
          />
        ))}
      </View>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
