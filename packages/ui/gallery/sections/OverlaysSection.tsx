import { useState } from 'react';

import { Breadcrumbs } from '../../src/components/breadcrumbs/Breadcrumbs';
import { Button } from '../../src/components/button/Button';
import { Drawer } from '../../src/components/drawer/Drawer';
import { FormField } from '../../src/components/form/FormField';
import { Input } from '../../src/components/form/Input';
import { Modal } from '../../src/components/modal/Modal';
import { PageHeader } from '../../src/components/page-header/PageHeader';
import { FilterChip, Toolbar, ToolbarSpacer } from '../../src/components/toolbar/Toolbar';
import { Section, Specimen } from '../Specimen';

export function OverlaysSection() {
  const [modal, setModal] = useState<'none' | 'md' | 'sm'>('none');
  const [drawer, setDrawer] = useState<'none' | 'end' | 'start'>('none');
  const [chips, setChips] = useState(['Overdue only', 'Project: Apollo', 'Priority: High']);

  return (
    <Section
      id="overlays"
      title="Page furniture and overlays"
      summary="Open a dialog and press Tab: focus stays inside it, Escape closes it, and focus lands back on the button that opened it."
    >
      <Specimen label="Page header with breadcrumbs, actions and a filter row">
        <PageHeader
          breadcrumbs={[
            { key: 'tasks', label: 'Tasks', href: '#tasks' },
            { key: 'current', label: 'ACM-412' },
          ]}
          title="Migrate the billing importer"
          subtitle="34 tasks · showing the first 25"
          actions={<Button variant="primary">Create task</Button>}
        >
          <Toolbar aria-label="Task filters">
            <Button size="sm">All projects</Button>
            <Button size="sm">Any priority</Button>
            <ToolbarSpacer />
            <Button size="sm" variant="ghost">
              Reset
            </Button>
          </Toolbar>
        </PageHeader>
      </Specimen>

      <Specimen label="Breadcrumbs on their own">
        <Breadcrumbs
          items={[
            { key: 'projects', label: 'Projects', href: '#projects' },
            { key: 'apollo', label: 'Apollo', href: '#apollo' },
            { key: 'current', label: 'Milestone 3' },
          ]}
        />
      </Specimen>

      <Specimen label="Filter chips — the text is text, the × is a named button">
        <Toolbar aria-label="Active filters">
          {chips.map((chip) => (
            <FilterChip
              key={chip}
              label={chip}
              onRemove={() => setChips((current) => current.filter((entry) => entry !== chip))}
            />
          ))}
          {chips.length === 0 ? <span className="muted">No active filters</span> : null}
        </Toolbar>
      </Specimen>

      <Specimen label="Modal">
        <div className="specimen-row">
          <Button onClick={() => setModal('md')}>Open dialog</Button>
          <Button onClick={() => setModal('sm')}>Open small dialog</Button>
        </div>
        <Modal
          open={modal !== 'none'}
          size={modal === 'sm' ? 'sm' : 'md'}
          title="Submit for review"
          description="Your reviewer sees the description and the time you logged."
          onClose={() => setModal('none')}
          footer={
            <>
              <Button onClick={() => setModal('none')}>Cancel</Button>
              <Button variant="primary" onClick={() => setModal('none')}>
                Submit
              </Button>
            </>
          }
        >
          <FormField label="What changed" required hint="One line is enough">
            <Input placeholder="e.g. Importer now reads from the queue" />
          </FormField>
        </Modal>
      </Specimen>

      <Specimen label="Drawer">
        <div className="specimen-row">
          <Button onClick={() => setDrawer('end')}>Open side panel</Button>
          <Button onClick={() => setDrawer('start')}>Open from the left</Button>
        </div>
        <Drawer
          open={drawer !== 'none'}
          side={drawer === 'start' ? 'start' : 'end'}
          title="Filters"
          onClose={() => setDrawer('none')}
          footer={
            <>
              <Button onClick={() => setDrawer('none')}>Cancel</Button>
              <Button variant="primary" onClick={() => setDrawer('none')}>
                Apply
              </Button>
            </>
          }
        >
          <FormField label="Search">
            <Input type="search" placeholder="Search tasks…" />
          </FormField>
          <FormField label="Owner">
            <Input placeholder="Anyone" />
          </FormField>
        </Drawer>
      </Specimen>
    </Section>
  );
}
