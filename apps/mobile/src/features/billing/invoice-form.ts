import type { InvoiceDetail, TaxTreatment } from '@ashniva/types';

import { todayIsoDate } from '../../shared/format/format';
import type { CalculateInput, InvoiceInput, InvoiceLineInput, InvoiceUpdate } from './billing-api';

/**
 * The invoice editor's state, and the rules that turn it into what the API takes.
 *
 * Amounts stay strings the whole way through — typed, held and sent as strings, calculated as a
 * decimal on the server. Nothing here parses a figure into a JavaScript number.
 */

export interface LineDraft {
  /** A stable id for the list, since two lines can read the same. Never sent. */
  key: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxRate: string;
}

export interface InvoiceForm {
  clientOrganizationId: string;
  projectId: string;
  contractId: string;
  issueDate: string;
  dueDate: string | null;
  placeOfSupplyState: string;
  placeOfSupplyCode: string;
  taxTreatment: TaxTreatment;
  reverseCharge: boolean;
  /**
   * An export or exempt draft made on the web. Not editable here, as the web editor does not offer
   * it either — but kept, so the preview of such a draft is not calculated as domestic GST.
   */
  supply: InvoiceDetail['supplyType'] | null;
  notes: string;
  internalNotes: string;
  lines: LineDraft[];
}

const STATE_CODE = /^\d{2}$/;
/** The API's own bounds; it has the final word, this only saves a round trip. */
const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/;
const PRICE = /^\d{1,12}(\.\d{1,4})?$/;
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `line-${keySeed}`;
}

/** The web editor's blank line: one unit, "Nos", at the profile's default rate. */
export function emptyLine(taxRate = '18'): LineDraft {
  return {
    key: nextKey(),
    description: '',
    hsnSac: '',
    quantity: '1',
    unit: 'Nos',
    unitPrice: '',
    discountPercent: '',
    discountAmount: '',
    taxRate,
  };
}

export function newInvoiceForm(defaults: {
  taxTreatment?: TaxTreatment;
  clientOrganizationId?: string;
}): InvoiceForm {
  return {
    clientOrganizationId: defaults.clientOrganizationId ?? '',
    projectId: '',
    contractId: '',
    issueDate: todayIsoDate(),
    // Left empty so the API applies the profile's payment terms, as the web editor does.
    dueDate: null,
    placeOfSupplyState: '',
    placeOfSupplyCode: '',
    taxTreatment: defaults.taxTreatment ?? 'EXCLUSIVE',
    reverseCharge: false,
    supply: null,
    notes: '',
    internalNotes: '',
    lines: [],
  };
}

/** A saved draft, back into the form. Zero discounts come back as empty fields, not `0.00`. */
export function formFromInvoice(invoice: InvoiceDetail): InvoiceForm {
  const blankIfZero = (value: string) => (/^0+(\.0+)?$/.test(value) ? '' : value);
  return {
    clientOrganizationId: invoice.clientOrganizationId,
    projectId: invoice.projectId ?? '',
    contractId: invoice.contractId ?? '',
    issueDate: invoice.issueDate.slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : null,
    placeOfSupplyState: invoice.placeOfSupplyState,
    placeOfSupplyCode: invoice.placeOfSupplyCode,
    taxTreatment: invoice.taxTreatment,
    reverseCharge: invoice.reverseCharge,
    supply: invoice.supplyType,
    notes: invoice.notes ?? '',
    internalNotes: invoice.internalNotes ?? '',
    lines: [...invoice.lineItems]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        key: nextKey(),
        description: line.description,
        hsnSac: line.hsnSac ?? '',
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        discountPercent: blankIfZero(line.discountPercent),
        discountAmount: blankIfZero(line.discountAmount),
        taxRate: line.taxRate,
      })),
  };
}

