import { useState } from 'react';

import { Alert } from '../../src/components/alert/Alert';
import { Avatar } from '../../src/components/avatar/Avatar';
import { Button } from '../../src/components/button/Button';
import { EmptyState } from '../../src/components/empty-state/EmptyState';
import { Skeleton, SkeletonText } from '../../src/components/skeleton/Skeleton';
import { Spinner } from '../../src/components/spinner/Spinner';
import { Toast } from '../../src/components/toast/Toast';
import type { Tone } from '../../src/tokens/status-tone';
import { Row, Section, Specimen } from '../Specimen';

const TONES: Tone[] = ['info', 'success', 'warning', 'danger', 'neutral'];

export function FeedbackSection() {
  const [dismissed, setDismissed] = useState(false);

  return (
    <Section
      id="feedback"
      title="Feedback"
      summary="Alerts pick their live-region role from their tone: a failure interrupts, a confirmation waits its turn."
    >
      <Specimen label="Alert tones">
        <div className="stack">
          {TONES.map((tone) => (
            <Alert key={tone} tone={tone}>
              {tone === 'danger'
                ? 'The estimate must be a whole number of minutes.'
                : `This is a ${tone} message.`}
            </Alert>
          ))}
        </div>
      </Specimen>

      <Specimen label="Alert with a title, an action and a dismiss">
        <div className="stack">
          <Alert
            tone="warning"
            title="Two projects are at risk"
            action={<Button size="sm">Review</Button>}
          >
            Delivery dates moved after last week's change requests were approved.
          </Alert>
          {dismissed ? null : (
            <Alert
              tone="success"
              onDismiss={() => setDismissed(true)}
              dismissLabel="Dismiss the export notice"
            >
              The export is ready in your notifications.
            </Alert>
          )}
        </div>
      </Specimen>

      {/* Shown in place rather than in a `ToastStack`, which is `position: fixed` and would sit
          over the gallery for as long as the page is open. */}
      <Specimen label="Toasts">
        <div className="stack" style={{ width: '22rem' }}>
          <Toast
            dismissLabel="Dismiss the message from Priya S"
            leading={<Avatar name="Priya S" size="sm" />}
            onOpen={() => undefined}
            onDismiss={() => undefined}
          >
            <strong>Priya S</strong>
            <span>Cutting the build tonight — can you look at the sync fix?</span>
          </Toast>
          <Toast dismissLabel="Dismiss the export notice" onDismiss={() => undefined}>
            <strong>Export ready</strong>
            <span>The March timesheet has finished building.</span>
          </Toast>
        </div>
      </Specimen>

      <Specimen label="Spinners">
        <Row>
          <Spinner size="sm" />
          <Spinner />
          <Spinner size="lg" />
        </Row>
      </Specimen>

      <Specimen label="Skeletons">
        <div className="stack" style={{ maxWidth: '26rem' }}>
          <Row>
            <Skeleton shape="circle" width="40px" height="40px" />
            <Skeleton width="8rem" />
            <Skeleton shape="pill" width="5rem" height="20px" />
          </Row>
          <SkeletonText lines={4} />
        </div>
      </Specimen>

      <Specimen label="Empty states">
        <Row>
          <EmptyState
            icon="⌕"
            title="No tasks match"
            description="Try another view, or clear the filters carried in from the dashboard."
            action={<Button variant="primary">Clear filters</Button>}
          />
          <EmptyState
            size="sm"
            title="Nothing logged yet"
            description="Work appears here once somebody logs time."
          />
        </Row>
      </Specimen>
    </Section>
  );
}
