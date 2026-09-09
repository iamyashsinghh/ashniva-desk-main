import { Card } from '@ashniva/ui';

interface UnavailableFeatureProps {
  title: string;
  /** What the feature will do, so the reader knows what to expect. */
  description: string;
  phase?: string;
}

/**
 * Honest placeholder for features outside Phase 1 (contracts, SLA, billing …). Shows no fake
 * data and no buttons that do nothing.
 */
export function UnavailableFeature({
  title,
  description,
  phase = 'Phase 2',
}: UnavailableFeatureProps) {
  return (
    <Card title={title}>
      <p>
        <strong>Not available yet.</strong> {description}
      </p>
      <p style={{ marginTop: 8, color: 'var(--color-text-muted)' }}>
        Planned for {phase}. Nothing here is live in the current release.
      </p>
    </Card>
  );
}
