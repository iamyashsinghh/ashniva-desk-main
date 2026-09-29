import { useState, type ReactNode } from 'react';

import { errorMessage } from '../../../shared/api/client';
import { Banner } from '../../../shared/components/feedback';
import type { IconName } from '../../../shared/components/Icon';
import { Button, Field, Input } from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { useSession } from '../../auth/SessionProvider';
import { reauthenticate, type ReauthHeaders } from './admin-api';

function looksLikeEmail(value: string): boolean {
  return value.includes('@') && value.includes('.');
}

/**
 * A sensitive change, confirmed with the signed-in person's password — the web's re-auth prompt.
 *
 * The API asks for the password again before anything that grants access: creating a person,
 * changing a role, minting an invitation link, and every write to a custom role. The web chains
 * two dialogs for that; on a phone one modal presenting over another that is still closing is
 * refused by iOS, so the choice being confirmed (a role, a name) sits in this same sheet above the
 * password field, passed as `children`.
 *
 * The password check and the write are two requests. `onConfirm` receives the header and runs the
 * write; its own failure comes back through `error`, so a wrong password and a refused change read
 * differently. `done` replaces the form once the write has produced something to show, such as an
 * invitation link, again without opening a second sheet.
 */
export function ReauthSheet({
  visible,
  title,
  subtitle,
  confirmLabel,
  confirmIcon = 'lock-closed-outline',
  destructive = false,
  canConfirm = true,
  busy = false,
  error = null,
  onClose,
  onConfirm,
  children,
  done,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  confirmLabel: string;
  confirmIcon?: IconName;
  destructive?: boolean;
  /** False while the choice above the password is not yet valid. */
  canConfirm?: boolean;
  /** The caller's write is in flight. */
  busy?: boolean;
  /** Why the caller's write failed. */
  error?: string | null;
  onClose: () => void;
  onConfirm: (headers: ReauthHeaders) => unknown;
  children?: ReactNode;
  done?: ReactNode;
}) {
  const { user } = useSession();
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);

  // A fresh prompt every time: a password left in a closed sheet is a password left on the phone.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setPassword('');
    setProblem(null);
  }

  const typed = password.trim();
  const confirm = async () => {
    if (looksLikeEmail(typed)) {
      setProblem(`That is an email address. Type the password you sign in with as ${user?.email}.`);
      return;
    }
    setChecking(true);
    setProblem(null);
    try {
      const headers = await reauthenticate(typed);
      setPassword('');
      await onConfirm(headers);
    } catch (cause) {
      setProblem(errorMessage(cause));
    } finally {
      setChecking(false);
    }
  };

  const message = problem ?? error;
  return (
    <Sheet
      visible={visible}
      title={title}
      {...(subtitle ? { subtitle } : {})}
      onClose={onClose}
      footer={
        done ? (
          <Button label="Done" icon="checkmark" onPress={onClose} style={{ flex: 1 }} />
        ) : (
          <>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={confirmLabel}
              icon={confirmIcon}
              variant={destructive ? 'danger' : 'primary'}
              loading={checking || busy}
              disabled={!canConfirm || typed.length === 0}
              onPress={() => void confirm()}
              style={{ flex: 1 }}
            />
          </>
        )
      }
    >
      {done ?? (
        <>
          {children}
          <Field
            label="Your password"
            required
            hint={`The password you use to sign in as ${user?.email ?? 'yourself'}.`}
          >
            <Input
              accessibilityLabel="Your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={() => (canConfirm && typed ? void confirm() : undefined)}
            />
          </Field>
          {message ? (
            <Banner tone="danger" role="alert">
              {message}
            </Banner>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
