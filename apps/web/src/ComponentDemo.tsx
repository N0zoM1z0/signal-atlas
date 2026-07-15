import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  IconButton,
  Panel,
  Progress,
  Tabs,
  Tooltip,
  type TabDefinition,
} from '@signal-atlas/ui';

const evidenceTabs: readonly TabDefinition[] = [
  {
    id: 'new',
    label: 'New 3',
    panel: 'Fresh signals wait here until the expedition team inspects them.',
  },
  {
    id: 'pinned',
    label: 'Pinned 2',
    panel: 'Pinned evidence remains close to the forecast desk.',
  },
  {
    id: 'disputed',
    label: 'Disputed 1',
    panel: 'Disputed claims keep their sources and visible challenge state.',
  },
];

export function ComponentDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  return (
    <main className="component-demo" data-contrast={highContrast ? 'high' : undefined}>
      <header className="demo-masthead">
        <div>
          <p className="sa-eyebrow">Foundation · P0-002</p>
          <h1>Cozy intelligence primitives</h1>
          <p>
            Editorial controls for a living forecasting world, generated from the canonical design
            tokens.
          </p>
        </div>
        <div className="demo-masthead__actions">
          <Badge tone="success">● Fixture ready</Badge>
          <Button onClick={() => setHighContrast((value) => !value)} variant="secondary">
            {highContrast ? 'Standard contrast' : 'High contrast'}
          </Button>
        </div>
      </header>

      <div className="component-grid">
        <Panel
          actions={
            <Tooltip content="This action has a visible and programmatic name.">
              <IconButton accessibleLabel="Open panel menu">•••</IconButton>
            </Tooltip>
          }
          className="demo-panel demo-panel--controls"
          eyebrow="Command desk"
          title="Actions and states"
        >
          <div className="demo-row">
            <Button>Dispatch agent</Button>
            <Button variant="secondary">Inspect source</Button>
            <Button variant="quiet">Hold</Button>
            <Button disabled>Unavailable</Button>
          </div>
          <div className="demo-row" aria-label="Signal direction examples">
            <Badge tone="yes">↑ YES support</Badge>
            <Badge tone="no">↓ NO support</Badge>
            <Badge tone="context">◇ Context</Badge>
            <Badge tone="disputed">△ Disputed</Badge>
          </div>
          <Progress label="Field scout · evidence investigation" value={68} />
          <Button onClick={() => setDialogOpen(true)} variant="primary">
            Open evidence dialog
          </Button>
        </Panel>

        <Panel className="demo-panel" eyebrow="Evidence stream" title="Signal cards">
          <div className="demo-card-stack">
            <Card eyebrow="Official primary · 2m" title="Crosswind advisory overlaps launch window">
              Fresh local guidance raises delay risk for the opening part of the next window.
            </Card>
            <Card eyebrow="Archive · timeless" title="Comparable windows often slipped">
              Eight of twenty archived cases were delayed under overlapping crosswind advisories.
            </Card>
          </div>
        </Panel>

        <Panel className="demo-panel demo-panel--tabs" eyebrow="Evidence filters" title="Tabs">
          <Tabs ariaLabel="Signal categories" tabs={evidenceTabs} />
        </Panel>
      </div>

      <Dialog
        description="The dialog exposes a clear title, description, close action, and Escape behavior."
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title="Inspect provenance"
      >
        <Card eyebrow="Pref fixture" title="Coastal Conditions Advisory 18:10Z">
          Source facts remain visually separate from agent interpretation.
        </Card>
        <div className="demo-dialog-actions">
          <Button onClick={() => setDialogOpen(false)} variant="secondary">
            Back to world
          </Button>
          <Button onClick={() => setDialogOpen(false)}>Pin to case file</Button>
        </div>
      </Dialog>
    </main>
  );
}
