import type { FileSummary } from '@ashniva/types';
import { Button, FormField, Input, Modal, SegmentedControl, Switch, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { FileList } from '../../files/components/FileList';
import { useTaskMutations } from '../api';
import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import type { ModalProps } from './TaskModals';

const TIME_PRESETS = [
  { key: '30', label: '30m' },
  { key: '60', label: '1h' },
  { key: '120', label: '2h' },
  { key: '240', label: '4h' },
  { key: '480', label: '1d' },
];

/** The four-question completion sheet: what, how long, proof, client-visible. */
export function SubmitTaskModal({ open, task, onClose }: ModalProps) {
  const [summary, setSummary] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [gitRef, setGitRef] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [clientVisible, setClientVisible] = useState(task.clientVisible);
  const [clientSummary, setClientSummary] = useState('');
  const [files, setFiles] = useState<FileSummary[]>([]);
  const { submit } = useTaskMutations(task.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const hasClient = Boolean(task.clientOrganization);
  const valid = summary.trim().length >= 3 && Number(minutes) > 0;
  return (
    <Modal
      open={open}
      title="Submit for review"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={submit.isPending}
            disabled={!valid}
            disabledReason="Say what you completed and how long it took"
            onClick={() =>
              void wrap(() =>
                submit.mutateAsync({
                  summary: summary.trim(),
                  minutes: Number(minutes),
                  gitRef: gitRef || undefined,
                  proofUrl: proofUrl || undefined,
                  clientVisible,
                  clientSummary:
                    clientVisible && clientSummary.trim() ? clientSummary.trim() : undefined,
                  fileIds: files.map((file) => file.id),
                }),
              )()
            }
          >
            Submit
          </Button>
        </>
      }
    >
      <FormField label="1. What did you complete?" required>
        <Textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </FormField>
      <div className="segmented-field">
        <span className="segmented-field__label">2. Time spent</span>
        <SegmentedControl
          aria-label="Time spent"
          size="sm"
          value={TIME_PRESETS.some((preset) => preset.key === minutes) ? minutes : 'custom'}
          onChange={(key) => setMinutes(key === 'custom' ? '' : key)}
          options={[...TIME_PRESETS, { key: 'custom', label: 'Other' }]}
        />
        <Input
          type="number"
          min={1}
          max={1440}
          aria-label="Minutes"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          style={{ maxWidth: 140 }}
        />
      </div>
      <FormField label="3. Proof (optional)" hint="A branch, commit or pull request">
        <Input
          value={gitRef}
          onChange={(event) => setGitRef(event.target.value)}
          placeholder="feature/login or PR #42"
        />
      </FormField>
      <FormField label="Link (optional)">
        <Input
          type="url"
          value={proofUrl}
          onChange={(event) => setProofUrl(event.target.value)}
          placeholder="https://staging.example.com/…"
        />
      </FormField>
      <FileList
        files={files}
        parent={{ taskId: task.id }}
        canUpload
        onUploaded={(file) => setFiles((current) => [...current, file])}
      />
      <Switch
        tone="success"
        checked={clientVisible}
        onChange={setClientVisible}
        disabled={!hasClient}
        label="4. Client-visible"
        description={
          hasClient
            ? 'On approval, an update is queued for the client'
            : 'Internal project — nothing goes to a client'
        }
      />
      {clientVisible && hasClient ? (
        <FormField
          label="Client will read"
          hint="Plain language; leave empty to reuse your summary"
        >
          <Textarea
            rows={2}
            value={clientSummary}
            onChange={(event) => setClientSummary(event.target.value)}
          />
        </FormField>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
