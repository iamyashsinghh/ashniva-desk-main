import { type AddWorkPlanWorkInput, type Priority, type ProjectWorkPlan } from '@ashniva/types';
import { Button, FormField, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { WorkPlanAssigneeSelect, WorkPlanPrioritySelect } from './WorkPlanAssigneeSelect';

/**
 * Summary add-on: type the extra work, pick a developer and priority. AI reads the plan and
 * places related steps and times in the right phase — or opens a new one.
 */
export function WorkPlanAddWorkPanel({
  plan,
  busy,
  onAdd,
}: {
  plan: ProjectWorkPlan;
  busy: boolean;
  onAdd: (input: AddWorkPlanWorkInput) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [assignedToId, setAssignedToId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const ready = prompt.trim().length >= 8;

  return (
    <div className="work-plan__add-work">
      <div className="work-plan__upload-copy">
        <strong>Add work with AI</strong>
        <span>
          Describe the extra work. AI reads this summary, picks the right phase (or opens a new
          one), and fills related steps and times. You pick the developer and priority.
        </span>
      </div>
      <div className="work-plan__add-work-fields">
        <div className="work-plan__assign-row">
          <WorkPlanAssigneeSelect
            label="Developer"
            hint="Optional. Leave unassigned if the whole project already has someone."
            developers={plan.developers}
            value={assignedToId}
            inherited={plan.assignedTo}
            canAssign
            busy={busy}
            onAssign={setAssignedToId}
          />
          <WorkPlanPrioritySelect
            value={priority}
            inherited={plan.priority}
            allowEmpty
            canAssign
            busy={busy}
            onChange={setPriority}
          />
        </div>
        <FormField
          label="What should we add?"
          hint="Example: OTP login, session timeout and a forgot-password email."
        >
          <Textarea
            rows={3}
            value={prompt}
            disabled={busy}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </FormField>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!ready}
          disabledReason="Write at least a short description of the work."
          onClick={() => {
            void onAdd({
              prompt: prompt.trim(),
              assignedToId,
              priority,
            }).then(() => setPrompt(''));
          }}
        >
          Add with AI
        </Button>
      </div>
    </div>
  );
}
