import type { WorldProjection } from '@signal-atlas/simulation';
import { useState } from 'react';

export interface OnboardingGuideProps {
  inspectedSignalId: string | undefined;
  onOpenArchive: () => void;
  onOpenForecast: () => void;
  onOpenSignals: () => void;
  onSelectMira: () => void;
  projection: WorldProjection;
  selectedAgentId: string;
}

const storageKey = 'signal-atlas:onboarding-dismissed';

function initiallyOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(storageKey) !== 'true';
  } catch {
    return true;
  }
}

function persistDismissal(): void {
  try {
    window.localStorage.setItem(storageKey, 'true');
  } catch {
    // Storage may be unavailable in privacy-restricted contexts; dismissal still works in memory.
  }
}

export function OnboardingGuide({
  inspectedSignalId,
  onOpenArchive,
  onOpenForecast,
  onOpenSignals,
  onSelectMira,
  projection,
  selectedAgentId,
}: OnboardingGuideProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const weatherSignal = Object.values(projection.signalsById).find((signal) =>
    signal.sourceIds.some(
      (sourceId) => projection.sourcesById[sourceId]?.location?.placeId === 'weather-tower',
    ),
  );
  const archiveSignal = Object.values(projection.signalsById).find((signal) =>
    signal.sourceIds.some((sourceId) => {
      const source = projection.sourcesById[sourceId];
      return source?.location?.placeId === 'archive' || source?.tags.includes('historical');
    }),
  );
  const revisedForecast = [...projection.forecasts]
    .reverse()
    .find((forecast) => forecast.actor.kind === 'player' && forecast.evidenceSignalIds.length >= 2);
  const steps = [
    { done: selectedAgentId === 'mira', label: 'Select Mira, the field scout.' },
    { done: Boolean(weatherSignal), label: 'Send Mira to the Weather Tower.' },
    {
      done: Boolean(weatherSignal && inspectedSignalId === weatherSignal.id),
      label: 'Inspect Mira’s source-linked signal.',
    },
    { done: Boolean(archiveSignal), label: 'Send Orin to search Archive Quarter.' },
    {
      done: Boolean(revisedForecast),
      label: 'Commit a revised forecast with both signals.',
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  if (!open) {
    return (
      <button className="atlas-guide-reopen" onClick={() => setOpen(true)} type="button">
        Guide · {completed}/5
      </button>
    );
  }

  return (
    <aside className="atlas-onboarding" aria-label="First expedition guide">
      <header>
        <div>
          <span className="atlas-kicker">First expedition</span>
          <strong>Follow evidence to a forecast</strong>
        </div>
        <button
          aria-label="Skip first expedition guide"
          onClick={() => {
            persistDismissal();
            setOpen(false);
          }}
          type="button"
        >
          Skip
        </button>
      </header>
      <ol>
        {steps.map((step, index) => (
          <li data-complete={step.done} key={step.label}>
            <span aria-hidden="true">{step.done ? '✓' : index + 1}</span>
            {step.label}
          </li>
        ))}
      </ol>
      <div>
        <button onClick={onSelectMira} type="button">
          Select Mira
        </button>
        <button onClick={onOpenSignals} type="button">
          Signals
        </button>
        <button onClick={onOpenArchive} type="button">
          Archive
        </button>
        <button onClick={onOpenForecast} type="button">
          Forecast
        </button>
      </div>
    </aside>
  );
}
