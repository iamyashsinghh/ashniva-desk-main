import type { WorkPlanExplainPreview } from '@ashniva/types';
import { Alert, Button, Modal } from '@ashniva/ui';

/**
 * After "assign on my words?": show the AI rewrite, then Update / Keep mine / Retry.
 * Nothing is committed here — the parent applies or saves.
 */
export function WorkPlanExplainDialog({
  preview,
  loading,
  error,
  onUpdate,
  onKeepMine,
  onRetry,
  onClose,
}: {
  preview: WorkPlanExplainPreview | null;
  loading: boolean;
  error?: string;
  onUpdate: () => void;
  onKeepMine: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      size="lg"
      title="Update wording for the developer?"
      description="AI rewrote the steps from what you wrote. Update uses this text; Keep mine keeps yours. Retry asks for another draft. Assignments and times are still saved only when you press Save."
      onClose={onClose}
    >
      <div className="work-plan-explain">
        {error ? <Alert tone="danger" title={error} /> : null}
        {loading && !preview ? <p className="muted">Rewriting steps…</p> : null}
        {preview
          ? preview.titles.map((title) => (
              <article key={title.id} className="work-plan-explain__title">
                <header>
                  <p className="muted">{title.phaseHeading}</p>
                  <strong>{title.title}</strong>
                  {title.title !== title.originalTitle ? (
                    <p className="muted">Was: {title.originalTitle}</p>
                  ) : null}
                </header>
                <ul>
                  {title.points.map((point) => (
                    <li key={point.id}>
                      <p>{point.body}</p>
                      {point.body !== point.originalBody ? (
                        <p className="muted work-plan-explain__was">Was: {point.originalBody}</p>
                      ) : null}
                      <p className="muted">{point.estimateMinutes} min (unchanged)</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          : null}
        <div className="work-plan-explain__actions">
          <Button variant="primary" disabled={!preview || loading} loading={loading} onClick={onUpdate}>
            Yes, update
          </Button>
          <Button disabled={loading} onClick={onKeepMine}>
            No, keep mine
          </Button>
          <Button disabled={loading} loading={loading} onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * First gate before AI runs: assign with the manager's own wording, or ask AI to rewrite.
 */
export function WorkPlanAssignWordsDialog({
  onYes,
  onNo,
  onClose,
}: {
  onYes: () => void;
  onNo: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      size="sm"
      title="Can we assign on my words?"
      description="Yes lets AI rewrite the steps so the developer can follow them. No saves the assignment with exactly what you wrote. You still set times and press Save yourself."
      onClose={onClose}
    >
      <div className="work-plan-explain__actions">
        <Button variant="primary" onClick={onYes}>
          Yes — rewrite with AI
        </Button>
        <Button onClick={onNo}>No — use my words</Button>
      </div>
    </Modal>
  );
}
