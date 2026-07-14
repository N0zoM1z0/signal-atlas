# 07. Art, Audio, and Motion Direction

## 7.1 Art thesis: cozy intelligence

Signal Atlas should look like a handcrafted editorial diorama that happens to be alive. The visual tone combines the warmth of a small night-time city, the clarity of an information graphic, and the charm of expressive pixel characters.

The product should not look cyberpunk, casino-like, or retro for nostalgia's sake. Pixel art is used because it makes a complex world approachable, supports readable symbolic animation, and allows many locations and characters to coexist without visual noise.

## 7.2 Rendering style

Use an "HD pixel" approach:

- world tiles and sprites are authored on a 16-pixel base grid;
- rendered at integer 2x or 3x scale;
- nearest-neighbor scaling for world art;
- modern vector/DOM overlays for text and dense controls;
- selective soft gradients and lighting behind the pixel layer;
- no smoothing on sprites;
- subtle atmospheric particles rendered at native display resolution.

This separation lets the world feel handcrafted while keeping evidence readable.

## 7.3 Color system

### Core world palette

- Atlas Night: `#101524`
- Deep Ink: `#182036`
- Slate Cloud: `#273451`
- Harbor Blue: `#355A78`
- Window Gold: `#F2B84B`
- Parchment: `#F3E5BE`
- Paper Light: `#FFF7DE`
- Moss Signal: `#9FD36A`
- Weather Cyan: `#63C3D1`
- Scholar Violet: `#A78BEA`
- Alert Coral: `#EC6A68`
- Muted Steel: `#8490A8`

### Semantic use

- YES support: Moss Signal plus upward icon;
- NO support: Alert Coral plus downward icon;
- context: Weather Cyan plus split-diamond icon;
- disputed: Window Gold plus warning icon;
- professor/synthesis: Scholar Violet;
- archived/stale: Muted Steel and reduced saturation.

Colors are intentionally slightly dusty rather than neon.

## 7.4 Lighting

Warm windows against a cool world are the signature image. Buildings emit local light pools. Agents walking through those pools briefly gain a warmer palette. Important events can brighten a location, but the screen should never flash.

The probability state influences lighting only subtly:

- higher YES probability warms the horizon;
- higher NO probability cools it;
- uncertainty increases mist and soft cloud texture;
- resolution clears the atmospheric layer.

This effect is decorative and always accompanied by numeric UI.

## 7.5 Building language

Every building needs a silhouette readable at a glance.

- Observatory: dome, telescope, rotating signal beam.
- Weather Tower: anemometer, cloud vane, blue lamps.
- Newsroom: ticker, radio antenna, lit press windows.
- Archive: low brick building, tall windows, moving ladder silhouette.
- Scholar's Hill: steep roof, round study window, chalkboard glow.
- Town Square: central lantern, notice board, benches.
- Exchange: clock face, ledger banners, restrained numeric display.
- Field sites: one distinctive prop tied to the market.

Location labels appear on signboards integrated into the scene, with a clear DOM tooltip for accessibility.

## 7.6 Agent sprite direction

Reference sprite size: 24 x 32 pixels at base resolution, displayed at 3x.

Each agent needs:

- four-direction idle;
- four-direction walk, six frames;
- reading;
- typing or radio call;
- thinking;
- sharing a card;
- surprise;
- disagreement;
- success/acknowledgment;
- error/confusion.

Portraits should be clean 64 x 64 pixel illustrations using the same palette. Distinct silhouettes and accessories matter more than detailed faces.

Mira carries a short field coat and radio. Orin carries a satchel and square glasses. Kestrel has a dark notebook and angular scarf. Professor Vale has a violet vest and chalk-stained sleeves.

## 7.7 UI surface style

UI panels resemble editorial instruments rather than fantasy parchment everywhere.

