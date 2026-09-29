import { Chip, ChipScroller } from '../../shared/components/chips';

/**
 * "All" plus one chip per status, in one scrolling row above a list.
 *
 * Single choice, because each list here is short enough that one status at a time answers the
 * question people bring to it ("what is waiting on me", "what is active") without a sheet.
 */
export function StatusChips<T extends string>({
  options,
  value,
  onChange,
  labelFor,
  allLabel = 'All',
}: {
  options: readonly T[];
  value: T | null;
  onChange: (value: T | null) => void;
  labelFor: (value: T) => string;
  allLabel?: string;
}) {
  return (
    <ChipScroller>
      <Chip label={allLabel} selected={value === null} onPress={() => onChange(null)} />
      {options.map((option) => (
        <Chip
          key={option}
          label={labelFor(option)}
          selected={value === option}
          onPress={() => onChange(value === option ? null : option)}
        />
      ))}
    </ChipScroller>
  );
}
