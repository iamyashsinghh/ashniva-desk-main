import type { RcaReport } from '@ashniva/types';

export type RcaAnswerKey =
  | 'what'
  | 'why'
  | 'affectedClientsVersions'
  | 'introducedBy'
  | 'workaround'
  | 'permanentFix'
  | 'prevention'
  | 'testsAdded';

/** The approved form's written questions, in the order it asks them (9 is the owner, 10 the date). */
export const RCA_QUESTIONS: ReadonlyArray<{ key: RcaAnswerKey; label: string; required: boolean }> =
  [
    { key: 'what', label: 'What happened?', required: true },
    { key: 'why', label: 'Why did it happen?', required: true },
    { key: 'affectedClientsVersions', label: 'Clients and versions affected', required: true },
    { key: 'introducedBy', label: 'Introduced by', required: true },
    { key: 'workaround', label: 'Workaround offered meanwhile', required: false },
    { key: 'permanentFix', label: 'Permanent solution', required: true },
    { key: 'prevention', label: 'Prevention', required: true },
    { key: 'testsAdded', label: 'Tests added', required: false },
  ];

export type RcaAnswers = Record<RcaAnswerKey, string>;

export function initialAnswers(rca: RcaReport | null): RcaAnswers {
  return {
    what: rca?.what ?? '',
    why: rca?.why ?? '',
    affectedClientsVersions: rca?.affectedClientsVersions ?? '',
    introducedBy: rca?.introducedBy ?? '',
    workaround: rca?.workaround ?? '',
    permanentFix: rca?.permanentFix ?? '',
    prevention: rca?.prevention ?? '',
    testsAdded: rca?.testsAdded ?? '',
  };
}

/**
 * The required questions still unanswered. A draft may leave any of them empty — the API only
 * insists on these six when the answers are actually submitted — so this gates Submit, not Save.
 */
export function missingAnswers(answers: RcaAnswers): string[] {
  return RCA_QUESTIONS.filter(
    (question) => question.required && answers[question.key].trim().length === 0,
  ).map((question) => question.label);
}

/** The body `POST /problems/:id/rca` takes; optional answers are left out rather than sent blank. */
export function rcaBody(answers: RcaAnswers, targetDate: string | null, draft: boolean) {
  return {
    what: answers.what.trim(),
    why: answers.why.trim(),
    affectedClientsVersions: answers.affectedClientsVersions.trim(),
    introducedBy: answers.introducedBy.trim(),
    ...(answers.workaround.trim() ? { workaround: answers.workaround.trim() } : {}),
    permanentFix: answers.permanentFix.trim(),
    prevention: answers.prevention.trim(),
    ...(answers.testsAdded.trim() ? { testsAdded: answers.testsAdded.trim() } : {}),
    ...(targetDate ? { targetDate } : {}),
    draft,
  };
}
