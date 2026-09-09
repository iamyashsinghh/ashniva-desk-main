import { avatarTone, initialsOf } from './avatar-identity';

import './avatar.css';

export interface AvatarProps {
  /** The person's name. Used for the initials and for the accessible name. */
  name: string;
  /** Photo URL. Falls back to initials when absent. */
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * A person, as a photo or as their initials.
 *
 * The image carries an empty `alt` and the name lives in the wrapper's `aria-label`: with the
 * name in both, a screen reader reads it twice.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const classes = [
    'ui-avatar',
    `ui-avatar--${size}`,
    src ? '' : `ui-tone--${avatarTone(name)}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} role="img" aria-label={name}>
      {src ? (
        <img className="ui-avatar__image" src={src} alt="" />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}
