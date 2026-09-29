import type { FileSummary } from '@ashniva/types';
import { Button } from '@ashniva/ui';

/** The files attached to the draft, each with a way to take it off again. */
export function ComposerFiles({
  files,
  onRemove,
}: {
  files: readonly Pick<FileSummary, 'id' | 'name'>[];
  onRemove: (fileId: string) => void;
}) {
  if (files.length === 0) {
    return null;
  }
  return (
    <ul className="chat-composer__files">
      {files.map((file) => (
        <li key={file.id}>
          <span className="chat-composer__file-name">{file.name}</span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(file.id)}
          >
            ×
          </Button>
        </li>
      ))}
    </ul>
  );
}
