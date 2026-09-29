import {
  PROJECT_MEMBER_ROLE,
  PROJECT_MEMBER_ROLE_LABELS,
  WORK_AREAS,
  type ProjectMemberRole,
} from '@ashniva/types';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Avatar } from '../../shared/components/Avatar';
import { AppText, Button, Card } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { hasResponsibilities, type MemberDraft } from './project-members';

const ROLE_OPTIONS: SelectOption<ProjectMemberRole>[] = Object.values(PROJECT_MEMBER_ROLE).map(
  (role) => ({ value: role, label: PROJECT_MEMBER_ROLE_LABELS[role] }),
);

/**
 * One person on the team being edited: their role on this project and, for the people who do the
 * work, what they are responsible for.
 *
 * The suggested areas are the shared list plus whatever this person already holds, so a team's
 * own word for an area survives an edit instead of vanishing because it was not a suggestion.
 */
export function MemberDraftRow({
  draft,
  onChange,
  onRemove,
}: {
  draft: MemberDraft;
  onChange: (patch: Partial<MemberDraft>) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const areaOptions = useMemo<SelectOption[]>(
    () =>
      [...new Set([...WORK_AREAS, ...draft.responsibilities])].map((area) => ({
        value: area,
        label: area,
      })),
    [draft.responsibilities],
  );

  return (
    <Card>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <Avatar name={draft.name} size={36} />
        <View style={{ flex: 1 }}>
          <AppText weight="medium" numberOfLines={1}>
            {draft.name}
          </AppText>
        </View>
        <Button
          label="Remove"
          variant="dangerGhost"
          size="sm"
          icon="trash-outline"
          accessibilityHint={`Takes ${draft.name} off this project`}
          onPress={onRemove}
        />
      </View>
      <SelectField
        label="Role on this project"
        icon="ribbon-outline"
        options={ROLE_OPTIONS}
        value={[draft.role]}
        onChange={(values) => values[0] && onChange({ role: values[0] })}
      />
      {hasResponsibilities(draft.role) ? (
        <SelectField
          label="Responsible for"
          icon="construct-outline"
          options={areaOptions}
          value={draft.responsibilities}
          onChange={(responsibilities) => onChange({ responsibilities })}
          multiple
          placeholder="Nothing in particular"
          hint="Used to route support for this area to the right person."
        />
      ) : null}
    </Card>
  );
}
