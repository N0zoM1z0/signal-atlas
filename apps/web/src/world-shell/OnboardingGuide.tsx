import type { WorldProjection } from '@signal-atlas/simulation';
import { useState } from 'react';

export interface OnboardingGuideProps {
  inspectedSignalId: string | undefined;
  onOpenArchive: () => void;
  onOpenForecast: () => void;
  onOpenSignals: () => void;
  onSelectGuideAgent: (agentId: string) => void;
  projection: WorldProjection;
  selectedAgentId: string;
}

function storageKey(expeditionId: string): string {
  return `signal-atlas:onboarding-dismissed:${expeditionId}`;
}

function initiallyOpen(expeditionId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(storageKey(expeditionId)) !== 'true';
  } catch {
    return true;
  }
}

function persistDismissal(expeditionId: string): void {
  try {
    window.localStorage.setItem(storageKey(expeditionId), 'true');
  } catch {
    // Storage may be unavailable in privacy-restricted contexts; dismissal still works in memory.
  }
}

export function OnboardingGuide({
  inspectedSignalId,
  onOpenArchive,
  onOpenForecast,
  onOpenSignals,
  onSelectGuideAgent,
  projection,
  selectedAgentId,
}: OnboardingGuideProps) {
  const [open, setOpen] = useState(() => initiallyOpen(projection.expedition.id));
  const agents = Object.values(projection.agentsById);
  const guideAgent = agents.find((agent) => agent.role === 'scout') ?? agents[0];
  const historyAgent =
    agents.find((agent) => agent.role === 'archivist') ?? agents[1] ?? guideAgent;
  const evidencePlace =
    projection.worldManifest.places.find((place) =>
      place.capabilityBindings.some(
        (binding) => binding.canonicalCapability === 'local_conditions',
      ),
    ) ??
    projection.worldManifest.places.find((place) => place.archetype === 'newsroom') ??
    projection.worldManifest.places.find(
      (place) => place.id !== projection.worldManifest.defaultSpawnPlaceId,
    );
  const archivePlace =
    projection.worldManifest.places.find((place) => place.archetype === 'archive') ??
    projection.worldManifest.places.find((place) =>
      place.tags.some((tag) => ['archive', 'historical', 'history'].includes(tag)),
    );
  const evidenceSignal = Object.values(projection.signalsById).find((signal) =>
    signal.sourceIds.some(
      (sourceId) => projection.sourcesById[sourceId]?.location?.placeId === evidencePlace?.id,
    ),
  );
  const archiveSignal = Object.values(projection.signalsById).find((signal) =>
    signal.sourceIds.some((sourceId) => {
      const source = projection.sourcesById[sourceId];
      return (
        source?.location?.placeId === archivePlace?.id ||
        source?.sourceClass === 'archive' ||
        source?.tags.some((tag) => ['base-rate', 'historical', 'history'].includes(tag))
      );
    }),
  );
  const revisedForecast = [...projection.forecasts]
    .reverse()
    .find((forecast) => forecast.actor.kind === 'player' && forecast.evidenceSignalIds.length >= 2);
  const steps = [
    {
      done: Boolean(guideAgent && selectedAgentId === guideAgent.id),
      label: guideAgent
        ? `Select ${guideAgent.displayName} for field research.`
        : 'Select an agent.',
    },
    {
      done: Boolean(evidenceSignal),
      label:
        guideAgent && evidencePlace
          ? `Send ${guideAgent.displayName} to investigate ${evidencePlace.name}.`
          : 'Collect the first source-linked signal.',
    },
    {
      done: Boolean(evidenceSignal && inspectedSignalId === evidenceSignal.id),
      label: `Inspect ${guideAgent?.displayName ?? 'the agent'}’s source-linked signal.`,
    },
    {
      done: Boolean(archiveSignal),
      label:
        historyAgent && archivePlace
          ? `Send ${historyAgent.displayName} to search ${archivePlace.name}.`
          : 'Find a historical comparison.',
    },
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
            persistDismissal(projection.expedition.id);
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
        <button
          disabled={!guideAgent}
          onClick={() => guideAgent && onSelectGuideAgent(guideAgent.id)}
          type="button"
        >
          Select {guideAgent?.displayName ?? 'agent'}
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
