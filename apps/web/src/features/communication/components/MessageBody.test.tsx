import type { ConversationAudienceMember } from '@ashniva/types';
import { render, screen } from '@testing-library/react';

import { MessageBody } from './MessageBody';

/**
 * Turning `@[uuid]` back into a person.
 *
 * The server stores a mention as an id so it survives a rename and cannot be forged by typing a
 * colleague's name. That leaves exactly one place with both halves — the ids in the body and the
 * roster from the server — and this is it. Until this component existed, a mention reached the
 * reader as a raw uuid in the middle of a sentence.
 */

const PRIYA = '3f1d2f2e-7c1a-4a0b-9f6e-1b2c3d4e5f60';
const SAM = 'a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061';
const GONE = '00000000-0000-4000-8000-000000000000';

const audience: ConversationAudienceMember[] = [
  { id: PRIYA, name: 'Priya S', email: 'priya@example.com', projectRole: 'LEAD' },
  { id: SAM, name: 'Sam T', email: 'sam@example.com', projectRole: 'TESTER' },
];

describe('MessageBody', () => {
  it('renders an ordinary message unchanged', () => {
    render(<MessageBody body="Pushed the fix" audience={audience} />);
    expect(screen.getByText('Pushed the fix')).toBeInTheDocument();
  });

  it('renders a mention as the person’s name and never as the id', () => {
    render(<MessageBody body={`Can @[${PRIYA}] look at this?`} audience={audience} />);

    expect(screen.getByText('@Priya S')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PRIYA))).not.toBeInTheDocument();
  });

  it('resolves several mentions in one line', () => {
    render(<MessageBody body={`@[${PRIYA}] @[${SAM}] standup at ten`} audience={audience} />);

    expect(screen.getByText('@Priya S')).toBeInTheDocument();
    expect(screen.getByText('@Sam T')).toBeInTheDocument();
  });

  it('masks a mention of somebody the conversation no longer reaches', () => {
    // What a mention of a person since removed from the project looks like. The reader has no
    // colleague to point at, and printing the raw identifier at them would be worse than saying
    // so — which is what the notification line and the list preview have always done.
    render(<MessageBody body={`@[${GONE}] are you there?`} audience={audience} />);

    expect(screen.getByText('@someone')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(GONE))).not.toBeInTheDocument();
  });

  it('leaves an email address alone, and a name typed by hand', () => {
    render(<MessageBody body="mail priya@example.com, or ask @priya" audience={audience} />);

    expect(screen.getByText(/mail priya@example.com, or ask @priya/)).toBeInTheDocument();
    expect(screen.queryByText('@Priya S')).not.toBeInTheDocument();
  });
});
