import { WORK_PLAN_DEFAULT_ESTIMATE_MINUTES, type WorkPlanPhaseInput } from '@ashniva/types';
import { Button, FormField, Input, Textarea } from '@ashniva/ui';

export function WorkPlanEditor({
  draft,
  startedIds,
  onChange,
}: {
  draft: WorkPlanPhaseInput[];
  startedIds: Set<string>;
  onChange: (next: WorkPlanPhaseInput[]) => void;
}) {
  function setPhase(index: number, patch: Partial<WorkPlanPhaseInput>) {
    onChange(draft.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)));
  }

  return (
    <div className="work-plan">
      {draft.map((phase, phaseIndex) => {
        const phaseStarted = draftHasStarted(phase, startedIds);
        return (
          <section key={phase.id ?? `phase-${phaseIndex}`} className="work-plan__phase">
            <div className="work-plan__phase-head">
              <FormField label="Phase heading">
                <Input
                  value={phase.heading}
                  onChange={(event) => setPhase(phaseIndex, { heading: event.target.value })}
                />
              </FormField>
              <Button
                size="sm"
                variant="ghost"
                disabled={phaseStarted}
                disabledReason={
                  phaseStarted ? 'This phase has started work, so it stays in the plan.' : undefined
                }
                onClick={() => onChange(draft.filter((_, i) => i !== phaseIndex))}
              >
                Remove phase
              </Button>
            </div>
            {phase.titles.map((title, titleIndex) => {
              const titleStarted = titleHasStarted(title, startedIds);
              return (
                <div key={title.id ?? `title-${titleIndex}`} className="work-plan__title">
                  <div className="work-plan__title-head">
                    <FormField label="Title">
                      <Input
                        value={title.title}
                        onChange={(event) => {
                          const titles = phase.titles.map((row, i) =>
                            i === titleIndex ? { ...row, title: event.target.value } : row,
                          );
                          setPhase(phaseIndex, { titles });
                        }}
                      />
                    </FormField>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={titleStarted}
                      disabledReason={
                        titleStarted
                          ? 'This topic has started work, so it stays in the plan.'
                          : undefined
                      }
                      onClick={() =>
                        setPhase(phaseIndex, {
                          titles: phase.titles.filter((_, i) => i !== titleIndex),
                        })
                      }
                    >
                      Remove title
                    </Button>
                  </div>
                  <div className="work-plan__points">
                    <div className="work-plan__points-head">
                      <span>Point</span>
                      <span>Min</span>
                      <span className="sr-only">Actions</span>
                    </div>
                    {title.points.map((point, pointIndex) => (
                      <div key={point.id ?? `point-${pointIndex}`} className="work-plan__point-row">
                        <Textarea
                          rows={2}
                          aria-label={`Point ${pointIndex + 1}`}
                          placeholder="What this step covers"
                          value={point.body}
                          onChange={(event) => {
                            const points = title.points.map((row, i) =>
                              i === pointIndex ? { ...row, body: event.target.value } : row,
                            );
                            const titles = phase.titles.map((row, i) =>
                              i === titleIndex ? { ...row, points } : row,
                            );
                            setPhase(phaseIndex, { titles });
                          }}
                        />
                        <Input
                          className="work-plan__minutes"
                          type="number"
                          min={1}
                          aria-label={`Minutes for point ${pointIndex + 1}`}
                          value={point.estimateMinutes}
                          onChange={(event) => {
                            const points = title.points.map((row, i) =>
                              i === pointIndex
                                ? {
                                    ...row,
                                    estimateMinutes: Math.max(
                                      1,
                                      Math.floor(Number(event.target.value)) || 1,
                                    ),
                                  }
                                : row,
                            );
                            const titles = phase.titles.map((row, i) =>
                              i === titleIndex ? { ...row, points } : row,
                            );
                            setPhase(phaseIndex, { titles });
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={Boolean(point.id && startedIds.has(point.id))}
                          disabledReason={
                            point.id && startedIds.has(point.id)
                              ? 'This point has already started, so it stays in the plan.'
                              : undefined
                          }
                          onClick={() => {
                            const titles = phase.titles.map((row, i) =>
                              i === titleIndex
                                ? { ...row, points: row.points.filter((_, p) => p !== pointIndex) }
                                : row,
                            );
                            setPhase(phaseIndex, { titles });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="work-plan__add"
                    size="sm"
                    onClick={() => {
                      const titles = phase.titles.map((row, i) =>
                        i === titleIndex
                          ? {
                              ...row,
                              points: [
                                ...row.points,
                                { body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES },
                              ],
                            }
                          : row,
                      );
                      setPhase(phaseIndex, { titles });
                    }}
                  >
                    Add point
                  </Button>
                </div>
              );
            })}
            <Button
              className="work-plan__add"
              size="sm"
              onClick={() =>
                setPhase(phaseIndex, {
                  titles: [
                    ...phase.titles,
                    {
                      title: `Title ${phase.titles.length + 1}`,
                      points: [{ body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES }],
                    },
                  ],
                })
              }
            >
              Add title
            </Button>
          </section>
        );
      })}
      <Button
        className="work-plan__add"
        onClick={() =>
          onChange([
            ...draft,
            {
              heading: `Phase ${draft.length + 1}`,
              titles: [
                {
                  title: 'Title 1',
                  points: [{ body: '', estimateMinutes: WORK_PLAN_DEFAULT_ESTIMATE_MINUTES }],
                },
              ],
            },
          ])
        }
      >
        Add phase
      </Button>
    </div>
  );
}

function titleHasStarted(
  title: WorkPlanPhaseInput['titles'][number],
  startedIds: Set<string>,
): boolean {
  return title.points.some((point) => Boolean(point.id && startedIds.has(point.id)));
}

function draftHasStarted(phase: WorkPlanPhaseInput, startedIds: Set<string>): boolean {
  return phase.titles.some((title) => titleHasStarted(title, startedIds));
}
