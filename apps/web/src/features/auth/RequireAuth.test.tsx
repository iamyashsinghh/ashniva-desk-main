import { ROLE_KEYS } from '@ashniva/types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { sessionUserFor } from '../../test/fixtures';
import { RequireAuth } from './RequireAuth';
import { setAnonymous, setAuthenticated } from './session-store';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Login screen</p>} />
        <Route element={<RequireAuth audience="internal" />}>
          <Route path="/" element={<p>Internal home</p>} />
          <Route path="/tasks" element={<p>Internal tasks</p>} />
        </Route>
        <Route element={<RequireAuth audience="client" />}>
          <Route path="/portal" element={<p>Portal home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('sends anonymous visitors to the sign-in screen', () => {
    setAnonymous();
    renderAt('/tasks');
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('lets internal staff into the internal shell', () => {
    setAuthenticated('token', sessionUserFor(ROLE_KEYS.DEVELOPER));
    renderAt('/tasks');
    expect(screen.getByText('Internal tasks')).toBeInTheDocument();
  });

  it('redirects a client who opens an internal route to the portal', () => {
    setAuthenticated('token', sessionUserFor(ROLE_KEYS.CLIENT_EMPLOYEE, true));
    renderAt('/tasks');
    expect(screen.getByText('Portal home')).toBeInTheDocument();
  });

  it('redirects internal staff who open the portal to their own home', () => {
    setAuthenticated('token', sessionUserFor(ROLE_KEYS.TEAM_LEAD));
    renderAt('/portal');
    expect(screen.getByText('Internal home')).toBeInTheDocument();
  });
});
