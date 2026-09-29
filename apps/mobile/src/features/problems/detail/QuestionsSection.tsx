import { PERMISSIONS, type ProblemDetail, type ProblemQuestion } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Section } from '../../../shared/components/layout';
import { AppText, Button, Divider } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { TextActionSheet } from '../components/TextActionSheet';
import { useProblemWrite } from '../problem-api';

/**
 * The thread with whoever owns the problem: each question, and the answer if one came.
 *
 * Answering goes through the same route as asking (`ask-developer` with a `questionId`) and needs
 * only `problem:read`, so anybody who can read the problem can answer from the phone.
 */
export function QuestionsSection({ problem }: { problem: ProblemDetail }) {
  const theme = useTheme();
  const { can } = useSession();
  const [answering, setAnswering] = useState<ProblemQuestion | null>(null);
  const canAnswer = can(PERMISSIONS.PROBLEM_READ);

  const answer = useProblemWrite<{ questionId: string; answer: string }>({
    path: `/problems/${problem.id}/ask-developer`,
    body: (input) => input,
    onDone: () => setAnswering(null),
  });

  return (
    <Section
      title="Questions"
      count={problem.questions.length}
      icon="chatbubbles-outline"
      collapsible
      initiallyOpen={problem.questions.some((question) => !question.answer)}
    >
      {problem.questions.length === 0 ? (
        <AppText size="sm" tone="muted">
          Nobody has asked anything yet.
        </AppText>
      ) : (
        problem.questions.map((question, index) => (
          <View key={question.id} style={{ gap: theme.spacing.xs }}>
            {index > 0 ? <Divider /> : null}
            <AppText weight="medium">{question.body}</AppText>
            <AppText size="xs" tone="faint">
              {question.askedBy?.name ?? 'somebody'} · {formatDateTime(question.askedAt)}
            </AppText>
            {question.answer ? (
              <AppText size="sm">
                {question.answer}
                <AppText size="xs" tone="muted">
                  {' '}
                  — {question.answeredBy?.name ?? 'somebody'}
                </AppText>
              </AppText>
            ) : (
              <View style={{ alignItems: 'flex-start', gap: theme.spacing.xs }}>
                <AppText size="sm" tone="muted">
                  No answer yet
                </AppText>
                {canAnswer ? (
                  <Button
                    label="Answer"
                    icon="arrow-undo-outline"
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      answer.reset();
                      setAnswering(question);
                    }}
                  />
                ) : null}
              </View>
            )}
          </View>
        ))
      )}
      {answering ? (
        <TextActionSheet
          title="Answer the question"
          subtitle={answering.body}
          label="Your answer"
          submitLabel="Answer"
          submitIcon="send-outline"
          busy={answer.busy}
          error={answer.error}
          onClose={() => setAnswering(null)}
          onSubmit={(text) => void answer.run({ questionId: answering.id, answer: text })}
        />
      ) : null}
    </Section>
  );
}
