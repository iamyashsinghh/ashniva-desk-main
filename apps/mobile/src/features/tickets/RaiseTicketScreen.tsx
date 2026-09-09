import { PRIORITY, TICKET_TYPE, type Priority, type TicketType } from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { apiRequest, errorMessage } from '../../shared/api/client';
import { AppText, Button, Card, Field, Input, Screen } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

const TYPES: TicketType[] = Object.values(TICKET_TYPE);
const PRIORITIES: Priority[] = Object.values(PRIORITY);

/**
 * Raising a ticket.
 *
 * Type and priority are chip rows rather than dropdowns. A native picker on a phone is a modal
 * wheel that hides the rest of the form; four chips are visible, tappable at 44 points, and read
 * out one at a time by a screen reader.
 */
export function RaiseTicketScreen({ onRaised }: { onRaised: (ticketId: string) => void }) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('');
  const [type, setType] = useState<TicketType>(TICKET_TYPE.SUPPORT);
  const [priority, setPriority] = useState<Priority>(PRIORITY.MEDIUM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = title.trim().length >= 4 && description.trim().length >= 10;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const created = await apiRequest<{ id: string }>('/tickets', {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          ...(impact.trim() ? { impact: impact.trim() } : {}),
        },
      });
      onRaised(created.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Field label="What is the problem?" hint="One line">
              <Input
                accessibilityLabel="Ticket title"
                onChangeText={setTitle}
                placeholder="Cannot complete checkout on the live site"
                value={title}
              />
            </Field>

            <Field label="Tell us more" hint="What you did, what happened, what you expected">
              <Input
                accessibilityLabel="Description"
                multiline
                numberOfLines={5}
                onChangeText={setDescription}
                style={{ minHeight: 120, textAlignVertical: 'top' }}
                value={description}
              />
            </Field>

            <Field
              label="What can you not do because of this?"
              hint="Optional, but it helps us prioritise"
            >
              <Input
                accessibilityLabel="Impact"
                multiline
                numberOfLines={2}
                onChangeText={setImpact}
                style={{ minHeight: 64, textAlignVertical: 'top' }}
                value={impact}
              />
            </Field>
          </Card>

          <Card>
            <ChipRow
              label="Kind"
              options={TYPES}
              selected={type}
              onSelect={(value) => setType(value)}
            />
            <ChipRow
              label="How urgent"
              options={PRIORITIES}
              selected={priority}
              onSelect={(value) => setPriority(value)}
            />
          </Card>

          {error ? (
            <AppText tone="danger" size="sm">
              {error}
            </AppText>
          ) : null}

          <Button
            label="Raise the ticket"
            loading={busy}
            disabled={!valid}
            accessibilityHint="Creates the ticket and opens it"
            onPress={() => void submit()}
          />
          {!valid ? (
            <AppText size="xs" tone="faint">
              A short title and a few sentences of detail are needed.
            </AppText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText size="sm" tone="muted" weight="medium">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={humanise(option)}
              onPress={() => onSelect(option)}
              style={{
                backgroundColor: active ? theme.colors.primary : theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                justifyContent: 'center',
                minHeight: TOUCH_TARGET,
                paddingHorizontal: theme.spacing.lg,
              }}
            >
              <Text
                style={{
                  color: active ? theme.colors.primaryText : theme.colors.text,
                  fontSize: theme.fontSize.sm,
                  fontWeight: '600',
                }}
              >
                {humanise(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function humanise(value: string): string {
  const lower = value.toLowerCase().replaceAll('_', ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
