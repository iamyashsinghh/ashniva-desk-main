import { AVATAR_PRESETS, type AvatarPreset } from '@ashniva/types';

import { AVATAR_PRESET_LABELS } from '../../../shared/components/avatar-preset-labels';
import { PersonAvatar } from '../../../shared/components/PersonAvatar';

export interface AvatarPresetGridProps {
  name: string;
  /** The preset in use now, so it reads as chosen. Null when a photo or the initials are showing. */
  current: AvatarPreset | null;
  disabled: boolean;
  onChoose: (preset: AvatarPreset) => void;
}

/** The twelve built-in pictures, each drawn exactly as it will appear once chosen. */
export function AvatarPresetGrid({ name, current, disabled, onChoose }: AvatarPresetGridProps) {
  return (
    <ul className="profile-avatar__presets" aria-label="Built-in pictures">
      {AVATAR_PRESETS.map((preset) => (
        <li key={preset}>
          <button
            type="button"
            className="profile-avatar__preset"
            aria-label={`Use the ${AVATAR_PRESET_LABELS[preset].toLowerCase()} picture`}
            aria-pressed={current === preset}
            disabled={disabled}
            onClick={() => onChoose(preset)}
          >
            <PersonAvatar name={name} avatar={{ kind: 'preset', preset }} size="md" />
          </button>
        </li>
      ))}
    </ul>
  );
}
