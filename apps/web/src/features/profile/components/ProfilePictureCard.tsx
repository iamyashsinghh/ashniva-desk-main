import { AVATAR_CONTENT_TYPES } from '@ashniva/types';
import { Alert, Button, Card } from '@ashniva/ui';
import { useRef } from 'react';

import { PersonAvatar } from '../../../shared/components/PersonAvatar';
import { useCurrentUser } from '../../auth/session-context';
import { useAvatarChange } from '../use-avatar-change';
import { AvatarPresetGrid } from './AvatarPresetGrid';

import '../profile.css';

/**
 * Your own picture: a photo, one of the built-in ones, or your initials.
 *
 * The card renders the session user, which `useAvatarChange` updates after every change — so what
 * is shown here is what the header and every conversation will show, not a local copy of it.
 */
export function ProfilePictureCard() {
  const user = useCurrentUser();
  const change = useAvatarChange();
  const filePicker = useRef<HTMLInputElement>(null);
  const avatar = user.avatar ?? null;

  return (
    <Card title="Profile picture">
      <div className="profile-avatar">
        <div className="profile-avatar__current">
          <PersonAvatar name={user.name} userId={user.id} avatar={avatar} size="xl" labelled />
          <div className="profile-avatar__actions">
            <input
              ref={filePicker}
              type="file"
              className="sr-only"
              accept={AVATAR_CONTENT_TYPES.join(',')}
              aria-label="Choose a photo to upload"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared so choosing the same file again, after fixing a problem, still fires.
                event.target.value = '';
                if (file) {
                  void change.upload(file);
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              loading={change.busy === 'upload'}
              disabled={change.busy !== null}
              onClick={() => filePicker.current?.click()}
            >
              Upload photo
            </Button>
            <Button
              size="sm"
              loading={change.busy === 'remove'}
              disabled={change.busy !== null || avatar === null}
              disabledReason="You are showing your initials already"
              onClick={() => void change.remove()}
            >
              Remove
            </Button>
            <p className="timeline__note">
              JPEG, PNG or WebP. A large photo is made smaller before it is sent.
            </p>
          </div>
        </div>

        {change.error ? (
          <Alert tone="danger" onDismiss={change.clearError}>
            {change.error}
          </Alert>
        ) : null}

        <AvatarPresetGrid
          name={user.name}
          current={avatar?.kind === 'preset' ? avatar.preset : null}
          disabled={change.busy !== null}
          onChoose={(preset) => void change.choosePreset(preset)}
        />
      </div>
    </Card>
  );
}
