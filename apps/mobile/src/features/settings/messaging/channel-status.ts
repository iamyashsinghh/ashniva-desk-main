import type { PillTone } from '../../../shared/components/primitives';

export interface ChannelHealth {
  enabled: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/**
 * The status pill both channels share, in the web's order: not set up, turned off, a channel-
 * specific blocker (WhatsApp without a token), the last attempt failing, ready.
 */
export function channelStatus(
  settings: ChannelHealth | null,
  blocker?: string | null,
): { label: string; tone: PillTone } {
  if (!settings) {
    return { label: 'Not set up', tone: 'neutral' };
  }
  if (!settings.enabled) {
    return { label: 'Turned off', tone: 'warning' };
  }
  if (blocker) {
    return { label: blocker, tone: 'warning' };
  }
  return settings.lastError
    ? { label: 'Last attempt failed', tone: 'danger' }
    : { label: 'Ready', tone: 'success' };
}
