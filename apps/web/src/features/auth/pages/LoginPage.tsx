import { Button, FormField, Input } from '@ashniva/ui';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { webEnv } from '../../../config/env';
import { useBranding } from '../../../app/providers/branding-context';
import { brandingLogoSrc } from '../../branding/api';
import { errorMessage } from '../../../shared/lib/api-client';
import { login } from '../api';
import { homePathFor, useSession } from '../session-context';

import './login-page.css';

/** Sign-in screen. On success the person lands on their role's home (or where they were going). */
export function LoginPage() {
  const { branding } = useBranding();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (session.status === 'authenticated') {
    return <Navigate to={homePathFor(session.user)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setSubmitting(true);
    setFailure(undefined);
    try {
      const user = await login({ email, password });
      const from = (location.state as { from?: string } | null)?.from;
      const target = from && from !== '/login' ? from : homePathFor(user);
      void navigate(target, { replace: true });
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <form
        className="login-card"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        aria-labelledby="login-title"
      >
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
        <h1 id="login-title" className="login-card__title">
          Sign in
        </h1>

        <FormField label="Email" error={errors.email} required>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>

        <FormField label="Password" error={errors.password} required>
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>

        {failure ? (
          <p className="login-card__error" role="alert">
            {failure}
          </p>
        ) : null}

        <Button type="submit" variant="primary" loading={submitting}>
          Sign in
        </Button>
        {webEnv.isDevelopment ? (
          <p className="login-card__demo">
            Local login: <code>director@example.com</code> / <code>ChangeMe123!</code>
          </p>
        ) : null}
        <p className="login-card__hint">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      </form>
    </main>
  );
}
