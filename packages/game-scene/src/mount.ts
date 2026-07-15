import {
  agentAnimationKey,
  agentSpriteFrameCounts,
  agentSpriteStateForPublicState,
  agentSpriteStates,
  agentTextureKey,
  type AgentSpriteState,
} from './agent-sprites.js';
import {
  calculateIntegerCanvasMetrics,
  clampZoomStep,
  parseCssColor,
  pixelScaleForZoom,
} from './geometry.js';
import { pointAlongWaypoints } from './movement.js';
import type {
  MountedWorldScene,
  MountWorldSceneOptions,
  SceneAgent,
  ScenePlace,
  WorldSceneCommand,
  WorldPresentationCue,
  WorldWeatherPresentation,
  WorldWeatherState,
} from './types.js';

interface ScenePalette {
  alertCoral: number;
  atlasNight: number;
  deepInk: number;
  harborBlue: number;
  mossSignal: number;
  mutedSteel: number;
  paperLight: number;
  parchment: number;
  scholarViolet: number;
  slateCloud: number;
  weatherCyan: number;
  windowGold: number;
}

const paletteProperties = {
  alertCoral: '--sa-color-alert-coral',
  atlasNight: '--sa-color-atlas-night',
  deepInk: '--sa-color-deep-ink',
  harborBlue: '--sa-color-harbor-blue',
  mossSignal: '--sa-color-moss-signal',
  mutedSteel: '--sa-color-muted-steel',
  paperLight: '--sa-color-paper-light',
  parchment: '--sa-color-parchment',
  scholarViolet: '--sa-color-scholar-violet',
  slateCloud: '--sa-color-slate-cloud',
  weatherCyan: '--sa-color-weather-cyan',
  windowGold: '--sa-color-window-gold',
} as const;

function readPalette(parent: HTMLElement): ScenePalette {
  const styles = getComputedStyle(parent);
  return Object.fromEntries(
    Object.entries(paletteProperties).map(([name, property]) => [
      name,
      parseCssColor(styles.getPropertyValue(property)),
    ]),
  ) as unknown as ScenePalette;
}

function placeColor(place: ScenePlace, palette: ScenePalette): number {
  switch (place.archetype) {
    case 'observatory':
    case 'professor':
      return palette.scholarViolet;
    case 'weather_tower':
      return palette.weatherCyan;
    case 'newsroom':
      return palette.alertCoral;
    case 'town_square':
      return palette.windowGold;
    case 'archive':
    case 'exchange':
    case 'field_site':
      return palette.harborBlue;
  }
}

