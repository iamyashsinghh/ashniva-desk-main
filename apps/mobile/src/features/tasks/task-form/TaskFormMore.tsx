import { MAX_WORK_AREAS, WORK_AREAS, normalizeWorkArea } from '@ashniva/types';
import { View } from 'react-native';

import { Chip } from '../../../shared/components/chips';
import { Section } from '../../../shared/components/layout';
import { UserPicker } from '../../../shared/components/pickers';
import { AppText, Field, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { isReviewer, isTester } from '../task-people';
import type { TaskFormPartProps } from './TaskFormFields';

/**
 * The web form's "More options": folded away because most tasks never need them, and a phone
 * screen of twenty fields reads as a chore rather than a task.
 */
export function TaskFormMore({
  values,
  onChange,
  errors,
  initiallyOpen,
}: TaskFormPartProps & { initiallyOpen: boolean }) {
  const theme = useTheme();
  // A value typed on the web that is not a suggestion still shows, so it can be removed here.
  const areaChoices = [
    ...WORK_AREAS,
    ...values.workAreas.filter(
      (area) => !WORK_AREAS.some((suggestion) => suggestion === normalizeWorkArea(area)),
    ),
  ];
  const hasArea = (area: string) =>
    values.workAreas.some((chosen) => normalizeWorkArea(chosen) === normalizeWorkArea(area));
  const toggleArea = (area: string) =>
    onChange({
      workAreas: hasArea(area)
        ? values.workAreas.filter((chosen) => normalizeWorkArea(chosen) !== normalizeWorkArea(area))
        : [...values.workAreas, area].slice(0, MAX_WORK_AREAS),
    });

  return (
    <Section
      title="More options"
      icon="options-outline"
      collapsible
      initiallyOpen={initiallyOpen}
      style={{ gap: theme.spacing.md }}
    >
      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="sm" weight="medium">
          Work areas
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {areaChoices.map((area) => (
            <Chip
              key={area}
              label={area}
              selected={hasArea(area)}
              onPress={() => toggleArea(area)}
            />
          ))}
        </View>
      </View>
      <Field label="Module">
        <Input
          accessibilityLabel="Module"
          maxLength={80}
          placeholder="e.g. Checkout"
          onChangeText={(module) => onChange({ module })}
          value={values.module}
        />
      </Field>
      <Field
        label="Estimate (minutes)"
        hint="Internal only — never shown to the client"
        {...(errors.estimate ? { error: errors.estimate } : {})}
      >
        <Input
          accessibilityLabel="Estimate in minutes"
          icon="hourglass-outline"
          inputMode="numeric"
          keyboardType="number-pad"
          placeholder="90"
          onChangeText={(estimate) => onChange({ estimate })}
          value={values.estimate}
          invalid={Boolean(errors.estimate)}
        />
      </Field>
      <UserPicker
        label="Reviewer"
        value={values.reviewerId ? [values.reviewerId] : []}
        onChange={(ids) => onChange({ reviewerId: ids[0] ?? null })}
        filter={isReviewer}
        placeholder="Default (senior / PM)"
      />
      <UserPicker
        label="Tester"
        value={values.testerId ? [values.testerId] : []}
        onChange={(ids) => onChange({ testerId: ids[0] ?? null })}
        filter={isTester}
        placeholder="Any tester"
      />
      <Field label="Acceptance criteria" hint="What counts as done">
        <Input
          accessibilityLabel="Acceptance criteria"
          multiline
          numberOfLines={3}
          maxLength={3000}
          onChangeText={(acceptanceCriteria) => onChange({ acceptanceCriteria })}
          style={{ minHeight: 80 }}
          value={values.acceptanceCriteria}
        />
      </Field>
    </Section>
  );
}
