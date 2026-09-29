import type { ThemeSourceReadiness } from '@ashniva/types';
import { View } from 'react-native';

import { Section } from '../../../shared/components/layout';
import { AppText, Pill } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';

/**
 * Where this deployment's themes come from, and — for a Theme Manager — what is still missing.
 * Listed in full, as on the web, because a list somebody can forward is worth more than a badge.
 */
export function ThemeSourceSection({ readiness }: { readiness: ThemeSourceReadiness }) {
  const isLocal = readiness.source === 'local';
  return (
    <Section title="Theme source" icon="color-palette-outline" collapsible initiallyOpen={false}>
      {isLocal ? (
        <Pill label="Stored in Ashniva Desk" />
      ) : (
        <Pill
          label={readiness.healthy ? 'Theme Manager: serving' : 'Theme Manager: nothing served yet'}
          tone={readiness.healthy ? 'success' : 'warning'}
        />
      )}
      <AppText size="sm" tone="muted">
        {readiness.behaviourWhenUnready}
      </AppText>
      {readiness.lastDocumentAt ? (
        <AppText size="xs" tone="faint">
          Last document {formatDateTime(readiness.lastDocumentAt)}
        </AppText>
      ) : null}
      <AppText variant="label" tone="muted" uppercase>
        What is in place
      </AppText>
      {readiness.ready.map((item) => (
        <AppText key={item} size="sm" tone="muted">
          • {item}
        </AppText>
      ))}
      {readiness.missing.length > 0 ? (
        <>
          <AppText variant="label" tone="muted" uppercase>
            What the Theme Manager still has to supply
          </AppText>
          {readiness.missing.map((item) => (
            <View key={item.key} style={{ gap: 2 }}>
              <AppText size="sm" weight="medium">
                {item.what}
              </AppText>
              {item.needs.map((need) => (
                <AppText key={need} size="sm" tone="muted">
                  • {need}
                </AppText>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </Section>
  );
}
