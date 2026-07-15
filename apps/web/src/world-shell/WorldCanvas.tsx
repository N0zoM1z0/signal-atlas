import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  createWorldSceneBridge,
  mountWorldScene,
  type MountedWorldScene,
  type WorldPresentationCue,
  type WorldSceneCommand,
  type WorldSceneDefinition,
} from '@signal-atlas/game-scene';

export interface WorldCanvasHandle {
  send: (command: WorldSceneCommand) => void;
}

export interface CameraFollowRequest {
  agentId: string;
  requestId: number;
}

export interface WorldCanvasProps {
  autoCamera: boolean;
  captureMode: boolean;
  children: ReactNode;
  followRequest: CameraFollowRequest | undefined;
  model: WorldSceneDefinition;
  presentationCue?: WorldPresentationCue;
  reducedMotion: boolean;
  selectedAgentId: string;
  selectedPlaceId: string | undefined;
  onAgentSelect: (agentId: string) => void;
  onPlaceSelect: (placeId: string) => void;
}

interface CanvasMetrics {
  height: number;
  pixelScale: number;
  width: number;
}

function lowerPercentile(values: readonly number[], percentile: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * percentile)];
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export const WorldCanvas = forwardRef<WorldCanvasHandle, WorldCanvasProps>(function WorldCanvas(
  {
    autoCamera,
    captureMode,
    children,
    followRequest,
    model,
    onAgentSelect,
    onPlaceSelect,
    presentationCue,
    reducedMotion,
    selectedAgentId,
    selectedPlaceId,
  },
  ref,
) {
  const parentRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onAgentSelect, onPlaceSelect });
  const initialOptionsRef = useRef({ reducedMotion, selectedAgentId, selectedPlaceId });
  const initialModelRef = useRef(model);
  const modelRef = useRef(model);
  const previousAgentStatesRef = useRef<Record<string, string>>({});
  const viewStateRef = useRef({
    autoCamera,
    followRequest,
    reducedMotion,
    selectedAgentId,
    selectedPlaceId,
  });
  const bridge = useMemo(() => createWorldSceneBridge(), []);
  const [metrics, setMetrics] = useState<CanvasMetrics>();
  const [framesPerSecond, setFramesPerSecond] = useState<number>();
  const [fpsSamples, setFpsSamples] = useState<number[]>([]);
  const [fpsSampleCount, setFpsSampleCount] = useState(0);
  const [renderedCueId, setRenderedCueId] = useState<string>();
  const [renderedWeather, setRenderedWeather] = useState(model.weather.state);
  const [weatherTransitionMs, setWeatherTransitionMs] = useState(0);
  const [followingAgentId, setFollowingAgentId] = useState<string>();
  const [renderedAgentId, setRenderedAgentId] = useState<string>();
  const [agentAnimationPaused, setAgentAnimationPaused] = useState(false);
  const [arrivalAgentId, setArrivalAgentId] = useState<string>();
  const [renderedProjections, setRenderedProjections] = useState<
    Record<string, { progress: number | null; state: string; x: number; y: number }>
  >({});
  const [cameraCenter, setCameraCenter] = useState({ x: 0, y: 0 });
  const [zoomStep, setZoomStep] = useState(0);
  const [error, setError] = useState<string>();
  callbacksRef.current = { onAgentSelect, onPlaceSelect };
  modelRef.current = model;
  viewStateRef.current = {
    autoCamera,
    followRequest,
    reducedMotion,
    selectedAgentId,
    selectedPlaceId,
  };

  useImperativeHandle(ref, () => ({ send: bridge.send }), [bridge]);

  useEffect(() => {
    const abortController = new AbortController();
    let mountedScene: MountedWorldScene | undefined;
    let cancelled = false;
    const unsubscribe = bridge.subscribe((event) => {
      switch (event.type) {
        case 'scene.ready':
          bridge.send({
            type: 'motion.set-reduced',
            reduced: viewStateRef.current.reducedMotion,
          });
          bridge.send({ type: 'agent.select', agentId: viewStateRef.current.selectedAgentId });
          if (viewStateRef.current.selectedPlaceId) {
            bridge.send({
              type: 'place.select',
              placeId: viewStateRef.current.selectedPlaceId,
            });
          }
          if (viewStateRef.current.followRequest) {
            bridge.send({
              type: 'camera.follow-agent',
              agentId: viewStateRef.current.followRequest.agentId,
            });
          }
          modelRef.current.agents.forEach((agent) => bridge.send({ type: 'agent.project', agent }));
          setMetrics({
            height: event.canvasHeight,
            pixelScale: event.pixelScale,
            width: event.canvasWidth,
          });
          return;
        case 'scene.resized':
          setMetrics({
            height: event.canvasHeight,
            pixelScale: event.pixelScale,
            width: event.canvasWidth,
          });
          return;
        case 'performance.sample':
          setFramesPerSecond(event.framesPerSecond);
          setFpsSamples((current) => [...current, event.framesPerSecond].slice(-120));
          setFpsSampleCount((current) => current + 1);
          return;
        case 'presentation.rendered':
          setRenderedCueId(event.cueId);
          return;
        case 'weather.changed':
          setRenderedWeather(event.state);
          setWeatherTransitionMs(event.transitionMs);
          return;
        case 'camera.changed':
          setCameraCenter({ x: event.centerX, y: event.centerY });
          setZoomStep(event.zoomStep);
          setFollowingAgentId(event.followingAgentId ?? undefined);
          return;
        case 'place.selected':
          callbacksRef.current.onPlaceSelect(event.placeId);
          return;
        case 'agent.selected':
          callbacksRef.current.onAgentSelect(event.agentId);
          return;
        case 'agent.selection-rendered':
          setRenderedAgentId(event.agentId);
          return;
        case 'agent.projection-rendered':
          setRenderedProjections((current) => ({
            ...current,
            [event.agentId]: {
              progress: event.progress,
              state: event.state,
              x: event.x,
              y: event.y,
            },
          }));
          return;
        case 'motion.changed':
          setAgentAnimationPaused(event.agentAnimationsPaused);
      }
    });

    const parent = parentRef.current;
    if (!parent) return unsubscribe;
    void mountWorldScene({
      bridge,
      initialSelectedAgentId: initialOptionsRef.current.selectedAgentId,
      initialSelectedPlaceId: initialOptionsRef.current.selectedPlaceId,
      model: initialModelRef.current,
      parent,
      reducedMotion: initialOptionsRef.current.reducedMotion,
      signal: abortController.signal,
    })
      .then((scene) => {
        if (cancelled) scene.destroy();
        else mountedScene = scene;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'The world renderer failed to start.');
      });

    return () => {
      cancelled = true;
      abortController.abort();
      unsubscribe();
      mountedScene?.destroy();
    };
  }, [bridge]);

  useEffect(() => {
    const previousStates = previousAgentStatesRef.current;
    for (const agent of model.agents) {
      bridge.send({ type: 'agent.project', agent });
      if (
        previousStates[agent.id] === 'traveling' &&
        agent.publicState === 'working' &&
        autoCamera
      ) {
        bridge.send({ type: 'camera.follow-agent', agentId: agent.id });
        setArrivalAgentId(agent.id);
      }
      previousStates[agent.id] = agent.publicState;
    }
  }, [autoCamera, bridge, model.agents]);

  useEffect(() => {
    bridge.send({ type: 'agent.select', agentId: selectedAgentId });
  }, [bridge, selectedAgentId]);

  useEffect(() => {
    if (followRequest) {
      bridge.send({ type: 'camera.follow-agent', agentId: followRequest.agentId });
    }
  }, [bridge, followRequest]);

  useEffect(() => {
    if (selectedPlaceId) bridge.send({ type: 'place.select', placeId: selectedPlaceId });
  }, [bridge, selectedPlaceId]);

  useEffect(() => {
    bridge.send({ type: 'motion.set-reduced', reduced: reducedMotion });
  }, [bridge, reducedMotion]);

  useEffect(() => {
    bridge.send({ type: 'weather.set', weather: model.weather });
  }, [bridge, model.weather]);

  useEffect(() => {
    if (presentationCue) bridge.send({ type: 'presentation.play', cue: presentationCue });
  }, [bridge, presentationCue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.key === 'Home') {
        event.preventDefault();
        bridge.send({ type: 'camera.home' });
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        bridge.send({ type: 'camera.follow-agent', agentId: selectedAgentId });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, selectedAgentId]);

  const ready = Boolean(metrics) && !error;
  const renderedProjection = renderedProjections[selectedAgentId];
  const coordinatePlaneStyle = metrics
    ? { height: `${metrics.height}px`, width: `${metrics.width}px` }
    : undefined;

  return (
    <div
      className="atlas-world-canvas"
      data-camera-center-x={cameraCenter.x}
      data-camera-center-y={cameraCenter.y}
      data-agent-animation-paused={agentAnimationPaused}
      data-agent-progress={renderedProjection?.progress ?? ''}
      data-agent-state={renderedProjection?.state ?? ''}
      data-agent-x={renderedProjection?.x ?? ''}
      data-agent-y={renderedProjection?.y ?? ''}
      data-arrival-agent={arrivalAgentId ?? ''}
      data-following-agent={followingAgentId ?? ''}
      data-fps={framesPerSecond ?? ''}
      data-fps-p10={lowerPercentile(fpsSamples, 0.1) ?? ''}
      data-fps-sample-count={fpsSampleCount}
      data-pixel-scale={metrics?.pixelScale ?? ''}
      data-scene-ready={ready}
      data-reduced-motion={reducedMotion}
      data-rendered-agent={renderedAgentId ?? ''}
      data-rendered-cue={renderedCueId ?? ''}
      data-weather-state={renderedWeather}
      data-weather-transition-ms={weatherTransitionMs}
      data-zoom-step={zoomStep}
    >
      <div aria-hidden="true" className="atlas-phaser-mount" ref={parentRef} />
      <div className="atlas-place-mirror-layer" style={coordinatePlaneStyle}>
        {children}
      </div>
      {(!captureMode || error) && (
        <span className="atlas-scene-diagnostic" role="status">
          {error
            ? `Canvas fallback active · ${error}`
            : ready && metrics
              ? `Phaser · ${metrics.pixelScale}× pixels · Live`
              : 'Starting Phaser scene…'}
        </span>
      )}
    </div>
  );
});
