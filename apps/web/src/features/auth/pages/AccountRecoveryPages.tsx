import { Button, FormField, Input } from '@ashniva/ui';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useBranding } from '../../../app/providers/branding-context';
import { brandingLogoSrc } from '../../branding/api';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { acceptInvitation, forgotPassword, previewInvitation, resetPassword } from '../api';
import { homePathFor } from '../session-context';

import './login-page.css';

const MIN_PASSWORD = 12;

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  const { branding } = useBranding();
  return (
    <main className="login-page">
      <div className="login-card" aria-labelledby="auth-title">
        <div className="login-card__brand">
          <span className="login-card__logo" aria-hidden="true">
            {brandingLogoSrc(branding) ? (
              <img src={brandingLogoSrc(branding) ?? undefined} alt="" />
            ) : (
              branding.logoText
            )}
          </span>
          <span>{branding.productName}</span>
        </div>
        <h1 id="auth-title" className="login-card__title">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

/** Self-service reset: always answers the same way so email addresses cannot be probed. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFailure(undefined);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <p className="login-card__hint">
          If an account exists for {email}, a reset link is on its way. It expires soon and works
          once.
        </p>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <FormField label="Email" required>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          {failure ? (
            <p className="login-card__error" role="alert">
              {failure}
            </p>
          ) : null}
          <Button type="submit" variant="primary" loading={submitting} disabled={!email}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="login-card__hint">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}

function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
}) {
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <FormField label="New password" required hint={`At least ${MIN_PASSWORD} characters`}>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => onPassword(event.target.value)}
        />
      </FormField>
      <FormField
        label="Confirm password"
        required
        error={mismatch ? 'Passwords do not match' : undefined}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => onConfirm(event.target.value)}
        />
      </FormField>
    </>
  );
}

export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const valid = password.length >= MIN_PASSWORD && password === confirm;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFailure(undefined);
    try {
      await resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => void navigate('/login', { replace: true }), 1500);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <p className="login-card__hint">Password changed. Taking you to sign in…</p>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <PasswordFields
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
          />
          {failure ? (
            <p className="login-card__error" role="alert">
              {failure}
            </p>
          ) : null}
          <Button type="submit" variant="primary" loading={submitting} disabled={!valid}>
            Set password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

/** Invitation landing page: shows who invited whom, then sets the first password. */
export function AcceptInvitationPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewInvitation>> | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [failure, setFailure] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const valid = password.length >= MIN_PASSWORD && password === confirm && name.trim().length > 1;

  useEffect(() => {
    previewInvitation(token)
      .then((data) => {
        setPreview(data);
        setName(data.name);
      })
      .catch((error: unknown) => setLoadError(errorMessage(error)));
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFailure(undefined);
    try {
      const user = await acceptInvitation({ token, name: name.trim(), password });
      void navigate(homePathFor(user), { replace: true });
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Welcome to the team">
      {loadError ? (
        <>
          <p className="login-card__error" role="alert">
            {loadError}
          </p>
          <p className="login-card__hint">
            Ask the person who invited you to send a new invitation.{' '}
            <Link to="/login">Sign in</Link>
          </p>
        </>
      ) : null}
      {preview ? (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <p className="login-card__hint">
            {preview.organizationName} invited <strong>{preview.email}</strong> as{' '}
            {preview.roleName}. The invitation expires {formatDateTime(preview.expiresAt)}.
          </p>
          <FormField label="Your name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </FormField>
          <PasswordFields
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
          />
          {failure ? (
            <p className="login-card__error" role="alert">
              {failure}
            </p>
          ) : null}
          <Button type="submit" variant="primary" loading={submitting} disabled={!valid}>
            Create my account
          </Button>
        </form>
      ) : null}
      {!preview && !loadError ? (
        <p className="login-card__hint">Checking your invitation…</p>
      ) : null}
    </AuthCard>
  );
}
