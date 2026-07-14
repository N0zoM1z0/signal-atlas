import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Badge, Button, Card, Dialog, IconButton, Panel, Progress, Tabs, Tooltip } from '../src/index.js';

afterEach(cleanup);

describe('Signal Atlas UI primitives', () => {
  it('exposes buttons, icon actions, progress, cards, badges, and panels semantically', () => {
    render(
      <Panel title="Mission controls">
        <Button>Dispatch Mira</Button>
        <Tooltip content="Open source metadata">
          <IconButton accessibleLabel="Inspect source">i</IconButton>
        </Tooltip>
        <Progress label="Mission progress" value={68} />
        <Badge tone="no">NO support</Badge>
        <Card title="Crosswind advisory">Fresh official guidance.</Card>
      </Panel>,
    );

    expect(screen.getByRole('region', { name: 'Mission controls' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dispatch Mira' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inspect source' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Mission progress' })).toHaveProperty('value', 68);
    expect(screen.getByRole('article', { name: 'Crosswind advisory' }).textContent).toContain(
      'Fresh official guidance',
    );
    expect(screen.getByRole('tooltip').textContent).toContain('source metadata');
  });

  it('moves tab selection with arrow keys', async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        ariaLabel="Signal categories"
        tabs={[
          { id: 'new', label: 'New', panel: 'New signals' },
          { id: 'pinned', label: 'Pinned', panel: 'Pinned signals' },
          { id: 'all', label: 'All', panel: 'All signals' },
        ]}
      />,
    );

    const firstTab = screen.getByRole('tab', { name: 'New' });
    firstTab.focus();
    await user.keyboard('{ArrowRight}');

    const pinnedTab = screen.getByRole('tab', { name: 'Pinned' });
    expect(pinnedTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(pinnedTab);
    expect(screen.getByRole('tabpanel').textContent).toBe('Pinned signals');
  });

  it('closes a named dialog with Escape and restores application control', async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    render(
      <Dialog description="Evidence details" onClose={close} open title="Inspect provenance">
        Source record
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Inspect provenance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });

  it('supports an explicitly controlled dialog lifecycle', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open archive</Button>
          <Dialog onClose={() => setOpen(false)} open={open} title="Archive Quarter">
            Case files
          </Dialog>
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open archive' }));
    expect(screen.getByRole('dialog', { name: 'Archive Quarter' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
