import type { ThemeSourceReadiness } from '@ashniva/types';
import { Badge, Card } from '@ashniva/ui';

import { formatDateTime } from '../../../shared/lib/format';

/**
 * Where this deployment's themes come from, and — when that is a Theme Manager — what is still
 * missing before it can actually serve one.
 *
 * The missing list is shown in full rather than summarised as "not connected". Whoever can change
 * `THEME_PROVIDER` is usually not the person who can get answers out of the Theme Manager team,
 * and a list they can forward is worth more than a status badge.
 */
export function ThemeSourceCard({ readiness }: { readiness: ThemeSourceReadiness }) {
  const isLocal = readiness.source === 'local';

  return (
    <Card
      title="Theme source"
      headerAddon={
        isLocal ? (
          <Badge tone="neutral">Stored in Ashniva Desk</Badge>
        ) : (
          <Badge tone={readiness.healthy ? 'success' : 'warning'}>
            {readiness.healthy ? 'Theme Manager: serving' : 'Theme Manager: nothing served yet'}
          </Badge>
        )
      }
    >
      <p className="muted">{readiness.behaviourWhenUnready}</p>
      {readiness.lastDocumentAt ? (
        <p className="muted">Last document {formatDateTime(readiness.lastDocumentAt)}</p>
      ) : null}

      <h3>What is in place</h3>
      <ul className="branding-source__list">
        {readiness.ready.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      {readiness.missing.length > 0 ? (
        <>
          <h3>What the Theme Manager still has to supply</h3>
          <ul className="branding-source__missing">
            {readiness.missing.map((item) => (
              <li key={item.key}>
                <h4>{item.what}</h4>
                <ul className="branding-source__list">
                  {item.needs.map((need) => (
                    <li key={need}>{need}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
