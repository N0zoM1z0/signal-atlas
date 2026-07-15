import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { shellModel } from './model.js';
import { OnboardingGuide } from './OnboardingGuide.js';

describe('first expedition guide', () => {
  it('names the complete evidence-to-forecast journey without blocking controls', () => {
    const markup = renderToStaticMarkup(
      <OnboardingGuide
        inspectedSignalId={undefined}
        onOpenArchive={() => undefined}
        onOpenForecast={() => undefined}
        onOpenSignals={() => undefined}
        onSelectMira={() => undefined}
        projection={shellModel.projection}
        selectedAgentId="mira"
      />,
    );
    expect(markup).toContain('Select Mira, the field scout.');
    expect(markup).toContain('Send Mira to the Weather Tower.');
    expect(markup).toContain('Inspect Mira’s source-linked signal.');
    expect(markup).toContain('Send Orin to search Archive Quarter.');
    expect(markup).toContain('Commit a revised forecast with both signals.');
    expect(markup).toContain('Skip first expedition guide');
  });
});
