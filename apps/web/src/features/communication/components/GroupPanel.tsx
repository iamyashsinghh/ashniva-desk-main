import { MAX_CONVERSATION_TITLE_LENGTH, type ConversationDetail } from '@ashniva/types';
import { Button, Input } from '@ashniva/ui';
import { useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { uploadFile } from '../../files/api';
import { useGroupMutations } from '../scope-api';
import { ConversationAvatar } from './ConversationAvatar';
import { GroupMembers } from './GroupMembers';

export interface GroupPanelProps {
  conversation: ConversationDetail;
  /**
   * Whether the body is already open and there is nothing to toggle.
   *
   * True in the details drawer, where the panel *is* the content: a "Group" button that reveals
   * the only thing the drawer was opened for is a press that does nothing worth doing.
   */
  expanded?: boolean;
  /** Called once the viewer has taken themselves out, so the screen can close the thread. */
  onLeft?: () => void;
}

/**
 * What a group is, and who is in it.
 *
 * Every control here is drawn from `abilities`, which the server computed: `canManage` is true
 * only for the group's owner or an administrator, `canLeave` only for somebody actually on the
 * list. Drawing them from the server's answer rather than from a role comparison is what keeps a
 * rendered control and an accepted request the same decision — and the API refuses each of these
 * on its own account regardless of what this file draws.
 *
 * Collapsed by default. A group's membership is something people look at occasionally and read
 * the thread constantly, and a member list wedged permanently above the conversation gets in the
 * way of the thing they came for.
 */
export function GroupPanel({ conversation, expanded = false, onLeft }: GroupPanelProps) {
  const [toggled, setToggled] = useState(false);
  const open = expanded || toggled;
  const [error, setError] = useState<string | undefined>();
  const mutations = useGroupMutations(conversation.id);
  const abilities = conversation.abilities;

  async function run(work: () => Promise<unknown>) {
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <section className="chat-group">
      <div className="chat-group__bar">
        <ConversationAvatar
          name={conversation.title}
          imageFileId={conversation.imageFileId}
          size="md"
        />
        <span className="chat-group__count">
          {conversation.participants.filter((person) => person.leftAt === null).length} members
        </span>
        {expanded ? null : (
          <Button variant="ghost" size="sm" onClick={() => setToggled(!toggled)}>
            {toggled ? 'Hide group' : 'Group'}
          </Button>
        )}
        {abilities.canLeave ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void run(async () => {
                await mutations.leave.mutateAsync();
                onLeft?.();
              })
            }
          >
            Leave
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="chat-group__body">
          {abilities.canManage ? (
            <GroupIdentity conversation={conversation} onError={setError} />
          ) : null}
          <GroupMembers conversation={conversation} onError={setError} />
        </div>
      ) : null}
    </section>
  );
}

/**
 * The group's name and its picture.
 *
 * One form, because `PATCH /conversations/:id` treats them as one act — changing what the group
 * *is*, as against who is in it. Removing the picture sends an explicit null; leaving the field
 * out means "leave it alone", and the difference is the whole reason the field is nullable.
 */
function GroupIdentity({
  conversation,
  onError,
}: {
  conversation: ConversationDetail;
  onError: (message: string | undefined) => void;
}) {
  const mutations = useGroupMutations(conversation.id);
  const [title, setTitle] = useState(conversation.title);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = title.trim();
  const renamed = trimmed.length > 0 && trimmed !== conversation.title;

  async function run(work: () => Promise<unknown>) {
    onError(undefined);
    setBusy(true);
    try {
      await work();
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setBusy(false);
      if (picker.current) {
        picker.current.value = '';
      }
    }
  }

  return (
    <div className="chat-group__identity">
      <Input
        value={title}
        aria-label="Group name"
        maxLength={MAX_CONVERSATION_TITLE_LENGTH}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        disabled={!renamed}
        disabledReason="Type a new name first"
        onClick={() => void run(() => mutations.update.mutateAsync({ title: trimmed }))}
      >
        Rename
      </Button>

      {/* Uploaded through the files module with no parent, exactly like an attachment: the
          conversation adopts it and forces it INTERNAL. There is no second upload path. */}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Group picture"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void run(async () => {
              const uploaded = await uploadFile({ file });
              await mutations.update.mutateAsync({ imageFileId: uploaded.id });
            });
          }
        }}
      />
      <Button variant="ghost" size="sm" loading={busy} onClick={() => picker.current?.click()}>
        {conversation.imageFileId ? 'Change picture' : 'Set a picture'}
      </Button>
      {conversation.imageFileId ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void run(() => mutations.update.mutateAsync({ imageFileId: null }))}
        >
          Remove picture
        </Button>
      ) : null}
    </div>
  );
}
