import type { IvrMissingRequirement } from '@ashniva/types';
import { Card } from '@ashniva/ui';

import { errorMessage } from '../../../shared/lib/api-client';
import { useIvrReadinessQuery } from '../api';

import '../calls.css';

/**
 * Whether calls actually work, and what to ask for when they do not.
 *
 * This card exists because the previous answer was a boolean. "Unhealthy" told an administrator
 * that something was wrong and nothing they could do about it; the commonest reason calls do not
 * work is not a fault at all but a vendor document nobody has been given yet. So the card lists
 * the requirements by name, and states plainly what happens to a call placed meanwhile — because
 * that behaviour is deliberately quiet and reads like a bug.
 *
 * Nothing here is a control. It is the same list `docs/ivr-provider-contract.md` holds, served
 * from the adapter so the two cannot drift.
 */
export function IvrReadinessCard({ canManage }: { canManage: boolean }) {
  const query = useIvrReadinessQuery(canManage);

  if (!canManage) {
    return null;
  }

  if (query.isLoading) {
    return (
      <Card title="Calling">
        <p className="muted">Checking whether calls can be placed…</p>
      </Card>
    );
  }

  if (query.error || !query.data) {
    return (
      <Card title="Calling">
        <p role="alert">{query.error ? errorMessage(query.error) : 'No answer from the API.'}</p>
      </Card>
    );
  }

  const { provider, healthy, ready, missing, behaviourWhenUnready } = query.data;

  return (
    <Card title="Calling">
      <p className={healthy ? 'ivr-readiness__ok' : 'ivr-readiness__blocked'}>
        {healthy
          ? `The ${provider} adapter can place calls.`
          : `The ${provider} adapter cannot place calls yet.`}
      </p>

      {healthy ? null : (
        <>
          <p className="muted">{behaviourWhenUnready}</p>
          <h4 className="ivr-readiness__heading">Still needed</h4>
          <ul className="ivr-readiness__list">
            {missing.map((requirement: IvrMissingRequirement) => (
              <li key={requirement.key}>
                <strong>{requirement.what}</strong>
                <ul>
                  {requirement.needs.map((need) => (
                    <li key={need}>{need}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="ivr-readiness__heading">Already in place</h4>
      <ul className="ivr-readiness__list">
        {ready.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}