export async function mountWorldScene(options: MountWorldSceneOptions): Promise<MountedWorldScene> {
  const PhaserRuntime: typeof Phaser = (await import('phaser')).default;
  if (options.signal?.aborted) return { destroy() {} };
  const palette = readPalette(options.parent);
  const model = options.model;
  const initialMetrics = calculateIntegerCanvasMetrics(
    options.parent.clientWidth || model.logicalWidth,
    options.parent.clientHeight || model.logicalHeight,
    model.logicalWidth,
    model.logicalHeight,
  );
  let disconnectBridge: (() => void) | undefined;
  let sceneInstance: SignalAtlasScene | undefined;
  const registerSceneInstance = (scene: SignalAtlasScene) => {
    sceneInstance = scene;
  };

  class SignalAtlasScene extends PhaserRuntime.Scene {
    private acceptingCommands = true;
    private readonly agentHighlights = new Map<string, Phaser.GameObjects.Arc>();
    private readonly agentSprites = new Map<string, Phaser.GameObjects.Sprite>();
    private readonly agentTargets = new Map<string, Phaser.GameObjects.Sprite>();
    private basePixelScale = initialMetrics.pixelScale;
    private currentWeather = model.weather;
    private followingAgentId: string | null = null;
    private followReleaseTimer: Phaser.Time.TimerEvent | undefined;
    private lastPerformanceSampleAt = 0;
    private readonly placeContainers = new Map<string, Phaser.GameObjects.Container>();
    private readonly placeHighlights = new Map<string, Phaser.GameObjects.Arc>();
    private reducedMotion = options.reducedMotion;
    private selectedAgentId = options.initialSelectedAgentId;
    private selectedPlaceId = options.initialSelectedPlaceId;
    private spaceKey: Phaser.Input.Keyboard.Key | undefined;
    private readonly weatherLayers = new Map<WorldWeatherState, Phaser.GameObjects.Container>();
    private zoomStep = 0;

    constructor() {
      super({ key: 'signal-atlas-world' });
      registerSceneInstance(this);
    }

    create() {
      this.cameras.main
        .setBounds(0, 0, model.logicalWidth, model.logicalHeight)
        .setBackgroundColor(palette.atlasNight)
        .setRoundPixels(true)
        .setZoom(this.basePixelScale);

      this.drawSky();
      this.drawTerrain();
      this.drawRoutes();
      this.drawLaunchLandmark();
      model.places.forEach((place) => this.drawPlace(place));
      this.drawAgents();
      this.drawWeather();
      this.setWeather(model.weather, true);

      this.spaceKey = this.input.keyboard?.addKey(PhaserRuntime.Input.Keyboard.KeyCodes.SPACE);
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (
          !pointer.isDown ||
          (!pointer.middleButtonDown() && !this.spaceKey?.isDown) ||
          this.followingAgentId
        ) {
          return;
        }
        this.cameras.main.scrollX -= pointer.velocity.x / this.cameras.main.zoom;
        this.cameras.main.scrollY -= pointer.velocity.y / this.cameras.main.zoom;
        this.emitCameraChanged();
      });
      this.input.on(
        'wheel',
        (
          _pointer: Phaser.Input.Pointer,
          _gameObjects: Phaser.GameObjects.GameObject[],
          _deltaX: number,
          deltaY: number,
        ) => this.adjustZoom(deltaY > 0 ? -1 : 1),
      );

      disconnectBridge = options.bridge.connect((command) => {
        if (!this.acceptingCommands || !this.cameras.main) return;
        this.handleCommand(command);
      });
      this.selectPlace(this.selectedPlaceId);
      this.selectAgent(this.selectedAgentId);
      this.centerOnPlace(model.defaultSpawnPlaceId, true);
      this.applyReducedMotion();
      options.bridge.emit({
        type: 'scene.ready',
        canvasHeight: initialMetrics.height,
        canvasWidth: initialMetrics.width,
        pixelScale: this.basePixelScale,
      });
      this.emitCameraChanged();
      this.events.once(PhaserRuntime.Scenes.Events.SHUTDOWN, () => {
        this.acceptingCommands = false;
        disconnectBridge?.();
        disconnectBridge = undefined;
      });
    }

    override update(time: number) {
      if (time - this.lastPerformanceSampleAt < 1_000) return;
      this.lastPerformanceSampleAt = time;
      options.bridge.emit({
        type: 'performance.sample',
        framesPerSecond: Math.round(this.game.loop.actualFps),
      });
    }

    resizeToParent(width: number, height: number) {
      const metrics = calculateIntegerCanvasMetrics(
        width,
        height,
        model.logicalWidth,
        model.logicalHeight,
      );
      if (
        metrics.width === this.scale.width &&
        metrics.height === this.scale.height &&
        metrics.pixelScale === this.basePixelScale
      ) {
        return;
      }
      const previousPixelScale = this.basePixelScale;
      this.basePixelScale = metrics.pixelScale;
      this.scale.resize(metrics.width, metrics.height);
      this.cameras.main.setViewport(0, 0, metrics.width, metrics.height);
      if (this.cameras.main.zoom === pixelScaleForZoom(previousPixelScale, this.zoomStep)) {
        this.cameras.main.setZoom(pixelScaleForZoom(this.basePixelScale, this.zoomStep));
      }
      options.bridge.emit({
        type: 'scene.resized',
        canvasHeight: metrics.height,
        canvasWidth: metrics.width,
        pixelScale: metrics.pixelScale,
      });
      this.emitCameraChanged();
    }

    private drawSky() {
      const sky = this.add.graphics().setDepth(-30);
      sky.fillStyle(palette.atlasNight).fillRect(0, 0, model.logicalWidth, model.logicalHeight);
      sky.fillStyle(palette.deepInk).fillRect(0, model.logicalHeight * 0.42, model.logicalWidth, 5);
      const pixel = 1 / this.basePixelScale;
      for (let index = 0; index < 88; index += 1) {
        const x = ((index * 17 + 3) % (model.logicalWidth * 10)) / 10;
        const y = ((index * 29 + 7) % Math.floor(model.logicalHeight * 4.4)) / 10;
        sky.fillStyle(index % 5 === 0 ? palette.windowGold : palette.paperLight, 0.8);
        sky.fillRect(x, y, pixel, pixel);
      }

      const moon = this.add.graphics().setDepth(-28);
      moon.fillStyle(palette.parchment).fillCircle(model.logicalWidth * 0.84, 4.8, 1.8);
      moon.fillStyle(palette.atlasNight).fillCircle(model.logicalWidth * 0.852, 4.55, 1.55);

      const clouds = [
        { x: 5, y: 5.7, width: 8 },
        { x: 23, y: 8.2, width: 6 },
      ];
      clouds.forEach((cloud, index) => {
        const graphic = this.add.graphics({ x: cloud.x, y: cloud.y }).setDepth(-26);
        graphic.fillStyle(palette.harborBlue, 0.58);
        graphic.fillRect(0, 0, cloud.width, 0.7);
        graphic.fillRect(1.4, -0.5, cloud.width * 0.42, 0.6);
        if (!this.reducedMotion) {
          this.tweens.add({
            targets: graphic,
            x: cloud.x + 2.5,
            duration: 7_000 + index * 1_800,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
          });
        }
      });
    }

    private drawTerrain() {
      const terrain = this.add.graphics().setDepth(-20);
      terrain.fillStyle(palette.slateCloud, 0.88);
      terrain.beginPath();
      terrain.moveTo(0, 16);
      terrain.lineTo(7, 13);
      terrain.lineTo(14, 16);
      terrain.lineTo(21, 12);
      terrain.lineTo(28, 15);
      terrain.lineTo(35, 11);
      terrain.lineTo(model.logicalWidth, 15);
      terrain.lineTo(model.logicalWidth, model.logicalHeight);
      terrain.lineTo(0, model.logicalHeight);
      terrain.closePath().fillPath();

      terrain.fillStyle(palette.harborBlue, 0.46);
      terrain.fillTriangle(0, 21, 9, 15, 16, 24);
      terrain.fillTriangle(11, 24, 24, 14, 31, 24);
      terrain.fillTriangle(25, 24, 37, 13, 45, 24);

      const water = this.add.graphics().setDepth(-18);
      water.fillStyle(palette.atlasNight, 0.78).fillRect(35, 18, 13, 12);
      water.lineStyle(1 / this.basePixelScale, palette.weatherCyan, 0.52);
      for (let y = 18.4; y < 30; y += 0.55) water.lineBetween(35, y, 48, y);

      const foreground = this.add.graphics().setDepth(-17);
      foreground.fillStyle(palette.deepInk, 0.82);
      foreground.beginPath();
      foreground.moveTo(0, 27);
      foreground.lineTo(10, 25.5);
      foreground.lineTo(19, 26.5);
      foreground.lineTo(28, 25.8);
      foreground.lineTo(35, 27.2);
      foreground.lineTo(35, 30);
      foreground.lineTo(0, 30);
      foreground.closePath().fillPath();

      const cityDetails = this.add.graphics().setDepth(-5);
      cityDetails.fillStyle(palette.deepInk, 0.72);
      for (let index = 0; index < 36; index += 1) {
        const x = 2 + ((index * 11) % 42);
        const y = 17 + ((index * 7) % 10);
        cityDetails.fillRect(x, y, 0.16, 0.16);
      }
      cityDetails.fillStyle(palette.windowGold, 0.22);
      model.places.forEach((place) =>
        cityDetails.fillEllipse(place.position.x, place.position.y + 0.6, 6.2, 2.2),
      );
    }

    private drawRoutes() {
      const routes = this.add.graphics().setDepth(-8);
      routes.lineStyle(2 / this.basePixelScale, palette.windowGold, 0.36);
      model.routes.forEach((route) => {
        routes.beginPath();
        route.waypoints.forEach((point, index) => {
          if (index === 0) routes.moveTo(point.x, point.y);
          else routes.lineTo(point.x, point.y);
        });
        routes.strokePath();
      });
    }

    private drawLaunchLandmark() {
      const landmark = this.add.container(44, 10).setDepth(-6);
      const rocket = this.add.graphics();
      rocket.fillStyle(palette.mutedSteel, 0.65).fillRect(-0.4, -3.5, 0.8, 3.5);
      rocket.fillStyle(palette.paperLight, 0.78).fillTriangle(-0.4, -3.5, 0, -4.5, 0.4, -3.5);
      rocket.fillStyle(palette.alertCoral, 0.72).fillTriangle(-0.4, 0, -0.9, 0.8, 0, 0);
      rocket.fillTriangle(0.4, 0, 0.9, 0.8, 0, 0);
      rocket.lineStyle(2 / this.basePixelScale, palette.windowGold, 0.58);
      rocket.lineBetween(-1.4, 0.9, 1.4, 0.9);
      landmark.add(rocket);
    }

    private drawPlace(place: ScenePlace) {
      const container = this.add.container(place.position.x, place.position.y).setDepth(3);
      this.placeContainers.set(place.id, container);
      const light = this.add.graphics();
      light.fillStyle(palette.windowGold, 0.12).fillEllipse(0, 0.25, 6.4, 2.2);
      const shadow = this.add.graphics();
      shadow.fillStyle(palette.atlasNight, 0.58).fillEllipse(0.3, 0.35, 4.8, 1.35);
      const building = this.add.graphics();
      const detail = this.add.graphics();
      const color = placeColor(place, palette);
      building.lineStyle(2 / this.basePixelScale, palette.atlasNight, 1);
      detail.lineStyle(2 / this.basePixelScale, palette.atlasNight, 0.9);

      switch (place.archetype) {
        case 'observatory':
          building.fillStyle(color).fillRoundedRect(-2.2, -2.8, 4.4, 2.8, 0.7);
          building.fillStyle(palette.slateCloud).fillCircle(0, -2.8, 2.05);
          building.fillStyle(palette.atlasNight).fillRect(-2.2, -2.8, 4.4, 2.1);
          detail.lineBetween(0.1, -3.7, 2.65, -4.9);
          detail.fillStyle(palette.weatherCyan).fillRect(2.35, -5.1, 0.8, 0.45);
          detail.fillStyle(palette.windowGold).fillCircle(0, -2.75, 0.48);
          break;
        case 'weather_tower':
          building.fillStyle(color).fillRect(-0.9, -4.6, 1.8, 4.6);
          building.fillStyle(palette.deepInk).fillTriangle(-1.65, 0, 0, -4.6, 1.65, 0);
          building.fillStyle(color).fillTriangle(-1.08, 0, 0, -3.7, 1.08, 0);
          detail.lineBetween(-2.5, -5.05, 2.5, -5.05);
          detail.lineBetween(0, -5.05, 0, -6);
          detail.fillStyle(palette.windowGold).fillCircle(-2.5, -5.05, 0.24);
          detail.fillCircle(2.5, -5.05, 0.24);
          detail.fillCircle(0, -6, 0.24);
          break;
        case 'newsroom':
          building.fillStyle(color).fillRect(-2.5, -3.2, 5, 3.2);
          building.fillStyle(palette.slateCloud).fillTriangle(-2.8, -3.2, 0, -4.2, 2.8, -3.2);
          detail.fillStyle(palette.paperLight).fillRect(-2.1, -0.72, 4.2, 0.34);
          detail.lineBetween(1.45, -4, 2.15, -5.45);
          detail.lineBetween(2.15, -5.45, 2.8, -4.9);
          break;
        case 'archive':
          building.fillStyle(color).fillRect(-3, -2.5, 6, 2.5);
          building.fillStyle(palette.slateCloud).fillTriangle(-3.3, -2.5, 0, -3.65, 3.3, -2.5);
          detail.fillStyle(palette.parchment);
          [-2.2, -0.75, 0.75, 2.2].forEach((x) => detail.fillRect(x, -2.2, 0.28, 2.1));
          detail.fillRect(-2.65, -0.34, 5.3, 0.3);
          break;
        case 'professor':
          building.fillStyle(color).fillRect(-2, -3.6, 4, 3.6);
          building.fillStyle(palette.slateCloud).fillTriangle(-2.5, -3.6, 0, -5, 2.5, -3.6);
          detail.fillStyle(palette.windowGold).fillCircle(0, -2.7, 0.72);
          detail.lineBetween(-0.72, -2.7, 0.72, -2.7);
          detail.lineBetween(0, -3.42, 0, -1.98);
          detail.fillStyle(palette.deepInk).fillRect(1.2, -5.15, 0.55, 1.6);
          break;
        case 'town_square':
          building.fillStyle(color).fillRoundedRect(-0.48, -3.45, 0.96, 3.45, 0.45);
          building.fillStyle(palette.parchment, 0.9).fillCircle(0, -3.65, 0.92);
          detail.fillStyle(palette.deepInk).fillRect(-2.4, -0.3, 1.35, 0.28);
          detail.fillRect(1.05, -0.3, 1.35, 0.28);
          detail.fillStyle(palette.windowGold, 0.32).fillCircle(0, -3.65, 1.55);
          break;
        case 'exchange':
        case 'field_site':
          building.fillStyle(color).fillRect(-2.2, -3, 4.4, 3);
          break;
      }

      if (place.archetype !== 'town_square') {
        building.fillStyle(palette.windowGold);
        for (let x = -1.4; x <= 1.4; x += 0.9) building.fillRect(x, -1.5, 0.35, 0.75);
      }

      const highlight = this.add
        .circle(0, -1.2, 3.5)
        .setStrokeStyle(2 / this.basePixelScale, palette.windowGold, 1)
        .setVisible(false);
      this.placeHighlights.set(place.id, highlight);
      container.add([light, shadow, building, detail, highlight]);
      container
        .setSize(6, 7)
        .setInteractive(
          new PhaserRuntime.Geom.Rectangle(-3, -5.5, 6, 7),
          PhaserRuntime.Geom.Rectangle.Contains,
        );
      container.on('pointerdown', () => {
        this.selectPlace(place.id);
        options.bridge.emit({ type: 'place.selected', placeId: place.id, source: 'canvas' });
      });
    }

    private drawAgents() {
      model.agents.forEach((agent, index) => {
        const place = model.places.find((candidate) => candidate.id === agent.placeId);
        if (!place) return;
        const offset = this.agentOffset(index);
        this.createAgentAnimations(agent);
        const state = agentSpriteStateForPublicState(agent.publicState);
        const x = place.position.x + offset.x;
        const y = place.position.y + offset.y;
        const highlight = this.add
          .circle(x, y - 0.9, 1.25)
          .setDepth(6)
          .setStrokeStyle(2 / this.basePixelScale, palette.weatherCyan, 1)
          .setVisible(false);
        const sprite = this.add
          .sprite(x, y, agentTextureKey(agent.id, state, 0))
          .setDepth(7)
          .setDisplaySize(1.5, 2)
          .setOrigin(0.5, 1)
          .setInteractive({ useHandCursor: true });
        sprite.play(agentAnimationKey(agent.id, state));
        sprite.on('pointerdown', () => {
          this.selectAgent(agent.id);
          options.bridge.emit({ type: 'agent.selected', agentId: agent.id, source: 'canvas' });
        });
        this.agentHighlights.set(agent.id, highlight);
        this.agentSprites.set(agent.id, sprite);
        this.agentTargets.set(agent.id, sprite);
        this.updateAgentProjection(agent, true);
      });
    }

    private agentOffset(index: number) {
      const offsets = [
        { x: 2.1, y: 0.6 },
        { x: -1.4, y: 0.8 },
        { x: -1.9, y: 1.4 },
      ];
      return offsets[index % offsets.length] ?? { x: 0, y: 0 };
    }

    private agentPosition(agent: SceneAgent) {
      if (agent.movement) {
        const route = model.routes.find((candidate) => candidate.id === agent.movement?.routeId);
        const reversed = route && agent.movement.fromPlaceId === route.toPlaceId;
        const waypoints = route && reversed ? [...route.waypoints].reverse() : route?.waypoints;
        const point = waypoints
          ? pointAlongWaypoints(waypoints, agent.movement.progress)
          : undefined;
        if (point) return point;
      }
      const place = model.places.find((candidate) => candidate.id === agent.placeId);
      if (!place) return undefined;
      const index = model.agents.findIndex((candidate) => candidate.id === agent.id);
      const offset = this.agentOffset(Math.max(0, index));
      return { x: place.position.x + offset.x, y: place.position.y + offset.y };
    }

    private updateAgentProjection(agent: SceneAgent, immediate = false) {
      const sprite = this.agentSprites.get(agent.id);
      const highlight = this.agentHighlights.get(agent.id);
      const position = this.agentPosition(agent);
      if (!sprite || !highlight || !position) return;
      const state = agentSpriteStateForPublicState(agent.publicState);
      this.setAgentAnimation(agent.id, state);
      this.tweens.killTweensOf([sprite, highlight]);
      const duration = immediate || this.reducedMotion ? 0 : 180;
      if (duration === 0) {
        sprite.setPosition(position.x, position.y);
        highlight.setPosition(position.x, position.y - 0.9);
      } else {
        this.tweens.add({
          targets: sprite,
          x: position.x,
          y: position.y,
          duration,
          ease: 'Linear',
        });
        this.tweens.add({
          targets: highlight,
          x: position.x,
          y: position.y - 0.9,
          duration,
          ease: 'Linear',
        });
      }
      options.bridge.emit({
        type: 'agent.projection-rendered',
        agentId: agent.id,
        progress: agent.movement?.progress ?? null,
        state,
        x: Number(position.x.toFixed(3)),
        y: Number(position.y.toFixed(3)),
      });
    }

    private createAgentAnimations(agent: SceneAgent) {
      agentSpriteStates.forEach((state) => {
        const animationKey = agentAnimationKey(agent.id, state);
        const frameKeys = Array.from({ length: agentSpriteFrameCounts[state] }, (_, frame) => {
          const textureKey = agentTextureKey(agent.id, state, frame);
          if (!this.textures.exists(textureKey))
            this.createAgentTexture(agent, state, frame, textureKey);
          return { key: textureKey };
        });
        if (this.anims.exists(animationKey)) return;
        this.anims.create({
          key: animationKey,
          frames: frameKeys,
          frameRate: state === 'walk' ? 8 : state === 'idle' ? 4 : 6,
          repeat: -1,
        });
      });
    }

    private createAgentTexture(
      agent: SceneAgent,
      state: AgentSpriteState,
      frame: number,
      textureKey: string,
    ) {
      const graphic = this.make.graphics({ x: 0, y: 0 });
      const bob = state === 'idle' ? frame % 2 : 0;
      const step = state === 'walk' ? frame % 2 : 0;
      const coat =
        agent.role === 'scout'
          ? palette.weatherCyan
          : agent.role === 'archivist'
            ? palette.scholarViolet
            : palette.mossSignal;
      const accent = agent.role === 'archivist' ? palette.windowGold : palette.alertCoral;
      const hair = agent.role === 'skeptic' ? palette.alertCoral : palette.deepInk;

      graphic.fillStyle(palette.atlasNight).fillRect(2, 14, 8, 2);
      graphic.fillStyle(palette.parchment).fillRect(4, 3 + bob, 4, 4);
      graphic.fillStyle(hair).fillRect(3, 2 + bob, 6, 2);
      if (agent.role === 'skeptic') graphic.fillTriangle(8, 2 + bob, 11, 5 + bob, 8, 5 + bob);
      graphic.fillStyle(coat).fillRect(3, 7 + bob, 6, 6);
      graphic.fillStyle(palette.deepInk);
      graphic.fillRect(step ? 3 : 4, 13, 2, 3);
      graphic.fillRect(step ? 7 : 6, 13, 2, 3);

      if (agent.role === 'scout') {
        graphic.fillStyle(accent).fillRect(9, 7 + bob, 2, 3);
        graphic.fillStyle(palette.paperLight).fillRect(10, 7 + bob, 1, 1);
      } else if (agent.role === 'archivist') {
        graphic.lineStyle(1, palette.deepInk, 1);
        graphic.strokeRect(3, 4 + bob, 3, 2);
        graphic.strokeRect(6, 4 + bob, 3, 2);
        graphic.fillStyle(accent).fillRect(1, 9 + bob, 3, 4);
      } else {
        graphic.fillStyle(accent).fillTriangle(3, 7 + bob, 10, 8 + bob, 9, 10 + bob);
      }

      if (state === 'work') {
        graphic.fillStyle(palette.paperLight).fillRect(2 + (frame % 2), 9, 8, 5);
        graphic.fillStyle(palette.harborBlue).fillRect(3, 10 + (frame % 2), 5, 1);
        graphic.fillRect(3, 12, 4, 1);
      } else if (state === 'share') {
        graphic.fillStyle(coat).fillRect(9, 8 + (frame % 2), 3, 2);
        graphic.fillStyle(palette.windowGold).fillRect(10, 6 + (frame % 2), 2, 2);
      }

      graphic.generateTexture(textureKey, 12, 16);
      graphic.destroy();
    }

    private drawWeather() {
      const clear = this.add.container(0, 0).setDepth(1).setAlpha(0);
      this.weatherLayers.set('clear', clear);

      const breeze = this.createWindLayer(5, 2.2, 0.5);
      const crosswind = this.createWindLayer(10, 3.4, 0.82);
      this.weatherLayers.set('breezy', breeze);
      this.weatherLayers.set('crosswind', crosswind);

      const rain = this.add.container(0, 0).setDepth(1).setAlpha(0);
      for (let index = 0; index < 34; index += 1) {
        const drop = this.add.graphics({
          x: ((index * 17 + 5) % 47) + 0.5,
          y: ((index * 11 + 2) % 27) + 0.5,
        });
        drop.lineStyle(1 / this.basePixelScale, palette.weatherCyan, 0.64);
        drop.lineBetween(0, 0, -0.36, 1.05);
        rain.add(drop);
        this.tweens.add({
          targets: drop,
          x: drop.x - 1.8,
          y: drop.y + 5,
          duration: 1_000 + (index % 5) * 90,
          repeat: -1,
        });
      }
      this.weatherLayers.set('rain', rain);

      const fog = this.add.container(0, 0).setDepth(2).setAlpha(0);
      for (let index = 0; index < 4; index += 1) {
        const band = this.add.graphics({ x: -5 - index * 2, y: 10 + index * 4.4 });
        band.fillStyle(palette.mutedSteel, 0.13).fillRect(0, 0, 58, 2.2);
        fog.add(band);
        this.tweens.add({
          targets: band,
          x: band.x + 4,
          duration: 8_000 + index * 1_200,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      }
      this.weatherLayers.set('fog', fog);
    }

    private createWindLayer(count: number, length: number, opacity: number) {
      const wind = this.add.container(0, 0).setDepth(1).setAlpha(0);
      for (let index = 0; index < count; index += 1) {
        const streak = this.add.graphics({
          x: ((index * 13 + 4) % 46) - 2,
          y: 3 + ((index * 7) % 22),
        });
        streak.lineStyle(1 / this.basePixelScale, palette.weatherCyan, opacity);
        streak.lineBetween(0, 0, length, 0);
        wind.add(streak);
        this.tweens.add({
          targets: streak,
          x: streak.x + 3.2,
          alpha: { from: 0.25, to: 0.92 },
          duration: 1_400 + (index % 4) * 170,
          yoyo: true,
          repeat: -1,
        });
      }
      return wind;
    }

    private setWeather(weather: WorldWeatherPresentation, immediate = false) {
      this.currentWeather = structuredClone(weather);
      const transitionMs = immediate || this.reducedMotion ? 0 : 2_200;
      const intensity = Math.min(1, Math.max(0, weather.intensity));
      this.weatherLayers.forEach((layer, state) => {
        const targetAlpha = state === weather.state && state !== 'clear' ? intensity : 0;
        this.tweens.killTweensOf(layer);
        if (transitionMs === 0) layer.setAlpha(targetAlpha);
        else {
          this.tweens.add({
            targets: layer,
            alpha: targetAlpha,
            duration: transitionMs,
            ease: 'Sine.easeInOut',
          });
        }
      });
      options.bridge.emit({ type: 'weather.changed', state: weather.state, transitionMs });
    }

    private playPresentationCue(cue: WorldPresentationCue) {
      const place = cue.placeId
        ? model.places.find((candidate) => candidate.id === cue.placeId)
        : undefined;
      const agent = cue.agentId ? this.agentSprites.get(cue.agentId) : undefined;
      const x = place?.position.x ?? agent?.x ?? model.logicalWidth / 2;
      const y = (place?.position.y ?? agent?.y ?? model.logicalHeight / 2) - 3;
      const marker = this.add.container(x, y).setDepth(14);
      const icon = this.add.graphics();

      if (cue.kind === 'arrival') {
        icon.lineStyle(2 / this.basePixelScale, palette.weatherCyan, 1).strokeCircle(0, 0, 0.9);
        icon.fillStyle(palette.paperLight).fillTriangle(-0.35, 0.1, 0, -0.48, 0.35, 0.1);
      } else if (cue.kind === 'work') {
        icon.fillStyle(palette.parchment).fillRect(-0.9, -0.6, 1.8, 1.2);
        icon.fillStyle(palette.harborBlue).fillRect(-0.65, -0.3, 1.2, 0.14);
        icon.fillRect(-0.65, 0.05, 0.85, 0.14);
      } else if (cue.kind === 'signal') {
        icon.fillStyle(palette.windowGold).fillTriangle(0, -0.95, 0.85, 0, 0, 0.95);
        icon.fillTriangle(0, -0.95, -0.85, 0, 0, 0.95);
        icon.fillStyle(palette.paperLight).fillCircle(0, 0, 0.22);
      } else if (cue.kind === 'complete') {
        icon.fillStyle(palette.mossSignal).fillCircle(0, 0, 0.85);
        icon.lineStyle(2 / this.basePixelScale, palette.atlasNight, 1);
        icon.lineBetween(-0.38, 0, -0.08, 0.32);
        icon.lineBetween(-0.08, 0.32, 0.48, -0.38);
      } else {
        icon.fillStyle(palette.alertCoral).fillTriangle(0, -0.95, 0.9, 0.75, -0.9, 0.75);
        icon.fillStyle(palette.atlasNight).fillRect(-0.08, -0.42, 0.16, 0.7);
      }
      marker.add(icon);

      const duration = this.reducedMotion ? 0 : cue.kind === 'signal' ? 720 : 560;
      const target = this.placeContainers.get(cue.placeId ?? '');
      if (target && !this.reducedMotion) {
        this.tweens.add({
          targets: target,
          scaleX: 1.035,
          scaleY: 1.035,
          duration: 160,
          yoyo: true,
        });
      }
      if (duration > 0) {
        this.tweens.add({
          targets: marker,
          x: cue.kind === 'signal' ? model.logicalWidth - 1.5 : x,
          y: cue.kind === 'signal' ? 8 : y - 1.5,
          alpha: 0,
          duration,
          ease: 'Sine.easeInOut',
          onComplete: () => marker.destroy(true),
        });
      } else {
        this.time.delayedCall(240, () => marker.destroy(true));
      }
      options.bridge.emit({ type: 'presentation.rendered', cueId: cue.id, kind: cue.kind });
    }

    private handleCommand(command: WorldSceneCommand) {
      switch (command.type) {
        case 'camera.home':
          this.centerOnPlace(model.defaultSpawnPlaceId);
          return;
        case 'camera.pan':
          this.stopFollowing();
          this.cameras.main.scrollX += command.deltaX;
          this.cameras.main.scrollY += command.deltaY;
          this.emitCameraChanged();
          return;
        case 'camera.zoom':
          this.adjustZoom(command.delta);
          return;
        case 'camera.follow-agent':
          this.followAgent(command.agentId);
          return;
        case 'agent.select':
          this.selectAgent(command.agentId);
          return;
        case 'agent.project':
          this.updateAgentProjection(command.agent);
          return;
        case 'agent.set-animation':
          this.setAgentAnimation(command.agentId, command.state);
          return;
        case 'place.center':
          this.centerOnPlace(command.placeId);
          return;
        case 'place.select':
          this.selectPlace(command.placeId);
          return;
        case 'motion.set-reduced':
          this.reducedMotion = command.reduced;
          this.applyReducedMotion();
          return;
        case 'presentation.play':
          this.playPresentationCue(command.cue);
          return;
        case 'weather.set':
          this.setWeather(command.weather);
      }
    }

    private adjustZoom(delta: -1 | 1) {
      this.zoomStep = clampZoomStep(this.zoomStep + delta);
      this.cameras.main.setZoom(pixelScaleForZoom(this.basePixelScale, this.zoomStep));
      this.emitCameraChanged();
    }

    private centerOnPlace(placeId: string, immediate = false) {
      const place = model.places.find((candidate) => candidate.id === placeId);
      if (!place) return;
      this.stopFollowing();
      const duration = immediate || this.reducedMotion ? 0 : 600;
      this.cameras.main.pan(place.position.x, place.position.y, duration, 'Sine.easeInOut', true);
      if (duration === 0) this.cameras.main.centerOn(place.position.x, place.position.y);
      this.time.delayedCall(duration, () => this.emitCameraChanged());
    }

    private followAgent(agentId: string) {
      const target = this.agentTargets.get(agentId);
      if (!target) return;
      this.followReleaseTimer?.remove(false);
      this.followingAgentId = agentId;
      const lerp = this.reducedMotion ? 1 : 0.12;
      this.cameras.main.startFollow(target, true, lerp, lerp);
      this.emitCameraChanged();
      this.followReleaseTimer = this.time.delayedCall(2_000, () => {
        this.stopFollowing();
        this.emitCameraChanged();
      });
    }

    private stopFollowing() {
      this.followReleaseTimer?.remove(false);
      this.followReleaseTimer = undefined;
      this.cameras.main.stopFollow();
      this.followingAgentId = null;
    }

    private selectPlace(placeId: string | undefined) {
      this.selectedPlaceId = placeId;
      this.placeHighlights.forEach((highlight, id) => highlight.setVisible(id === placeId));
    }

    private selectAgent(agentId: string) {
      if (!this.agentSprites.has(agentId)) return;
      this.selectedAgentId = agentId;
      this.agentHighlights.forEach((highlight, id) => highlight.setVisible(id === agentId));
      options.bridge.emit({ type: 'agent.selection-rendered', agentId });
    }

    private setAgentAnimation(agentId: string, state: AgentSpriteState) {
      const sprite = this.agentSprites.get(agentId);
      if (!sprite) return;
      sprite.play(agentAnimationKey(agentId, state), true);
      if (this.reducedMotion) sprite.anims.pause();
    }

    private applyReducedMotion() {
      if (this.reducedMotion) {
        this.tweens.pauseAll();
        this.agentSprites.forEach((sprite) => sprite.anims.pause());
        this.setWeather(this.currentWeather, true);
      } else {
        this.tweens.resumeAll();
        this.agentSprites.forEach((sprite) => sprite.anims.resume());
      }
      options.bridge.emit({
        type: 'motion.changed',
        agentAnimationsPaused: this.reducedMotion,
        reduced: this.reducedMotion,
      });
    }

    private emitCameraChanged() {
      const camera = this.cameras.main;
      options.bridge.emit({
        type: 'camera.changed',
        centerX: Number(camera.midPoint.x.toFixed(2)),
        centerY: Number(camera.midPoint.y.toFixed(2)),
        followingAgentId: this.followingAgentId,
        pixelScale: this.basePixelScale,
        zoomStep: this.zoomStep,
      });
    }
  }

  const game = new PhaserRuntime.Game({
    type: PhaserRuntime.CANVAS,
    parent: options.parent,
    width: initialMetrics.width,
    height: initialMetrics.height,
    backgroundColor: palette.atlasNight,
    banner: false,
    audio: { noAudio: true },
    input: {
      mouse: { preventDefaultWheel: true },
    },
    render: {
      antialias: false,
      antialiasGL: false,
      pixelArt: true,
      roundPixels: true,
      transparent: false,
    },
    scene: SignalAtlasScene,
  });

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry || !sceneInstance?.scene.isActive()) return;
    sceneInstance.resizeToParent(entry.contentRect.width, entry.contentRect.height);
  });
  resizeObserver.observe(options.parent);

  return {
    destroy() {
      resizeObserver.disconnect();
      disconnectBridge?.();
      disconnectBridge = undefined;
      game.destroy(true);
      sceneInstance = undefined;
    },
  };
}
