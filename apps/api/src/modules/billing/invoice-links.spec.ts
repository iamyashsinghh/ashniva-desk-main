import { BadRequestException } from '@nestjs/common';

import { assertInvoiceLinks } from './invoice-links';

const ORG = 'org-1';
const CLIENT = 'client-a';

type Finder = jest.Mock<Promise<{ id: string } | null>, [unknown]>;

/** A reader whose tables each answer with the row, or nothing when the filter does not match. */
function reader(found: {
  project?: boolean;
  contract?: boolean;
  milestone?: boolean;
  cr?: boolean;
}) {
  const table = (hit = true): { findFirst: Finder } => ({
    findFirst: jest.fn((_args: unknown) => Promise.resolve(hit ? { id: 'row' } : null)),
  });
  return {
    project: table(found.project),
    contract: table(found.contract),
    milestone: table(found.milestone),
    changeRequest: table(found.cr),
  };
}

describe('assertInvoiceLinks', () => {
  it('accepts an invoice with no links without reading anything', async () => {
    const prisma = reader({});
    await expect(assertInvoiceLinks(prisma as never, ORG, CLIENT, {})).resolves.toBeUndefined();
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it('asks for each link within this provider and this client', async () => {
    const prisma = reader({});
    await assertInvoiceLinks(prisma as never, ORG, CLIENT, {
      projectId: 'p1',
      contractId: 'c1',
      milestoneId: 'm1',
      changeRequestId: 'cr1',
    });

    const live = { organizationId: ORG, deletedAt: null };
    expect(prisma.project.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { ...live, id: 'p1', clientOrganizationId: CLIENT },
    });
    expect(prisma.contract.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { ...live, id: 'c1', clientOrganizationId: CLIENT },
    });
    // A milestone has no client column, so it is judged by the project it sits under.
    expect(prisma.milestone.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { ...live, id: 'm1', project: { clientOrganizationId: CLIENT } },
    });
    expect(prisma.changeRequest.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { ...live, id: 'cr1', clientOrganizationId: CLIENT },
    });
  });

  it.each([
    ['project', { project: false }, { projectId: 'p1' }],
    ['contract', { contract: false }, { contractId: 'c1' }],
    ['milestone', { milestone: false }, { milestoneId: 'm1' }],
    ['change request', { cr: false }, { changeRequestId: 'cr1' }],
  ])("refuses another client's %s", async (kind, found, links) => {
    const attempt = assertInvoiceLinks(reader(found) as never, ORG, CLIENT, links);
    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toThrow(`That ${kind} does not belong to this invoice's client`);
  });

  it('treats a cleared project as no link', async () => {
    const prisma = reader({ project: false });
    await expect(
      assertInvoiceLinks(prisma as never, ORG, CLIENT, { projectId: '' }),
    ).resolves.toBeUndefined();
  });
});
