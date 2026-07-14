import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('Signal Atlas bootstrap shell', () => {
  it('communicates the product identity and fixture expedition', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Signal Atlas');
    expect(markup).toContain('Walk the world. Gather the signal. Price the future.');
    expect(markup).toContain('Helios-3 expedition');
  });
});
