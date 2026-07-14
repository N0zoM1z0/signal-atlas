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
  type WorldSceneCommand,
  type WorldSceneDefinition,
} from '@signal-atlas/game-scene';

export interface WorldCanvasHandle {
  send: (command: WorldSceneCommand) => void;
}

export interface WorldCanvasProps {
  children: ReactNode;
  model: WorldSceneDefinition;
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

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export const WorldCanvas = forwardRef<WorldCanvasHandle, WorldCanvasProps>(function WorldCanvas(
  {
    children,
    model,
    onAgentSelect,
    onPlaceSelect,
    reducedMotion,
    selectedAgentId,
    selectedPlaceId,
  },
  ref,
) {
  const parentRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onAgentSelect, onPlaceSelect });
  const initialOptionsRef = useRef({ reducedMotion, selectedAgentId, selectedPlaceId });
  const bridge = useMemo(() => createWorldSceneBridge(), []);
  const [metrics, setMetrics] = useState<CanvasMetrics>();
  const [framesPerSecond, setFramesPerSecond] = useState<number>();
  const [followingAgentId, setFollowingAgentId] = useState<string>();
  const [cameraCenter, setCameraCenter] = useState({ x: 0, y: 0 });
  const [zoomStep, setZoomStep] = useState(0);
  const [error, setError] = useState<string>();
  callbacksRef.current = { onAgentSelect, onPlaceSelect };

  useImperativeHandle(ref, () => ({ send: bridge.send }), [bridge]);

  useEffect(() => {
    const abortController = new AbortController();
    let mountedScene: MountedWorldScene | undefined;
    let cancelled = false;
    const unsubscribe = bridge.subscribe((event) => {
      switch (event.type) {
        case 'scene.ready':
        case 'scene.resized':
          setMetrics({
            height: event.canvasHeight,
            pixelScale: event.pixelScale,
            width: event.canvasWidth,
          });
          return;
        case 'performance.sample':
          setFramesPerSecond(event.framesPerSecond);
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
      }
    });

    const parent = parentRef.current;
    if (!parent) return unsubscribe;
    void mountWorldScene({
      bridge,
      initialSelectedAgentId: initialOptionsRef.current.selectedAgentId,
      initialSelectedPlaceId: initialOptionsRef.current.selectedPlaceId,
      model,
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
  }, [bridge, model]);

  useEffect(() => {
    if (selectedPlaceId) bridge.send({ type: 'place.select', placeId: selectedPlaceId });
  }, [bridge, selectedPlaceId]);

  useEffect(() => {
    bridge.send({ type: 'motion.set-reduced', reduced: reducedMotion });
  }, [bridge, reducedMotion]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
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
  const coordinatePlaneStyle = metrics
    ? { height: `${metrics.height}px`, width: `${metrics.width}px` }
    : undefined;

  return (
    <div
      className="atlas-world-canvas"
      data-camera-center-x={cameraCenter.x}
      data-camera-center-y={cameraCenter.y}
      data-following-agent={followingAgentId ?? ''}
      data-fps={framesPerSecond ?? ''}
      data-pixel-scale={metrics?.pixelScale ?? ''}
      data-scene-ready={ready}
      data-reduced-motion={reducedMotion}
      data-zoom-step={zoomStep}
    >
      <div aria-hidden="true" className="atlas-phaser-mount" ref={parentRef} />
      <div className="atlas-place-mirror-layer" style={coordinatePlaneStyle}>
        {children}
      </div>
      <span className="atlas-scene-diagnostic" role="status">
        {error
          ? `Canvas fallback active · ${error}`
          : ready && metrics
            ? `Phaser · ${metrics.pixelScale}× pixels · Live`
            : 'Starting Phaser scene…'}
      </span>
    </div>
  );
});
