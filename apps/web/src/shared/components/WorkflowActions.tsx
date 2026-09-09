import { Alert, Button, type ButtonVariant } from '@ashniva/ui';
export interface ActionAvailability<TAction extends string> {
  action: TAction;
  enabled: boolean;
  reason?: string;
}

export interface ActionSpec<TAction extends string> {
  action: TAction;
  label: string;
  variant?: ButtonVariant;
}

interface WorkflowActionsProps<TAction extends string> {
  /** What the API reports as available for the current person and status. */
  availability: ActionAvailability<TAction>[];
  /** Button order, labels and variants for every action the screen knows how to run. */
  specs: ActionSpec<TAction>[];
  onAction: (action: TAction) => void;
  busy?: boolean;
  emptyHint?: string;
  error?: string;
}

/**
 * "Actions for your role", generalized: every button the API knows about, enabled exactly when
 * the API says so, with the API's reason as the disabled explanation. Actions ruled out by the
 * current status are hidden; ones blocked only by role stay visible so people learn who can act.
 */
export function WorkflowActions<TAction extends string>({
  availability,
  specs,
  onAction,
  busy = false,
  emptyHint = 'Nothing to do right now.',
  error,
}: WorkflowActionsProps<TAction>) {
  const byAction = new Map(availability.map((entry) => [entry.action, entry]));
  const visible = specs.filter((spec) => {
    const state = byAction.get(spec.action);
    return state && (state.enabled || !state.reason?.startsWith('Not available while'));
  });
  return (
    <div className="actions-card">
      {visible.length === 0 ? <p className="actions-card__hint">{emptyHint}</p> : null}
      {visible.map((spec) => {
        const state = byAction.get(spec.action);
        return (
          <Button
            key={spec.action}
            variant={spec.variant ?? 'secondary'}
            disabled={!state?.enabled}
            disabledReason={state?.reason}
            loading={busy}
            onClick={() => onAction(spec.action)}
          >
            {spec.label}
          </Button>
        );
      })}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
