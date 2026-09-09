import { render, screen } from '@testing-library/react';

import { Avatar } from './Avatar';
import { avatarTone, initialsOf } from './avatar-identity';

describe('initialsOf', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('  priya  raman  singh ')).toBe('PR');
    expect(initialsOf('Cher')).toBe('C');
  });
});

describe('avatarTone', () => {
  /** A colour that changes on reload is worse than one colour for everybody. */
  it('gives the same person the same colour every time', () => {
    expect(avatarTone('Ada Lovelace')).toBe(avatarTone('Ada Lovelace'));
  });
});

describe('Avatar', () => {
  it('names the person once, not twice', () => {
    render(<Avatar name="Ada Lovelace" src="https://example.test/ada.png" />);
    const avatar = screen.getByRole('img', { name: 'Ada Lovelace' });
    // The <img> inside carries an empty alt, so the name is announced by the wrapper alone.
    expect(avatar.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('falls back to initials with no photo', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toHaveTextContent('AL');
  });
});
