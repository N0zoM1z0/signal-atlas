import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createHelios3ExpeditionFixture,
  createNorthlightHarborExpeditionFixture,
} from '@signal-atlas/test-fixtures';
import { replayFixture } from '@signal-atlas/simulation';

import { App } from './App.js';
import { ExpeditionLobby } from './ExpeditionLobby.js';
import type { ExpeditionListItem, ScenarioListItem } from './world-shell/runtime-client.js';

describe('Signal Atlas world shell', () => {
  it('renders the five fixture-backed application regions in logical order', () => {
    const projection = replayFixture(createHelios3ExpeditionFixture()).projection;
    const markup = renderToStaticMarkup(<App initialProjection={projection} />);

    expect(markup).toContain('Signal Atlas');
    expect(markup).toContain('Will the Helios-3 mission launch before September 30?');
    expect(markup).toContain('aria-label="Agents"');
    expect(markup).toContain('aria-label="Interactive world stage"');
    expect(markup).toContain('aria-label="Signals"');
    expect(markup).toContain('aria-label="Agent command desk"');
    expect(markup).toContain('Evidence will remain source-linked when it arrives.');
    expect(markup).toContain('Check current conditions at Galehaven Weather Tower');
    expect(markup).toContain('aria-label="Open Expedition Lobby"');
  });

  it('renders the semantic expedition lobby with a durable saved-world card', () => {
    const scenario: ScenarioListItem = {
      id: 'helios-3-launch-window',
      version: 1,
      title: 'Helios-3 Launch Window',
      category: 'science_technology',
      summary: 'Investigate a fictional launch window with explicit provenance.',
      mode: 'fixture',
      requiredCapabilities: ['local_conditions', 'search_sources'],
      availabilityPolicy: 'live_optional',
      primaryOutcomeId: 'yes',
      preview: {
        template: 'science-space-launch',
        assetPack: 'helios3-programmatic-pilot-v1',
        regionLabel: 'Meridian Coast',
        tagline: 'Separate launch evidence from correlated reports.',
      },
      authoredExpeditionId: 'exp-helios3-demo',
      definitionHash: 'sha256:test',
      definitionSchemaVersion: 1,
      available: true,
      availabilityReason: 'Offline fixture installed; live capabilities are optional.',
    };
    const expedition: ExpeditionListItem = {
      id: 'exp-helios3-demo',
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      definitionHash: scenario.definitionHash,
      latestSequence: 42,
      marketQuestion: 'Will the Helios-3 mission launch before September 30?',
      status: 'paused',
      title: scenario.title,
      createdAt: '2027-09-26T18:00:00Z',
    };
    const markup = renderToStaticMarkup(
      <ExpeditionLobby
        expeditions={[expedition]}
        onCreate={() => undefined}
        onOpen={() => undefined}
        onRetry={() => undefined}
        scenarios={[scenario]}
      />,
    );

    expect(markup).toContain('Signal Atlas Expeditions');
    expect(markup).toContain('Available expeditions');
    expect(markup).toContain('Sequence 42');
    expect(markup).toContain('Enter Helios-3 Launch Window');
    expect(markup).toContain('No real trading path is enabled.');
  });

  it('renders Northlight as a distinct harbor world without Helios copy leakage', () => {
    const projection = replayFixture(createNorthlightHarborExpeditionFixture()).projection;
    const markup = renderToStaticMarkup(<App initialProjection={projection} />);

    expect(markup).toContain(
      'Will Northlight Harbor suspend outbound traffic before 18:00 UTC on November 12?',
    );
    expect(markup).toContain('Northlight Watch House');
    expect(markup).toContain('Gullwing Signal Station');
    expect(markup).toContain('Outer Breakwater Control');
    expect(markup).toContain('Tern');
    expect(markup).toContain('Cora');
    expect(markup).toContain('Brin');
    expect(markup).not.toMatch(/Helios|Galehaven|Meridian Coast|launch/iu);
  });
});
