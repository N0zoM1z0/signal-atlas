import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('Signal Atlas world shell', () => {
  it('renders the five fixture-backed application regions in logical order', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Signal Atlas');
    expect(markup).toContain('Will the Helios-3 mission launch before September 30?');
    expect(markup).toContain('aria-label="Agents"');
    expect(markup).toContain('aria-label="Interactive world stage"');
    expect(markup).toContain('aria-label="Signals"');
    expect(markup).toContain('aria-label="Agent command desk"');
    expect(markup).toContain('Evidence will remain source-linked when it arrives.');
    expect(markup).toContain('Check latest weather at Galehaven Weather Tower');
  });
});
