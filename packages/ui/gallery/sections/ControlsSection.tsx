import { useState } from 'react';

import { Button, type ButtonVariant } from '../../src/components/button/Button';
import { DropdownMenu } from '../../src/components/menu/DropdownMenu';
import { SegmentedControl, Tabs } from '../../src/components/tabs/Tabs';
import { Switch } from '../../src/components/switch/Switch';
import { Tooltip } from '../../src/components/tooltip/Tooltip';
import { Row, Section, Specimen } from '../Specimen';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'accent', 'danger', 'ghost'];

export function ControlsSection() {
  const [tab, setTab] = useState('overview');
  const [layout, setLayout] = useState('board');
  const [clientVisible, setClientVisible] = useState(true);

  return (
    <Section
      id="controls"
      title="Controls"
      summary="Tab into any of these: the tab strip and the segmented control are one stop each, and the arrow keys move within them."
    >
      <Specimen label="Button variants">
        <Row>
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </Row>
      </Specimen>

      <Specimen label="Button sizes">
        <Row>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg" variant="primary">
            Large
          </Button>
          <Button iconOnly aria-label="Clear search">
            ×
          </Button>
        </Row>
      </Specimen>

      <Specimen label="Button states">
        <Row>
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button disabled>Disabled</Button>
          <Button disabled disabledReason="Only the assignee can start this task">
            Start work
          </Button>
          <Button variant="primary" leading="＋">
            Create task
          </Button>
        </Row>
      </Specimen>

      <Specimen label="Full width">
        <Button variant="primary" fullWidth>
          Submit for review
        </Button>
      </Specimen>

      <Specimen label="Tabs">
        <Tabs
          aria-label="Dashboard view"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'overview', label: 'Overview' },
            { key: 'operations', label: 'Operations', count: 12 },
            { key: 'reports', label: 'Reports' },
          ]}
        />
      </Specimen>

      <Specimen label="Segmented control">
        <Row>
          <SegmentedControl
            aria-label="Layout"
            value={layout}
            onChange={setLayout}
            options={[
              { key: 'board', label: 'Board' },
              { key: 'list', label: 'List', count: 34 },
            ]}
          />
          <SegmentedControl
            aria-label="Layout, small"
            size="sm"
            value={layout}
            onChange={setLayout}
            options={[
              { key: 'board', label: 'Board' },
              { key: 'list', label: 'List' },
            ]}
          />
        </Row>
      </Specimen>

      <Specimen label="Switch">
        <div className="stack">
          <Switch
            checked={clientVisible}
            onChange={setClientVisible}
            tone="success"
            label="Client-visible"
            description="The client will read this on their portal."
          />
          <Switch checked={false} onChange={() => {}} label="Disabled, off" disabled />
        </div>
      </Specimen>

      <Specimen label="Dropdown menu — arrows move, Escape closes and returns focus">
        <DropdownMenu
          trigger="AL"
          triggerLabel="Account menu for Ada Lovelace"
          header={
            <>
              <strong>Ada Lovelace</strong>
              <span>Team lead</span>
            </>
          }
          items={[
            { key: 'profile', label: 'Profile & password', href: '#profile' },
            { key: 'prefs', label: 'Preferences', disabled: true },
            { key: 'sign-out', label: 'Sign out', danger: true, onSelect: () => {} },
          ]}
        />
      </Specimen>

      <Specimen label="Tooltip — opens on focus, not only on hover">
        <Tooltip content="Reviewed by the project's team lead before it reaches the client">
          <Button>What is a review?</Button>
        </Tooltip>
      </Specimen>
    </Section>
  );
}
