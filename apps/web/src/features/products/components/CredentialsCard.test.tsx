import type { CreatedProductCredential, ProductCredentialSummary } from '@ashniva/types';
import { fireEvent, render, screen } from '@testing-library/react';

import { CredentialsCard } from './CredentialsCard';

/**
 * The credentials card, and the promise it makes.
 *
 * A secret is shown once. These tests are what stop that promise being quietly broken by somebody
 * adding a "show key" affordance later — the value must appear when it is issued and never sit in
 * the table afterwards.
 */

function credential(over: Partial<ProductCredentialSummary> = {}): ProductCredentialSummary {
  return {
    id: 'cred-1',
    keyId: 'abcdef0123456789',
    label: 'Carelix production',
    isActive: true,
    lastUsedAt: null,
    rotatedAt: null,
    revokedAt: null,
    createdBy: { id: 'user-pm', name: 'Sneha N', email: 'sneha@example.com' },
    createdAt: '2026-09-11T09:00:00.000Z',
    ...over,
  };
}

const issued: CreatedProductCredential = {
  credential: credential(),
  secret: 'ask_abcdef0123456789.SUPERSECRETVALUE',
};

function renderCard(over: Partial<React.ComponentProps<typeof CredentialsCard>> = {}) {
  return render(
    <CredentialsCard
      credentials={[credential()]}
      canManage
      onIssue={async () => issued}
      onRotate={async () => issued}
      onRevoke={async () => undefined}
      {...over}
    />,
  );
}

describe('CredentialsCard', () => {
  beforeAll(() => {
    // jsdom renders <dialog> but implements neither showModal nor close, which the Modal calls.
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  it('never puts a secret in the list', () => {
    renderCard();
    expect(screen.getByText('Carelix production')).toBeInTheDocument();
    // The public half is shown; the secret half is not in the data at all.
    expect(document.body.textContent).not.toContain('SUPERSECRETVALUE');
  });

  it('shows the secret once when a credential is issued, and says so', async () => {
    renderCard();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Irista production' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue credential' }));

    expect(await screen.findByText(issued.secret)).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('only time this secret is shown');
  });

  it('offers a revoked credential no actions', () => {
    renderCard({
      credentials: [credential({ isActive: false, revokedAt: '2026-09-11T10:00:00.000Z' })],
    });
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
    // It stays on the list, though: which key was retired and when is incident information.
    expect(screen.getByText(/Revoked/)).toBeInTheDocument();
  });

  it('gives somebody without the permission nothing to press', () => {
    renderCard({ canManage: false });
    expect(screen.queryByRole('button', { name: 'Issue credential' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
  });
});
