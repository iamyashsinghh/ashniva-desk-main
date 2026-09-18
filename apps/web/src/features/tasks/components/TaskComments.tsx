import {
  VISIBILITY,
  type CommentSummary,
  type FileSummary,
  type TaskDetail,
  type Visibility,
} from '@ashniva/types';
import {
  Button,
  Card,
  EmptyState,
  SegmentedControl,
  Switch,
  Textarea,
  VisibilityBadge,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { downloadFile, useFileObjectUrl } from '../../files/api';
import { useTaskMutations } from '../api';

type Filter = 'all' | 'internal' | 'client';

interface TaskCommentsProps {
  task: TaskDetail;
  canInternal: boolean;
}

/** Comment thread with the Internal / Client / All filter and a composer with a visibility switch. */
export function TaskComments({ task, canInternal }: TaskCommentsProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [body, setBody] = useState('');
  const [clientVisible, setClientVisible] = useState(!canInternal);
  const [error, setError] = useState<string | undefined>();
  const { comment } = useTaskMutations(task.id);
  const hasClient = Boolean(task.clientOrganization);

  const wanted = visibilityFor(filter);
  const visible = task.comments.filter((entry) => wanted === null || entry.visibility === wanted);

  async function send() {
    if (body.trim().length === 0) {
      return;
    }
    setError(undefined);
    const visibility: Visibility = clientVisible ? VISIBILITY.CLIENT : VISIBILITY.INTERNAL;
    try {
      await comment.mutateAsync({ body: body.trim(), visibility });
      setBody('');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card
      title="Comments"
      headerAddon={
        <SegmentedControl
          aria-label="Comment filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: 'All' },
            { key: 'internal', label: 'Internal' },
            { key: 'client', label: 'Client' },
          ]}
        />
      }
    >
      <div className="comment-list">
        {visible.length === 0 ? (
          <EmptyState title="No comments" />
        ) : (
          visible.map((entry) => <CommentRow key={entry.id} comment={entry} />)
        )}
      </div>
      <div className="composer" style={{ marginTop: 12 }}>
        <Textarea
          rows={3}
          placeholder={clientVisible ? 'Write to the client…' : 'Internal note…'}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label="New comment"
        />
        <div className="composer__row">
          <Switch
            tone="success"
            checked={clientVisible}
            onChange={setClientVisible}
            disabled={!hasClient || !canInternal}
            label="Client-visible"
            description={describeVisibility(hasClient, clientVisible)}
          />
          <Button
            variant="primary"
            size="sm"
            loading={comment.isPending}
            onClick={() => void send()}
            disabled={body.trim().length === 0}
            disabledReason="Type a comment first"
          >
            {clientVisible ? 'Send to client' : 'Add note'}
          </Button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export function CommentRow({ comment }: { comment: CommentSummary }) {
  const files = comment.files ?? [];
  return (
    <div
      className={['comment', comment.visibility === VISIBILITY.CLIENT ? 'comment--client' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="comment__meta">
        <strong>{comment.author.name}</strong>
        <span>{formatDateTime(comment.createdAt)}</span>
        <VisibilityBadge visibility={comment.visibility} />
      </div>
      <div className="comment__body">{comment.body}</div>
      {files.length > 0 ? (
        <div className="comment__files">
          {files.map((file) => (
            <CommentFile key={file.id} file={file} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommentFile({ file }: { file: FileSummary }) {
  const url = useFileObjectUrl(file.contentType.startsWith('image/') ? file.id : null);
  if (url) {
    return <img className="comment__file-image" src={url} alt={file.name} />;
  }
  return (
    <Button size="sm" onClick={() => void downloadFile(file)}>
      {file.name}
    </Button>
  );
}

function describeVisibility(hasClient: boolean, clientVisible: boolean): string {
  if (!hasClient) {
    return 'Internal project — no client';
  }
  return clientVisible ? 'The client will read this' : 'Only your team sees this';
}

function visibilityFor(filter: Filter): Visibility | null {
  if (filter === 'all') {
    return null;
  }
  return filter === 'client' ? VISIBILITY.CLIENT : VISIBILITY.INTERNAL;
}
