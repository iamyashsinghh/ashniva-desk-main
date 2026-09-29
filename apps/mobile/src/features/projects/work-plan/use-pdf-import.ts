import { VISIBILITY, type ParseWorkPlanInput, type ProjectWorkPlan } from '@ashniva/types';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';

import { errorMessage } from '../../../shared/api/client';
import type { ApiMutation } from '../../../shared/api/mutations';
import { uploadAttachment, type PickedFile } from '../../../shared/attachments/attachments';

const PDF = 'application/pdf';

async function pickPdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: PDF, copyToCacheDirectory: true });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) {
    return null;
  }
  return {
    uri: asset.uri,
    name: asset.name,
    // Android can report a PDF from some providers as octet-stream; the picker was filtered to
    // PDFs, and the server checks the bytes before it parses anything.
    type: asset.mimeType && asset.mimeType !== 'application/octet-stream' ? asset.mimeType : PDF,
    sizeBytes: asset.size ?? null,
  };
}

/**
 * Upload a brief and let the server divide it into phases.
 *
 * Two requests, as on the web: the PDF goes to `POST /files` on the project (internal), then its
 * id to `POST /work-plan/parse`, which replaces the plan and answers with it. The server refuses
 * once anyone has started a step, so a PDF can never wipe running clocks.
 */
export function usePdfImport(
  projectId: string,
  parse: ApiMutation<ParseWorkPlanInput, ProjectWorkPlan>,
  onParsed: (plan: ProjectWorkPlan) => void,
) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const choose = async () => {
    setUploadError(null);
    let file: PickedFile | null;
    try {
      file = await pickPdf();
    } catch (cause) {
      setUploadError(errorMessage(cause));
      return;
    }
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadAttachment(file, { projectId }, VISIBILITY.INTERNAL);
      const plan = await parse.run({ fileId: uploaded.id });
      if (plan) {
        onParsed(plan);
      }
    } catch (cause) {
      setUploadError(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  };

  return {
    choose,
    busy: uploading || parse.busy,
    error: uploadError ?? parse.error,
  };
}
