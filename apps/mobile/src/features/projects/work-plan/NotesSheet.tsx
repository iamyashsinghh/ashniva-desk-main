import {
  WORK_PLAN_NOTE_KIND_LABELS,
  type WorkPlanNote,
  type WorkPlanNoteKind,
  type WorkPlanPoint,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '../../../shared/components/Avatar';
import { Banner } from '../../../shared/components/feedback';
import {
  AppText,
  Button,
  Field,
  Input,
  Pill,
  type PillTone,
} from '../../../shared/components/primitives';
import { Sheet } from '../../../shared/components/Sheet';
import { formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { usePointRunner } from './point-runner';

/**
 * The doubt-and-reply thread on one step, between the developer, the tester and the lead.
 *
 * Who may ask and who may answer is the API's `canDoubt` / `canReply`; the sheet only hides the
 * boxes it would refuse anyway.
 */
export function NotesSheet({
  point,
  visible,
  onClose,
}: {
  point: WorkPlanPoint;
  visible: boolean;
  onClose: () => void;
}) {
  const runner = usePointRunner();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<WorkPlanNote | null>(null);

  const close = () => {
    runner.clearSheetErrors();
    setReplyTo(null);
    onClose();
  };

  const send = async () => {
    const text = body.trim();
    if (!text) {
      return;
    }
    const ok = replyTo
      ? await runner.reply(point.id, replyTo.id, text)
      : await runner.addNote(point.id, text);
    if (ok) {
      setBody('');
      setReplyTo(null);
    }
  };

  const canWrite = replyTo ? point.canReply : point.canDoubt;

  return (
    <Sheet
      visible={visible}
      title="Notes"
      subtitle={point.body ?? undefined}
      onClose={close}
      footer={
        canWrite ? (
          <View style={{ flex: 1 }}>
            <Button
              label={replyTo ? `Reply to ${replyTo.author.name}` : 'Add a doubt'}
              icon={replyTo ? 'return-down-forward-outline' : 'help-circle-outline'}
              loading={runner.noteBusy}
              disabled={!body.trim()}
              onPress={() => void send()}
            />
          </View>
        ) : undefined
      }
    >
      {runner.noteError ? (
        <Banner tone="danger" role="alert">
          {runner.noteError}
        </Banner>
      ) : null}
      {point.notes.length === 0 ? (
        <AppText size="sm" tone="muted">
          No notes on this step yet.
        </AppText>
      ) : null}
      {point.notes.map((note) => (
        <View key={note.id} style={{ gap: 6 }}>
          <NoteBubble note={note} />
          {note.replies.map((reply) => (
            <View key={reply.id} style={{ marginLeft: 28 }}>
              <NoteBubble note={reply} />
            </View>
          ))}
          {point.canReply ? (
            <View style={{ alignSelf: 'flex-start', marginLeft: 28 }}>
              <Button
                label={replyTo?.id === note.id ? 'Cancel reply' : 'Reply'}
                variant="ghost"
                size="sm"
                onPress={() => setReplyTo(replyTo?.id === note.id ? null : note)}
              />
            </View>
          ) : null}
        </View>
      ))}
      {canWrite ? (
        <Field label={replyTo ? 'Your reply' : 'Ask the lead or tester'}>
          <Input
            multiline
            value={body}
            onChangeText={setBody}
            placeholder={replyTo ? 'Write a reply' : 'What is unclear about this step?'}
            style={{ minHeight: 80 }}
          />
        </Field>
      ) : null}
    </Sheet>
  );
}

const NOTE_TONES: Record<WorkPlanNoteKind, PillTone> = {
  DOUBT: 'warning',
  ISSUE: 'danger',
  REPLY: 'neutral',
};

function NoteBubble({ note }: { note: WorkPlanNote }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        gap: 6,
        padding: theme.spacing.md,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <Avatar name={note.author.name} size={24} />
        <AppText size="sm" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
          {note.author.name}
        </AppText>
        <Pill label={WORK_PLAN_NOTE_KIND_LABELS[note.kind]} tone={NOTE_TONES[note.kind]} />
      </View>
      <AppText size="sm">{note.body}</AppText>
      <AppText size="xs" tone="faint">
        {formatSince(note.createdAt)}
      </AppText>
    </View>
  );
}
