import { act, fireEvent, render, screen } from '@testing-library/react';

import { useTimedReveal } from './use-timed-reveal';

/** A harness so the hook can be tested without a network or a query client anywhere near it. */
function Harness({ visibleForSeconds }: { visibleForSeconds: number }) {
  const { revealed, secondsLeft, show } = useTimedReveal();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          show({
            username: 'qa@acme.test',
            secret: 'a-test-password',
            visibleForSeconds,
            expiresAt: new Date().toISOString(),
          })
        }
      >
        show
      </button>
      {revealed ? <p>{`${revealed.secret} · ${secondsLeft}`}</p> : <p>hidden</p>}
    </div>
  );
}

describe('useTimedReveal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts down in the seconds the server asked for', () => {
    render(<Harness visibleForSeconds={5} />);
    fireEvent.click(screen.getByRole('button', { name: 'show' }));

    expect(screen.getByText('a-test-password · 5')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2_000));
    expect(screen.getByText('a-test-password · 3')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(3_000));
    expect(screen.getByText('hidden')).toBeInTheDocument();
  });

  it('drops the countdown when the component goes away', () => {
    const { unmount } = render(<Harness visibleForSeconds={60} />);
    fireEvent.click(screen.getByRole('button', { name: 'show' }));
    expect(vi.getTimerCount()).toBe(1);

    // Closing the card is the same as the countdown running out: no timer, and the state goes
    // with the component, so nothing is left holding the plaintext.
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
