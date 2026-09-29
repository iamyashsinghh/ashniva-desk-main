import {
  VISIBILITY,
  splitMentions,
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
import { useId, useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useComposerMentions } from '../../communication/components/composer-mentions';
import { MentionPicker } from '../../communication/components/MentionPicker';
import { downloadFile, useFileObjectUrl } from '../../files/api';
import { useTaskMutations } from '../api';
import { useTaskMentionSearch } from './task-mention-search';

import '../../communication/communication.css';

type Filter = 'all' | 'internal' | 'client';

interface TaskCommentsProps {
  task: TaskDetail;
  canInternal: boolean;
}

/** Comment thread with @mentions, visibility switch, and Internal / Client / All filter. */
export function TaskComments({ task, canInternal }: TaskCommentsProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [body, setBody] = useState('');
  const [clientVisible, setClientVisible] = useState(!canInternal);
  const [error, setError] = useState<string | undefined>();
  const { comment } = useTaskMutations(task.id);
  const hasClient = Boolean(task.clientOrganization);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const listboxId = useId();
  const mentionSearch = useTaskMentionSearch(task.id);
  const mentions = useComposerMentions(mentionSearch, textarea);

  const wanted = visibilityFor(filter);
  const visible = task.comments.filter((entry) => wanted === null || entry.visibility === wanted);

  function apply(value: string, caret?: number) {
    setBody(value);
    mentions.noteDraft(value);
    if (caret !== undefined) {
      mentions.reactToDraft(value, caret);
    }
  }

  async function send() {
    if (body.trim().length === 0) {
      return;
    }
    setError(undefined);
    const visibility: Visibility = clientVisible ? VISIBILITY.CLIENT : VISIBILITY.INTERNAL;
    try {
      await comment.mutateAsync({ body: mentions.toBody(body.trim()), visibility });
      setBody('');
      mentions.noteDraft('');
      mentions.forget();
      mentionSearch.setTerm(null);
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
        <div className="composer__mentions">
          {mentionSearch.isOpen ? (
            <MentionPicker
              query={mentionSearch.term ?? ''}
              people={mentionSearch.people}
              isLoading={mentionSearch.isLoading}
              hasMore={mentionSearch.hasMore}
              activeIndex={mentionSearch.activeIndex}
              idPrefix={listboxId}
              onChoose={(person) => {
                const next = mentions.insert(
                  person,
                  textarea.current?.selectionStart ?? body.length,
                );
                apply(next);
              }}
            />
          ) : null}
          <Textarea
            ref={textarea}
            rows={3}
            placeholder={
              clientVisible
                ? 'Write to the client… Type @ to mention someone'
                : 'Internal note… Type @ to mention someone'
            }
            value={body}
            aria-label="New comment"
            aria-controls={mentionSearch.isOpen ? listboxId : undefined}
            aria-activedescendant={
              mentionSearch.isOpen ? `${listboxId}-${mentionSearch.activeIndex}` : undefined
            }
            onChange={(event) => {
              apply(event.target.value, event.target.selectionStart);
            }}
            onKeyDown={(event) => {
              const result = mentions.handleKey(event);
              if (result === 'handled') {
                event.preventDefault();
                return;
              }
              if (typeof result === 'string') {
                event.preventDefault();
                apply(result);
                return;
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
        </div>
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
  const names = new Map((comment.mentions ?? []).map((person) => [person.id, person.name]));
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
      <div className="comment__body">
        {splitMentions(comment.body).map((part, index) =>
          part.kind === 'text' ? (
            <span key={index}>{part.text}</span>
          ) : (
            <span key={index} className="chat-mention">
              {`@${names.get(part.userId) ?? 'someone'}`}
            </span>
          ),
        )}
      </div>
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
