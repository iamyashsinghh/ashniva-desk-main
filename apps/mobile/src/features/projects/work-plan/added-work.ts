interface PhaseRow {
  id: string;
  heading: string;
  titles: Array<{ id: string; title: string; points: Array<{ id: string }> }>;
}

/**
 * Where "Add work with AI" put things, as sentences.
 *
 * The model chooses the phase, so the person has to be told where to look — otherwise the new
 * steps are somewhere in a long plan and "it worked" is a matter of faith.
 */
export function addedWorkLines(before: readonly PhaseRow[], after: readonly PhaseRow[]): string[] {
  const phases = new Set(before.map((phase) => phase.id));
  const titles = new Set(before.flatMap((phase) => phase.titles.map((title) => title.id)));
  const points = new Set(
    before.flatMap((phase) => phase.titles.flatMap((title) => title.points.map((p) => p.id))),
  );
  const lines: string[] = [];
  for (const phase of after) {
    const newTitles = phase.titles.filter((title) => !titles.has(title.id));
    const names = newTitles.map((title) => title.title).join(', ');
    if (!phases.has(phase.id)) {
      lines.push(names ? `New phase ${phase.heading}: ${names}` : `New phase ${phase.heading}`);
      continue;
    }
    if (names) {
      lines.push(`Added to ${phase.heading}: ${names}`);
    }
    for (const title of phase.titles) {
      if (titles.has(title.id)) {
        const extra = title.points.some((point) => !points.has(point.id));
        if (extra) {
          lines.push(`Added to ${phase.heading} · ${title.title}`);
        }
      }
    }
  }
  return lines;
}

export interface CombineSelection {
  phaseId: string | null;
  titleIds: string[];
}

export const NO_SELECTION: CombineSelection = { phaseId: null, titleIds: [] };

/** Topics can only be combined within one phase, so ticking one elsewhere starts a new pick. */
export function toggleCombine(
  selection: CombineSelection,
  phaseId: string,
  titleId: string,
): CombineSelection {
  if (selection.phaseId !== phaseId) {
    return { phaseId, titleIds: [titleId] };
  }
  const titleIds = selection.titleIds.includes(titleId)
    ? selection.titleIds.filter((id) => id !== titleId)
    : [...selection.titleIds, titleId];
  return titleIds.length === 0 ? NO_SELECTION : { phaseId, titleIds };
}
