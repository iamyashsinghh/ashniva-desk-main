import {
  PERMISSIONS,
  PRIORITY,
  PRIORITY_LABELS,
  TICKET_TYPE,
  TICKET_TYPE_LABELS,
  type FileSummary,
  type Priority,
  type TicketType,
} from '@ashniva/types';
import {
  Alert,
  Button,
  Card,
  FieldGroup,
  FormActions,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
} from '@ashniva/ui';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { errorMessage } from '../../../shared/lib/api-client';
import { isClientSession, useCurrentUser, usePermission } from '../../auth/session-context';
import { FileList } from '../../files/components/FileList';
import { useProjectsQuery } from '../../projects/api';
import { usePortalProjectsQuery, usePortalTicketMutations } from '../../portal/api';
import { useOrganizationsQuery } from '../../users/api';
import { useTicketMutations, type CreateTicketInput } from '../api';

const MORE_DETAILS_ID = 'create-ticket-more-details';
const PRIORITIES = Object.values(PRIORITY);
const TYPES = Object.values(TICKET_TYPE);

/**
 * Raise a ticket — the same form for clients (portal), employees and support staff raising on a
 * client's behalf. Essentials first, "More details" folded away, as in the approved modal.
 */
export function CreateTicketPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const isClient = isClientSession(user);
  const isInternalStaff = user.organization.isServiceProvider && !isClient;
  const canReadProjects = usePermission(PERMISSIONS.PROJECT_READ);
  // Only the lists this person may read: employees pick no project, clients use the portal list.
  const internalProjects = useProjectsQuery(
    { status: 'ACTIVE' },
    isInternalStaff && canReadProjects,
  );
  const portalProjects = usePortalProjectsQuery(isClient);
  const organizations = useOrganizationsQuery(isInternalStaff);
  const internal = useTicketMutations();
  const portal = usePortalTicketMutations();

  const [form, setForm] = useState<CreateTicketInput>({
    title: '',
    description: '',
    type: TICKET_TYPE.SUPPORT,
    priority: PRIORITY.MEDIUM,
  });
  const [more, setMore] = useState(false);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});

  const set = <TKey extends keyof CreateTicketInput>(key: TKey, value: CreateTicketInput[TKey]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const projectOptions = isClient
    ? (portalProjects.data ?? []).map((project) => ({ value: project.id, label: project.name }))
    : (internalProjects.data ?? [])
        .filter(
          (project) =>
            !form.clientOrganizationId ||
            project.clientOrganization?.id === form.clientOrganizationId,
        )
        .map((project) => ({
          value: project.id,
          label: `${project.name}${project.clientOrganization ? ` · ${project.clientOrganization.name}` : ''}`,
        }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: typeof fieldErrors = {};
    if (form.title.trim().length < 3) nextErrors.title = 'Give the ticket a short title';
    if (form.description.trim().length < 3) nextErrors.description = 'Describe what is happening';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setError(undefined);
    const body: CreateTicketInput = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      projectId: form.projectId || undefined,
      clientOrganizationId: form.clientOrganizationId || undefined,
      module: form.module?.trim() || undefined,
      impact: form.impact?.trim() || undefined,
      fileIds: files.map((file) => file.id),
    };
    try {
      if (isClient) {
        const created = await portal.raise.mutateAsync(body);
        void navigate(`/portal/tickets/${created.id}`);
      } else {
        const created = await internal.create.mutateAsync(body);
        void navigate(`/tickets/${created.id}`);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  const pending = internal.create.isPending || portal.raise.isPending;
  return (
    <form className="detail-page" onSubmit={(event) => void submit(event)} noValidate>
      <PageHeader
        breadcrumbs={[
          { key: 'tickets', label: 'Tickets', href: isClient ? '/portal/tickets' : '/tickets' },
          { key: 'new', label: 'New' },
        ]}
        renderBreadcrumbLink={(href, children) => <Link to={href}>{children}</Link>}
        title="Raise a ticket"
        subtitle="Tell us what is wrong; the support desk picks it up from here."
      />
      <Card>
        <FormGrid>
          {isInternalStaff ? (
            <FormField label="On behalf of (company)" hint="Leave empty for an internal ticket">
              <Select
                value={form.clientOrganizationId ?? ''}
                onChange={(event) => set('clientOrganizationId', event.target.value)}
                options={[
                  { value: '', label: 'Our own organization' },
                  ...(organizations.data ?? [])
                    .filter((organization) => !organization.isServiceProvider)
                    .map((organization) => ({ value: organization.id, label: organization.name })),
                ]}
              />
            </FormField>
          ) : null}
          <FormField label="Project / product">
            <Select
              value={form.projectId ?? ''}
              onChange={(event) => set('projectId', event.target.value)}
              options={[{ value: '', label: 'Not sure / general' }, ...projectOptions]}
            />
          </FormField>
          <FormGridFull>
            <FormField label="Title" required error={fieldErrors.title}>
              <Input
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="Short summary of the problem"
              />
            </FormField>
          </FormGridFull>
          <FormGridFull>
            <FormField label="What is happening?" required error={fieldErrors.description}>
              <Textarea
                rows={5}
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
              />
            </FormField>
          </FormGridFull>
          <FieldGroup legend="Priority">
            <SegmentedControl
              aria-label="Priority"
              size="sm"
              value={form.priority ?? PRIORITY.MEDIUM}
              onChange={(value) => set('priority', value as Priority)}
              options={PRIORITIES.map((priority) => ({
                key: priority,
                label: PRIORITY_LABELS[priority],
              }))}
            />
          </FieldGroup>
          <FormField label="What can’t you do because of this?">
            <Input
              value={form.impact ?? ''}
              onChange={(event) => set('impact', event.target.value)}
            />
          </FormField>
          <FormGridFull>
            <FileList
              files={files}
              parent={{}}
              canUpload
              onUploaded={(file) => setFiles((current) => [...current, file])}
            />
          </FormGridFull>
        </FormGrid>
      </Card>
      {/*
        `aria-controls` as well as `aria-expanded`: the button says it opens something, and this is
        what says which something. The card is only mounted while open, so the id is only claimed
        while it exists.
      */}
      <Button
        variant="ghost"
        onClick={() => setMore((open) => !open)}
        aria-expanded={more}
        aria-controls={more ? MORE_DETAILS_ID : undefined}
      >
        {more ? 'Hide details' : 'More details'}
      </Button>
      {more ? (
        <Card id={MORE_DETAILS_ID} title="More details">
          <FormGrid>
            <FormField label="Type">
              <Select
                value={form.type ?? TICKET_TYPE.SUPPORT}
                onChange={(event) => set('type', event.target.value as TicketType)}
                options={TYPES.map((type) => ({ value: type, label: TICKET_TYPE_LABELS[type] }))}
              />
            </FormField>
            <FormField label="Module / screen">
              <Input
                value={form.module ?? ''}
                onChange={(event) => set('module', event.target.value)}
              />
            </FormField>
          </FormGrid>
        </Card>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <FormActions>
        <Button onClick={() => void navigate(-1)}>Cancel</Button>
        <Button type="submit" variant="primary" loading={pending}>
          Raise ticket
        </Button>
      </FormActions>
    </form>
  );
}
