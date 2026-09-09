/**
 * Turning API values into words.
 *
 * Every screen shows minutes, dates and instants, and each of them formatted slightly differently
 * is how an app comes to look like six apps. The device locale is used rather than a fixed one:
 * somebody who has set their phone to a day-first date has asked for a day-first date.
 */

/** Minutes as hours and minutes: "45 min", "2 h", "2 h 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** A date, without a time. Returns null for a null input so a caller can skip the row. */
export function formatDate(value: string | null): string | null {
  const date = parse(value);
  return date ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
}

/** A date and a time, for something that happens at an instant rather than on a day. */
export function formatDateTime(value: string | null): string | null {
  const date = parse(value);
  return date
    ? date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
}

/**
 * The clock time alone.
 *
 * For a surface that has already said which day it is — a chat thread under its date separator,
 * where repeating "13 Sep" on every line is noise.
 */
export function formatTime(value: string | null): string | null {
  const date = parse(value);
  return date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;
}

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * A conversation list is read by scanning it, and "3 h" tells you what you want to know faster
 * than a timestamp does. Falls back to a date past a week, where the exact gap stops mattering.
 */
export function formatSince(value: string | null): string | null {
  const date = parse(value);
  if (!date) {
    return null;
  }
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min ago`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)} h ago`;
  }
  if (seconds < 604_800) {
    return `${Math.floor(seconds / 86_400)} d ago`;
  }
  return formatDate(value);
}

/** Seconds as a call duration: "0:42", "3:07". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Today's date as the API wants it for a work log: `YYYY-MM-DD`, in the device's own day. */
export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** A parsed date, or null for anything that is not one. An API can send a null; a proxy can send
 * nonsense, and `Invalid Date` printed on a card is worse than a missing row. */
function parse(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
