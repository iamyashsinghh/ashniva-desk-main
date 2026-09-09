import { ROLE_LABELS } from '@ashniva/types';
import {
  Button,
  Card,
  DescriptionList,
  FormActions,
  FormField,
  Input,
  PageHeader,
} from '@ashniva/ui';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { changePassword, logout, switchOrganization } from '../../auth/api';
import { useCurrentUser } from '../../auth/session-context';
import { MyWorkScheduleCard } from '../../support-routing/components/MyWorkScheduleCard';

import '../../dashboard/dashboard.css';

/** Profile: who you are, organization switch, password change, sign out. */
export function ProfilePage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next.length < 10) {
      setMessage({ kind: 'error', text: 'The new password needs at least 10 characters.' });
      return;
    }
    if (next !== confirm) {
      setMessage({ kind: 'error', text: 'The two new passwords do not match.' });
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setMessage({ kind: 'ok', text: 'Password changed. Other devices have been signed out.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (cause) {
      setMessage({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="dashboard">
      <PageHeader
        title="Profile"
        subtitle={user.email}
        actions={<Button onClick={() => void handleLogout()}>Sign out</Button>}
      />
      <div className="dashboard__grid dashboard__grid--equal">
        <Card title="About you">
          <DescriptionList
            items={[
              { key: 'name', term: 'Name', description: user.name },
              {
                key: 'role',
                term: 'Role',
                description: user.roleName || ROLE_LABELS[user.roleKey],
              },
              { key: 'title', term: 'Title', description: user.title ?? '—' },
              { key: 'organization', term: 'Organization', description: user.organization.name },
            ]}
          />
          {user.organizations.length > 1 ? (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="muted">Switch organization</span>
              {user.organizations
                .filter((organization) => organization.id !== user.organization.id)
                .map((organization) => (
                  <Button
                    key={organization.id}
                    size="sm"
                    onClick={() =>
                      void switchOrganization(organization.id).then(() =>
                        navigate('/', { replace: true }),
                      )
                    }
                  >
                    {organization.name}
                  </Button>
                ))}
            </div>
          ) : null}
        </Card>
        <Card title="Change password">
          <form onSubmit={(event) => void submit(event)} className="composer" noValidate>
            <FormField label="Current password" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </FormField>
            <FormField label="New password" required hint="At least 10 characters">
              <Input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
              />
            </FormField>
            <FormField label="Confirm new password" required>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </FormField>
            {message ? (
              <p
                className={message.kind === 'error' ? 'form-error' : 'comment comment--client'}
                role={message.kind === 'error' ? 'alert' : 'status'}
              >
                {message.text}
              </p>
            ) : null}
            <FormActions>
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={!current || !next || !confirm}
                disabledReason="Fill in all three fields"
              >
                Change password
              </Button>
            </FormActions>
          </form>
        </Card>
        <MyWorkScheduleCard />
      </div>
    </div>
  );
}
