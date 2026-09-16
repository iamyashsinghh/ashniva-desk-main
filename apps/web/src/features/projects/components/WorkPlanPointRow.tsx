import {
  WORK_PLAN_NOTE_KIND_LABELS,
  WORK_PLAN_POINT_STATUS_LABELS,
  type WorkPlanNote,
  type WorkPlanPoint,
} from '@ashniva/types';
import { Button, FormField, Textarea } from '@ashniva/ui';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';

export function WorkPlanPointRow({
  point,
  busy,
  highlighted,
  dragHandle,
  dropClass,
  onStart,
  onSubmitTest,
  onStartTest,
  onPass,
  onFail,
  onReply,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  point: WorkPlanPoint;
  busy: boolean;
  highlighted?: boolean;
  dragHandle?: ReactNode;
  dropClass?: string;
  onStart: () => void;
  onSubmitTest: () => void;
  onStartTest: () => void;
  onPass: () => void;
  onFail: (body: string) => void;
  onReply: (noteId: string, body: string) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const remaining = useRemaining(point.dueAt, point.completedAt, point.remainingSeconds);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'fail' | { replyTo: string } | null>(null);

  function send() {
    const body = draft.trim();
    if (!body) {
      return;
    }
    if (mode === 'fail') {
      onFail(body);
    } else if (mode && typeof mode === 'object') {
      onReply(mode.replyTo, body);
    }
    setDraft('');
    setMode(null);
  }

  const replyTo = mode && typeof mode === 'object' ? mode.replyTo : null;
  const classes = [
    'work-plan__read-point',
    highlighted ? 'work-plan__just-added' : '',
    dropClass ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-work-plan-id={point.id}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragHandle}
      {point.body ? <p>{point.body}</p> : null}
      <div className="work-plan__read-meta">
        <span>{point.estimateMinutes} min</span>
        <span>{WORK_PLAN_POINT_STATUS_LABELS[point.status]}</span>
        {point.startedBy && point.startedAt ? <span>{point.startedBy.name}</span> : null}
        {point.startedAt && !point.completedAt ? (
          remaining === 0 || point.overdue ? (
            <span className="work-plan__timer work-plan__timer--late">Overdue</span>
          ) : (
            <span className="work-plan__timer">{formatClock(remaining)}</span>
          )
        ) : null}
        {point.completedAt ? <span className="work-plan__done">Done</span> : null}
        {point.canStart ? (
          <Button size="sm" loading={busy} onClick={onStart}>
            Start
          </Button>
        ) : null}
        {point.canSubmitTest ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onSubmitTest}>
            Send to tester
          </Button>
        ) : null}
        {point.canStartTest ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onStartTest}>
            Start testing
          </Button>
        ) : null}
        {point.canPass ? (
          <Button size="sm" variant="primary" loading={busy} onClick={onPass}>
            Complete
          </Button>
        ) : null}
        {point.canFail ? (
          <Button size="sm" loading={busy} onClick={() => setMode('fail')}>
            Not complete
          </Button>
        ) : null}
      </div>
      {point.notes.length > 0 ? (
        <ul className="work-plan__notes">
          {point.notes.map((note) => (
            <li key={note.id}>
              <NoteLine note={note} />
              {note.replies.length > 0 ? (
                <ul className="work-plan__replies">
                  {note.replies.map((reply) => (
                    <li key={reply.id}>
                      <NoteLine note={reply} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {point.canReply ? (
                <Button size="sm" loading={busy} onClick={() => setMode({ replyTo: note.id })}>
                  Reply
                </Button>
              ) : null}
              {replyTo === note.id ? (
                <div className="work-plan__note-form">
                  <FormField
                    label="Reply"
                    hint="Developer and tester both see this thread. You can add as many replies as you need."
                  >
                    <Textarea
                      rows={3}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                  </FormField>
                  <div className="work-plan__note-actions">
                    <Button size="sm" onClick={() => setMode(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={send}>
                      Send
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {mode === 'fail' ? (
        <div className="work-plan__note-form">
          <FormField
            label="What is wrong?"
            hint="The developer sees this and the timer keeps running until you or the team lead mark it done."
          >
            <Textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </FormField>
          <div className="work-plan__note-actions">
            <Button size="sm" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NoteLine({ note }: { note: WorkPlanNote }) {
  return (
    <div className="work-plan__note-line">
      <b>
        {note.author.name} · {WORK_PLAN_NOTE_KIND_LABELS[note.kind]}
      </b>
      <span>{note.body}</span>
    </div>
  );
}

function useRemaining(dueAt: string | null, completedAt: string | null, initial: number): number {
  const [seconds, setSeconds] = useState(initial);
  useEffect(() => {
    setSeconds(initial);
    if (!dueAt || completedAt) {
      return undefined;
    }
    const tick = () => {
      setSeconds(Math.max(0, Math.floor((new Date(dueAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [dueAt, completedAt, initial]);
  return seconds;
}

function formatClock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
