import { Button, FormField, Input } from '@ashniva/ui';

import type { InvoiceLineInput } from '../api';

interface InvoiceLinesEditorProps {
  lines: InvoiceLineInput[];
  onChange: (lines: InvoiceLineInput[]) => void;
}

/**
 * The line items.
 *
 * Amounts stay strings the whole way through — typed as a string, sent as a string, calculated
 * as a decimal on the server. Nothing here parses a figure into a JavaScript number, which is
 * how a total ends up a paisa out.
 */
export function InvoiceLinesEditor({ lines, onChange }: InvoiceLinesEditorProps) {
  const set = (index: number, patch: Partial<InvoiceLineInput>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));

  const add = () =>
    onChange([
      ...lines,
      { description: '', hsnSac: '', quantity: '1', unit: 'Nos', unitPrice: '', taxRate: '18' },
    ]);

  const remove = (index: number) => onChange(lines.filter((_, position) => position !== index));

  return (
    <>
      {lines.map((line, index) => (
        <div key={index} className="form-grid">
          <FormField label={`Line ${index + 1}`} required>
            <Input
              value={line.description}
              placeholder="Managed support — September"
              onChange={(event) => set(index, { description: event.target.value })}
            />
          </FormField>
          <FormField label="HSN/SAC">
            <Input
              value={line.hsnSac ?? ''}
              placeholder="998314"
              onChange={(event) => set(index, { hsnSac: event.target.value })}
            />
          </FormField>
          <FormField label="Quantity" required>
            <Input
              value={line.quantity}
              inputMode="decimal"
              onChange={(event) => set(index, { quantity: event.target.value })}
            />
          </FormField>
          <FormField label="Unit">
            <Input
              value={line.unit ?? ''}
              placeholder="Nos"
              onChange={(event) => set(index, { unit: event.target.value })}
            />
          </FormField>
          <FormField label="Unit price" required>
            <Input
              value={line.unitPrice}
              inputMode="decimal"
              onChange={(event) => set(index, { unitPrice: event.target.value })}
            />
          </FormField>
          <FormField label="Discount %">
            <Input
              value={line.discountPercent ?? ''}
              inputMode="decimal"
              onChange={(event) => set(index, { discountPercent: event.target.value })}
            />
          </FormField>
          <FormField label="GST %" required>
            <Input
              value={line.taxRate ?? ''}
              inputMode="decimal"
              onChange={(event) => set(index, { taxRate: event.target.value })}
            />
          </FormField>
          {lines.length > 1 ? (
            <Button
              size="sm"
              variant="danger"
              aria-label={`Remove line ${index + 1}`}
              onClick={() => remove(index)}
            >
              Remove line
            </Button>
          ) : null}
        </div>
      ))}
      <div className="detail-actions">
        <Button onClick={add}>Add a line</Button>
      </div>
    </>
  );
}
