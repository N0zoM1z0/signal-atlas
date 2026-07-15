import type { WorldProjection } from '@signal-atlas/simulation';
import { useState } from 'react';

import { missionSuggestionForPlace, type MissionSuggestion } from './mission-suggestions.js';

export interface OnboardingGuideProps {
  inspectedSignalId: string | undefined;
  onOpenArchive: () => void;
  onOpenForecast: () => void;
  onOpenSignals: () => void;
  onPrepareMission: (suggestion: MissionSuggestion, agentId: string) => void;
  onSelectGuideAgent: (agentId: string) => void;
  projection: WorldProjection;
  seenSignalIds: readonly string[];
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
  onPrepareMission,
  onSelectGuideAgent,
  projection,
  seenSignalIds,
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
  const evidenceMission = missionSuggestionForPlace(evidencePlace);
  const archiveMission = missionSuggestionForPlace(archivePlace);
  const guideHasMissionHistory = Object.values(projection.missionsById).some(
    (mission) => mission.assignedAgentId === guideAgent?.id,
  );
  const steps = [
    {
      done: Boolean(guideAgent && (selectedAgentId === guideAgent.id || guideHasMissionHistory)),
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
      done: Boolean(
        evidenceSignal &&
        (inspectedSignalId === evidenceSignal.id || seenSignalIds.includes(evidenceSignal.id)),
      ),
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
  const currentStepIndex = steps.findIndex((step) => !step.done);
  const currentStep = steps[currentStepIndex === -1 ? steps.length - 1 : currentStepIndex];
  const currentAction =
    currentStepIndex === 0
      ? {
          label: `Select ${guideAgent?.displayName ?? 'agent'}`,
          run: () => guideAgent && onSelectGuideAgent(guideAgent.id),
          disabled: !guideAgent,
        }
      : currentStepIndex === 1 && evidenceMission && guideAgent
        ? {
            label: `Prepare mission for ${guideAgent.displayName}`,
            run: () => onPrepareMission(evidenceMission, guideAgent.id),
            disabled: false,
          }
        : currentStepIndex === 2
          ? { label: 'Open new signal', run: onOpenSignals, disabled: false }
          : currentStepIndex === 3 && archiveMission && historyAgent
            ? {
                label: `Prepare mission for ${historyAgent.displayName}`,
                run: () => onPrepareMission(archiveMission, historyAgent.id),
                disabled: false,
              }
            : currentStepIndex === 4
              ? { label: 'Open forecast desk', run: onOpenForecast, disabled: false }
              : { label: 'Open case archive', run: onOpenArchive, disabled: false };

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
        <span className="atlas-onboarding__count">{completed} / 5</span>
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
      <div className="atlas-onboarding__current">
        <span>
          {currentStepIndex === -1
            ? 'Journey complete'
            : `Next · Step ${currentStepIndex + 1} of 5`}
        </span>
        <strong>{currentStep?.label ?? 'Continue exploring the evidence trail.'}</strong>
        <button disabled={currentAction.disabled} onClick={currentAction.run} type="button">
          {currentAction.label}
        </button>
      </div>
      <ol aria-label="First expedition progress">
        {steps.map((step, index) => (
          <li
            aria-current={index === currentStepIndex ? 'step' : undefined}
            aria-label={`${step.done ? 'Complete' : index === currentStepIndex ? 'Current' : 'Upcoming'}: ${step.label}`}
            data-complete={step.done}
            data-current={index === currentStepIndex}
            key={step.label}
          >
            <span aria-hidden="true">{step.done ? '✓' : index + 1}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
