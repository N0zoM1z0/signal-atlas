# STATIC-PAGES-BUNDLE-OPTIMIZATION - Pages initial-load budget

## Status

Complete on `feat/static-github-pages-demo`.

## Goal

Reduce the JavaScript delivered by the GitHub Pages showcase without changing its authored
research loop, its browser-only runtime boundary, or the default local-orchestrator build. The
current Pages artifact contains a 675.80 kB application chunk (184.06 kB gzip) and a 1,198.00 kB
Phaser chunk (319.07 kB gzip). Phaser is already dynamically imported by the scene mount, but the
application shell still statically imports the world shell and its dense workspaces.

## Intended changes

- Lazy-load the world shell and the component demonstration so the Lobby and bootstrap boundary do
  not parse the complete world/workspace tree before it is required.
- Evaluate a Phaser Canvas-only source build only if its compile-time feature flags are compatible
  with the existing scene API and it passes scene, default E2E, static Pages E2E, and visual gates.
- Preserve the existing Pages artifact verifier, no-network policy, routing, semantic DOM, reduced
  motion, and fixture-only state authority.
- Update the static-showcase worklog with measured before/after artifact sizes and any consciously
  deferred approach.

## Acceptance criteria

- `pnpm build:pages` reports a smaller initial application payload, with the exact before/after
  size recorded.
- The normal `pnpm build` keeps its remote runtime graph and has no Page-only source alias.
- The Phaser optimization is accepted only when the 48 x 30 canvas, world interactions, and visual
  baselines remain correct; otherwise it is documented and deferred.
- Format, typecheck, lint, unit tests, default E2E, static Pages E2E, and relevant visual tests pass
  before publish.

## Risks

- A split that changes the readiness/focus lifecycle can harm keyboard access or capture tests.
- Phaser source aliases can silently omit renderer, game-object, or input modules. Treat every
  missing API or visual discrepancy as a rejection, rather than patching around it with an
  unsupported custom fork.
- Chunk count is not itself a performance improvement. Report both transferred gzip bytes and
  loading behavior, not just a smaller filename in the build log.

## Outcome

- The application entry fell from 675.80 kB (184.06 kB gzip) to 317.44 kB (90.72 kB gzip), a
  51% reduction for that entry. The required entry/module-preload set is about 135 kB gzip,
  compared with the previous single 184.06 kB gzip application module.
- `WorldShell` is now a 180.60 kB (48.40 kB gzip) lazy chunk and Phaser remains a 1,198.01 kB
  (319.08 kB gzip) lazy chunk. Neither is requested while the static Lobby is visible; both load
  only after a user opens an authored world.
- The Component demonstration and Lobby are also lazy boundaries. App-level loading retains a
  semantic status landmark while a selected view loads.
- The app's former server-markup unit assertion now renders the WorldShell directly through the
  runtime provider. This preserves semantic DOM coverage without forcing lazy production chunks
  to resolve synchronously in a server-only test renderer.
- The Pages build verifier rejects an HTML entry that preloads `WorldShell` or Phaser, and the
  Pages Playwright profile records real browser requests to prove the renderer remains deferred.

## Rejected experiment

The Phaser `src/phaser.js` Canvas-only alias was evaluated and rejected. It transformed 1,815
modules instead of 175, grew the Phaser chunk slightly to 1,209.45 kB (320.04 kB gzip), and failed
to resolve Phaser's optional `phaser3spectorjs` WebGL dependency. Shipping that alias would require
maintaining an upstream-specific custom Phaser build and would not improve this artifact. The
official prebuilt Phaser module remains the safe lazy renderer.

## Validation

- `pnpm format:check` - passed.
- `pnpm typecheck` - passed across all 12 scripted workspace projects.
- `pnpm lint` - passed with zero warnings.
- `pnpm test` - passed; 312 unit and integration tests.
- `pnpm build` - passed; the ordinary local-orchestrator build also receives lazy world chunks,
  with a 60.81 kB gzip entry and no Pages-only renderer alias.
- `pnpm test:e2e` - passed; 36 local-orchestrator browser tests, including focus restoration,
  keyboard flows, semantic DOM, stream recovery, and all workspace transitions.
- `pnpm test:visual` - passed; all 12 existing visual baselines.
- `pnpm test:pages` - passed; build verifier passed and all 4 Pages tests passed, including the
  new deferred-renderer network assertion and 1440 x 900 visual baseline.
