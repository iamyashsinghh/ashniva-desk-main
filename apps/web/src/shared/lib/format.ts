const DATE_FORMAT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
const DATE_YEAR_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const TIME_FORMAT = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "05 Sep" for the current year, "05 Sep 2025" otherwise. Accepts YYYY-MM-DD or ISO strings. */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return (sameYear ? DATE_FORMAT : DATE_YEAR_FORMAT).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? DATE_TIME_FORMAT.format(new Date(value)) : '—';
}

/**
 * The clock time alone.
 *
 * For a surface that has already said which day it is — a chat thread under its date separator,
 * where repeating "13 Sep" on every line is noise.
 */
export function formatTime(value: string | null | undefined): string {
  return value ? TIME_FORMAT.format(new Date(value)) : '—';
}

export function formatLongDate(value: Date = new Date()): string {
  return LONG_DATE_FORMAT.format(value);
}

/** 195 → "3h 15m", 45 → "45m", 0 → "0m". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest}m`;
  }
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "2h ago", "3d ago", "just now". */
export function formatRelative(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Due-date wording used in task rows: "Today", "Overdue 2d", "Tomorrow", "in 5d", "05 Sep". */
export function describeDue(dueDate: string | null, isOverdue: boolean): string {
  if (!dueDate) {
    return 'No due date';
  }
  const due = new Date(`${dueDate}T00:00:00Z`);
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (isOverdue) {
    return `Overdue ${Math.abs(days)}d`;
  }
  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Tomorrow';
  }
  if (days > 1 && days <= 7) {
    return `in ${days}d`;
  }
  return formatDate(dueDate);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