- dark translucent glass for docks and trays;
- cream paper for source and signal cards;
- one-pixel inner highlights;
- two-pixel dark outlines;
- clipped corners used sparingly;
- tiny stamped icons for source class and reliability;
- large numeric probabilities in a modern sans serif;
- pixel display face only for place labels, timestamps, and short headings.

Recommended font roles, selected by the implementation team from properly licensed sources:

- display pixel face for short labels;
- humanist sans serif for interface and body copy;
- monospaced face for IDs, logs, and structured data.

The package does not redistribute font files.

## 7.8 Signal-card art

Signal cards should feel collectible but serious.

Visual elements:

- colored edge based on directional effect;
- source-class stamp;
- small location illustration or icon;
- freshness as a vertical fading strip;
- discoverer's portrait pin;
- provenance thread emerging from the bottom when expanded;
- correlation knot overlay when linked to another card.

Cards should never use rarity frames, loot sparkle, or casino chip effects.

## 7.9 Weather and atmosphere

Weather is one of the most immediately delightful ways to bind live information to the world.

Supported layers:

- clear stars;
- drifting clouds;
- light rain;
- heavy rain;
- wind streaks and moving flags;
- fog;
- distant lightning without full-screen flash;
- snow, if relevant;
- sunset and night transitions.

Weather transitions take 2-5 seconds and respect reduced-motion preferences. A small tooltip explains the data timestamp and location.

## 7.10 Motion language

World motion is low frame-rate and characterful; UI motion is smooth and restrained.

### World

- sprite animation: 6-12 frames per second;
- walking: clear anticipation and stop pose;
- weather: slow looping particles;
- building state: one or two animated details;
- camera: eased movement over 400-800 milliseconds.

### UI

- panel open: 160-220 milliseconds;
- card arrival: slide plus gentle settle, no bounce in reduced-motion mode;
- forecast update: 500-millisecond ribbon shift;
- provenance reveal: line draws over 300 milliseconds;
- modal transitions: fade and scale from 98% to 100%.

## 7.11 Event choreography

A completed mission should play as a short readable sequence:

1. Agent reaches the location entrance.
2. Location detail animates.
3. Agent performs a task loop.
4. A small signal icon appears above the building.
5. The signal card travels toward the right rail.
6. The agent states one sentence.
7. The event log records the result.

The sequence should take 2-4 seconds after the underlying result is ready and remain skippable.

## 7.12 Audio identity

The soundscape is intimate and tactile.

### Ambient

- soft city night bed;
- wind and rain tied to environment;
- distant newsroom radio;
- archive room clock and page turns;
- observatory electrical hum;
- town-square footsteps and lantern crackle.

### Interface

- paper card slide;
- pencil tick for selection;
- muted telegraph click for new source;
- soft bell for mission completion;
- low wooden knock for errors;
- chalk sound in professor scene.

### Music

A small set of adaptive loops can layer based on activity:

- observation;
- investigation;
- disagreement;
- resolution.

Music should never imply urgency simply because a model call is taking time.

## 7.13 Brand marks

The Signal Atlas mark can combine:

- a compass rose;
- a probability split line;
- a small glowing signal star.

The icon should work at 16 pixels and in one color. Avoid crystal balls and stock candlesticks.

## 7.14 Asset production plan

### Vertical slice

- one 48 x 30 tilemap;
- six building kits;
- four character sprites plus portraits;
- twelve signal/source icons;
- six weather layers;
- core UI icons;
- one logo;
- one ambient loop and twelve UI sounds.

### Production method

Start with color-blocked placeholder sprites and original SVG/CSS UI. Validate composition and interaction before commissioning or creating final pixel assets. Maintain a strict sprite atlas naming convention and integer scaling tests.

## 7.15 Art quality bar

The first screenshot must communicate the concept before any text is read: a small living city, visible agents, an obvious market ribbon, and evidence arriving as cards. If the screenshot resembles a conventional dashboard with a decorative map in the middle, the art direction has failed.
