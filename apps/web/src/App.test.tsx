import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { replayFixture } from '@signal-atlas/simulation';

import { App } from './App.js';

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
  });
});
