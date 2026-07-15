import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createHelios3ExpeditionFixture } from '@signal-atlas/test-fixtures';
import { replayFixture } from '@signal-atlas/simulation';

import { OnboardingGuide } from './OnboardingGuide.js';

const projection = replayFixture(createHelios3ExpeditionFixture()).projection;

describe('first expedition guide', () => {
  it('names the complete evidence-to-forecast journey without blocking controls', () => {
    const markup = renderToStaticMarkup(
      <OnboardingGuide
        inspectedSignalId={undefined}
        onOpenArchive={() => undefined}
        onOpenForecast={() => undefined}
        onOpenSignals={() => undefined}
        onPrepareMission={() => undefined}
        onSelectGuideAgent={() => undefined}
        projection={projection}
        seenSignalIds={[]}
        selectedAgentId="mira"
      />,
    );
    expect(markup).toContain('Select Mira for field research.');
    expect(markup).toContain('Send Mira to investigate Galehaven Weather Tower.');
    expect(markup).toContain('Inspect Mira’s source-linked signal.');
    expect(markup).toContain('Send Orin to search Archive Quarter.');
    expect(markup).toContain('Commit a revised forecast with both signals.');
    expect(markup).toContain('Skip first expedition guide');
  });
});
