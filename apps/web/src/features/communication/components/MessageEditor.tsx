import {
  decodeMentions,
  encodeMentions,
  MAX_MESSAGE_LENGTH,
  type ConversationAudienceMember,
} from '@ashniva/types';
import { Button, Textarea } from '@ashniva/ui';
import { useState } from 'react';

export interface MessageEditorProps {
  initialBody: string;
  /** The conversation's people, to show the message's mentions as names while it is edited. */
  audience?: readonly ConversationAudienceMember[];
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Rewriting one's own line, inside the fifteen-minute window the server allows.
 *
 * **Emptying a message is not an edit.** Save stays disabled while the trimmed body is empty and
 * the button says why, because there is no delete for an ordinary person to fall back on and
 * blanking a line would be a withdrawal by another name. What is saved is the trimmed text, so
 * padding is never what makes a body look non-empty.
 *
 * That disabled button is a courtesy, not the control. Whether an empty edit is allowed is the
 * API's rule and the API enforces it; this component only declines to ask for something it already
 * knows is not on offer.
 *
 * Mentions are shown as `@Name` and written back as ids on save, from the names known when the
 * editor opened.
 */
export function MessageEditor({
  initialBody,
  audience = [],
  onSave,
  onCancel,
}: MessageEditorProps) {
  const [opened] = useState(() =>
    decodeMentions(initialBody, new Map(audience.map((person) => [person.id, person.name]))),
  );
  const [draft, setDraft] = useState(opened.text);
  const trimmed = encodeMentions(draft.trim(), opened.picks);

  return (
    <div className="chat-message__editor">
      <Textarea
        rows={2}
        value={draft}
        maxLength={MAX_MESSAGE_LENGTH}
        aria-label="Edit this message"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
      />
      <div className="chat-message__editor-actions">
        <Button
          variant="primary"
          size="sm"
          disabled={trimmed.length === 0}
          disabledReason="A message cannot be emptied — withdraw it instead"
          onClick={() => void onSave(trimmed)}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