/** Why a line cannot be billed as it stands, or null when it can. */
export function lineProblem(line: LineDraft): string | null {
  if (!line.description.trim()) {
    return 'Needs a description';
  }
  if (!QUANTITY.test(line.quantity.trim()) || /^0+(\.0+)?$/.test(line.quantity.trim())) {
    return 'Quantity must be above zero, with up to three decimals';
  }
  if (!PRICE.test(line.unitPrice.trim())) {
    return 'Needs a price, with up to four decimals';
  }
  if (!RATE.test(line.taxRate.trim()) || Number(line.taxRate) > 100) {
    return 'GST must be between 0 and 100';
  }
  const percent = line.discountPercent.trim();
  if (percent && (!RATE.test(percent) || Number(percent) > 100)) {
    return 'Discount % must be between 0 and 100';
  }
  const amount = line.discountAmount.trim();
  if (amount && !PRICE.test(amount)) {
    return 'Discount amount must be a positive figure';
  }
  return null;
}

export function lineInput(line: LineDraft): InvoiceLineInput {
  const optional = (value: string) => value.trim() || undefined;
  return {
    description: line.description.trim(),
    hsnSac: optional(line.hsnSac),
    quantity: line.quantity.trim(),
    unit: optional(line.unit),
    unitPrice: line.unitPrice.trim(),
    discountPercent: optional(line.discountPercent),
    discountAmount: optional(line.discountAmount),
    taxRate: line.taxRate.trim(),
  };
}

/** Whether the server can calculate a preview yet: every line billable and a place of supply. */
export function canPreview(form: InvoiceForm): boolean {
  return (
    form.lines.length > 0 &&
    form.lines.every((line) => lineProblem(line) === null) &&
    STATE_CODE.test(form.placeOfSupplyCode)
  );
}

export function calculateInput(form: InvoiceForm): CalculateInput {
  return {
    lines: form.lines.map(lineInput),
    placeOfSupplyCode: form.placeOfSupplyCode,
    taxTreatment: form.taxTreatment,
    reverseCharge: form.reverseCharge,
    ...(form.supply === 'EXPORT' ? { isExport: true } : {}),
    ...(form.supply === 'EXEMPT' ? { isExempt: true } : {}),
  };
}

/** What stops the draft being saved, in the order somebody would fix it; null when it can be. */
export function formProblem(form: InvoiceForm): string | null {
  if (!form.clientOrganizationId) {
    return 'Choose a client';
  }
  if (!form.placeOfSupplyState.trim() || !STATE_CODE.test(form.placeOfSupplyCode)) {
    return 'Enter the place of supply and its two-digit state code';
  }
  if (form.lines.length === 0) {
    return 'Add at least one line';
  }
  if (form.lines.some((line) => lineProblem(line) !== null)) {
    return 'Every line needs a description and a price, or remove it';
  }
  if (form.dueDate && form.dueDate < form.issueDate) {
    return 'The due date cannot be before the issue date';
  }
  return null;
}

function shared(form: InvoiceForm): InvoiceUpdate {
  return {
    projectId: form.projectId || undefined,
    issueDate: form.issueDate,
    dueDate: form.dueDate ?? undefined,
    placeOfSupplyState: form.placeOfSupplyState.trim(),
    placeOfSupplyCode: form.placeOfSupplyCode,
    taxTreatment: form.taxTreatment,
    reverseCharge: form.reverseCharge,
    notes: form.notes.trim() || undefined,
    internalNotes: form.internalNotes.trim() || undefined,
    lines: form.lines.map(lineInput),
  };
}

export function createPayload(form: InvoiceForm): InvoiceInput {
  return {
    ...shared(form),
    clientOrganizationId: form.clientOrganizationId,
    contractId: form.contractId || undefined,
  };
}

/**
 * A draft's client and contract are fixed once it exists; the PATCH does not take them.
 *
 * The notes are sent even when empty, because on a PATCH an omitted field means "unchanged" and
 * clearing a note has to reach the server. A project cannot be taken off the same way — the API
 * validates `projectId` as a UUID and refuses the empty string — so it is only ever set.
 */
export function updatePayload(form: InvoiceForm): InvoiceUpdate {
  return { ...shared(form), notes: form.notes.trim(), internalNotes: form.internalNotes.trim() };
}
