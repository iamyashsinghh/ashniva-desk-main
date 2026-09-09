import type { FileSummary } from '@ashniva/types';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { downloadFile } from '../api';

/** A file name that downloads through the API with the session's bearer token. */
export function FileLink({ file }: { file: Pick<FileSummary, 'id' | 'name'> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function download() {
    setBusy(true);
    setError(undefined);
    try {
      await downloadFile(file);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="link-button" disabled={busy} onClick={() => void download()}>
        {file.name}
      </button>
      {error ? (
        <span className="inline-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
