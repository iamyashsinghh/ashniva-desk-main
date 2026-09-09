import { SegmentedControl, type ColorSchemePreference } from '@ashniva/ui';

import { useBranding } from '../providers/branding-context';

const OPTIONS: { key: ColorSchemePreference; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'Auto' },
];

/**
 * Light, dark, or follow the operating system.
 *
 * Three states rather than a two-state switch, because "follow the system" is a real answer and a
 * switch cannot express it: a person whose phone goes dark at dusk wants the app to go with it,
 * and a two-state control forces them to choose a side and then change it twice a day.
 *
 * A `SegmentedControl` rather than an icon button that cycles: the current choice is visible
 * without pressing anything, and each option is reachable directly instead of by pressing until
 * the right one comes round.
 */
export function ColorSchemeToggle({ className }: { className?: string }) {
  const { colorScheme, setColorScheme } = useBranding();
  return (
    <span className={className}>
      <SegmentedControl
        aria-label="Colour scheme"
        size="sm"
        value={colorScheme}
        onChange={setColorScheme}
        options={OPTIONS}
      />
    </span>
  );
}
