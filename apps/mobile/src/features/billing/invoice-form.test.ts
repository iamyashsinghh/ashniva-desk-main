import { invoiceDetail } from './billing-test-data';
import {
  createPayload,
  emptyLine,
  formFromInvoice,
  formProblem,
  lineProblem,
  newInvoiceForm,
  updatePayload,
} from './invoice-form';

/** The editor's rules: what blocks a save, and what each save sends. */

function billableLine() {
  return { ...emptyLine('18'), description: 'Support', unitPrice: '1000' };
}

describe('lineProblem', () => {
  it('accepts a described, priced line', () => {
    expect(lineProblem(billableLine())).toBeNull();
  });

  it('names what is missing or out of range', () => {
    expect(lineProblem({ ...billableLine(), description: ' ' })).toBe('Needs a description');
    expect(lineProblem({ ...billableLine(), quantity: '0' })).toMatch(/above zero/);
    expect(lineProblem({ ...billableLine(), unitPrice: '' })).toMatch(/price/);
    expect(lineProblem({ ...billableLine(), taxRate: '120' })).toMatch(/between 0 and 100/);
    expect(lineProblem({ ...billableLine(), discountPercent: '101' })).toMatch(/Discount %/);
  });
});

describe('formProblem', () => {
  it('asks for the client, then the place of supply, then a line', () => {
    const form = newInvoiceForm({});
    expect(formProblem(form)).toBe('Choose a client');
    expect(formProblem({ ...form, clientOrganizationId: 'c1' })).toMatch(/place of supply/);
    expect(
      formProblem({
        ...form,
        clientOrganizationId: 'c1',
        placeOfSupplyState: 'Karnataka',
        placeOfSupplyCode: '29',
      }),
    ).toBe('Add at least one line');
  });

  it('refuses a due date before the issue date', () => {
    const form = {
      ...newInvoiceForm({}),
      clientOrganizationId: 'c1',
      placeOfSupplyState: 'Karnataka',
      placeOfSupplyCode: '29',
      lines: [billableLine()],
      issueDate: '2026-09-10',
      dueDate: '2026-09-01',
    };
    expect(formProblem(form)).toMatch(/due date/);
  });
});

describe('payloads', () => {
  it('leaves empty optionals out of a new invoice', () => {
    const body = createPayload({
      ...newInvoiceForm({}),
      clientOrganizationId: 'c1',
      placeOfSupplyState: ' Karnataka ',
      placeOfSupplyCode: '29',
      lines: [billableLine()],
    });
    expect(body).not.toHaveProperty('projectId', expect.anything());
    expect(body.placeOfSupplyState).toBe('Karnataka');
    expect(body.lines[0]).toEqual({
      description: 'Support',
      hsnSac: undefined,
      quantity: '1',
      unit: 'Nos',
      unitPrice: '1000',
      discountPercent: undefined,
      discountAmount: undefined,
      taxRate: '18',
    });
  });

  it('round-trips a saved draft, and sends cleared notes on an edit', () => {
    const form = formFromInvoice(invoiceDetail({ status: 'DRAFT' }));
    expect(form.lines[0]?.discountPercent).toBe('');
    expect(form.dueDate).toBe('2026-10-01');

    const body = updatePayload({ ...form, notes: '' });
    expect(body).not.toHaveProperty('clientOrganizationId');
    expect(body).not.toHaveProperty('contractId');
    expect(body.notes).toBe('');
  });
});
