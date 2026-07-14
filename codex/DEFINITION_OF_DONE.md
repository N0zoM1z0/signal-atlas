# Definition of Done

## Repository-wide gate

A milestone is complete when all applicable items below are true.

### Product

- The implemented behavior matches the design documents and task acceptance criteria.
- The world remains the primary visual surface.
- The user can understand what changed and why.
- No real-money market action exists.

### Domain correctness

- Authoritative changes are represented as domain events.
- Events replay to the same projection hash.
- Commands are validated and idempotent.
- Agent knowledge is explicit.
- Source, claim, signal, and belief objects remain distinct.

### Agent runtime

- Outputs conform to the current JSON Schema.
- Source references are validated.
- Illegal actions cannot mutate state.
- Timeout, invalid output, and unavailable runtime paths are recoverable.
- Scripted fixture driver still works.

### Pref integration

- Calls use the Pref Gateway.
- Unknown tools are denied.
- Provenance, retrieval time, and response hash are stored.
- Stale and unavailable states are visible.
- No secret appears in logs or UI.

### UI and visual quality

- Reference viewport is visually polished.
- World, Archive, Professor, and Forecast Commit screenshots are reviewed.
- No clipped text, overlapping controls, accidental scrollbars, or blurry pixel scaling.
- Loading and error states are implemented.
- Reduced-motion mode is respected.

### Accessibility

- Keyboard-only flow works.
- Focus is visible and logical.
- Canvas interactions have DOM equivalents.
- State does not rely on color alone.
- Core text is readable at 200% zoom.

### Validation

- Typecheck passes.
- Lint passes.
- Unit tests pass.
- Integration tests pass.
- Build passes.
- Relevant Playwright tests pass.
- Screenshot baselines are intentionally updated and reviewed.

### Documentation

- Contracts and schemas match implementation.
- New configuration is documented.
- Architectural decisions are recorded.
- Worklog lists files changed, commands run, and remaining risks.

### Operational

- `pnpm dev` starts the local experience.
- Fixture mode works with Pref and Codex disabled.
- Diagnostics clearly identify missing runtime dependencies.
- Local services bind to localhost by default.
