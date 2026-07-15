# Preference Capability Audit and Integration Feedback

## Purpose

This document records the 2026-07-15 audit of Preference capabilities that could support richer
Signal Atlas prediction-market worlds. It separates four states that must not be conflated:

1. a package exists in the Preference source checkout;
2. a capability has a public catalog record;
3. the hosted `call_tool` path executes successfully;
4. Signal Atlas has an approved canonical mapping, response adapter, and mission route for it.

The audit was read-only. It did not modify Preference, expose credentials, retain authorization
material, print raw provider bodies, or cache source content. Hosted probes used exact catalog
lookups and bounded harmless calls through the required local network proxy.

## Audited baselines

- Signal Atlas repository: current `main` after the durable-workspace milestones.
- Preference local checkout: `/home/pentester/Project/mmore/preference`, HEAD `cc3e0773ce` from
  2026-07-07. The checkout had unrelated untracked files and was treated as read-only.
- Preference public catalog snapshot:
  `MCP/shared/src/public-catalog-snapshot.generated.json`, generated
  `2026-06-16T10:06:03.099382+00:00`.
- Hosted Preference facade: the server-only endpoint already configured in the ignored Signal Atlas
  environment. No endpoint credential or generated connection URL is recorded here.

Catalog snapshot summary:

| Property                                                         | Count |
| ---------------------------------------------------------------- | ----: |
| Provider capability records                                      |   547 |
| `task_support: forbidden`                                        |   526 |
| `task_support: optional`                                         |    21 |
| `side_effect: read_only` and `readOnlyHint: true`                |   541 |
| Non-empty output schema                                          |   541 |
| Closed input schema (`additionalProperties: false`)              |   542 |
| Closed output schema (`additionalProperties: false`)             |   417 |
| Records classified `external_write` with no usable output schema |     6 |

The six rejected records are:

- `search.search_news_multi`;
- `worldbank.search_indicators`;
- `polymarket.data.get_market_full_context`;
- `polymarket.data.get_prices`;
- `polymarket.subgraph.query_markets`;
- `polymarket.comments.get_comments`.

Their names and package implementations describe reads, but the public records omit the expected
read-only annotations, classify them as external writes, and expose an empty output schema. Signal
Atlas is correct to reject those records until the catalog is repaired.

## Critical finding: `task_support` is not a side-effect policy

Implementation status: Signal Atlas fixed this finding in `f38b46b`. Capability-map v3 declares
`executionMode: synchronous`, accepts `forbidden | optional`, and fails closed on `required`, missing,
or unknown task policy. A subsequent exact-catalog and one-record metadata-only live smoke passed,
so the GDELT `search_sources` mapping is now enabled. The historical audit below records the defect
as it existed when discovered.

Signal Atlas currently treats Preference `security_hints.task_support` as an execution-safety
property. That interpretation is incorrect.

Preference defines the field as MCP Tasks lifecycle compatibility, not whether ordinary synchronous
execution is allowed:

- `required`: the tool must carry task support metadata;
- `optional`: task support may be present;
- `forbidden`: the tool must not carry task support metadata, which is also the default for unknown
  tools.

`MCP/shared/src/search-tools-contract.manifest.json` is even more explicit: the field describes MCP
Tasks only, and catalog targets should execute through `call_tool` unless authentication, cost, or
input validation rejects them.

Signal Atlas instead:

- limits `requiredSecurityHints.taskSupport` to `optional | required` in
  `packages/pref-gateway/src/capability-map.ts`;
- requires exact equality in `mappingMatchesContract()`;
- configures GDELT as `optional`, while Preference reports `forbidden`;
- leaves the GDELT mapping disabled and documents the mismatch as if the provider tool were unsafe
  or uncallable.

This error would exclude 526 of the 547 catalog records even though 541 records independently report
read-only semantics.

### Live proof

The hosted facade returned the following exact contract for
`gdelt.context.search_context`:

- provider server `gdelt_context`;
- strict required `query` argument;
- `readOnlyHint: true`;
- `side_effect: read_only`;
- `task_support: forbidden`;
- structured `articles`, query, request count, and total count output.

A synchronous `call_tool` request with a three-record limit then succeeded and returned three
records, each with a URL, title, matched sentence, domain, and timestamp. No article text or raw
payload was retained. This proves that `forbidden` did not forbid the synchronous provider call.

### Required Signal Atlas correction

For the existing synchronous wrapper path:

- keep `annotations.readOnlyHint === true`;
- keep `annotations.destructiveHint === false`;
- keep `security_hints.side_effect === read_only`;
- keep strict input/output schema matching, exact provider identity, bounded response size, timeout,
  call budget, and rights policy;
- treat `task_support: forbidden` as **synchronous-only**, not unsafe;
- treat `task_support: optional` as synchronously callable;
- reject or separately implement `task_support: required` until Signal Atlas supports the MCP Tasks
  lifecycle.

The clean mapping field is an execution compatibility declaration such as
`executionMode: synchronous`, not an exact expected task-support value masquerading as a security
hint.

## Hosted read-only probe matrix

Only sanitized contract fields and aggregate results were recorded.

| Capability                                 | Catalog contract                       | Synchronous result                                                                     | Audit conclusion                                                                       |
| ------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `weather.get_current_conditions`           | Read-only, strict, task optional       | Already valid in the running Signal Atlas mapping                                      | Usable now for disclosed current-condition context                                     |
| `gdelt.context.search_context`             | Read-only, strict, task forbidden      | Success; three bounded article metadata records                                        | Usable now for `search_sources` after the Signal task-policy fix                       |
| `polymarket.discovery.search_markets`      | Read-only, open output, task forbidden | Success; three bounded market records                                                  | Adapter implemented, but mapping denied until the output contract is closed            |
| `resolution.get_registry_stats`            | Read-only, strict, task forbidden      | Success; 108 markets across 8 reference classes                                        | Usable now as typed archive/base-rate context                                          |
| `resolution.search_historical_resolutions` | Read-only, strict, task forbidden      | Success; 3 bounded records from a 50-record reference class in about 10.2 seconds      | Enabled as canonical `search_resolution_history` after strict adapter validation       |
| `fred.get_series`                          | Read-only, strict, task forbidden      | Failed with sanitized `missing_credentials`: hosted FRED provider lacks `FRED_API_KEY` | Advertised but not operational; do not enable until deployment and catalog truth agree |

The FRED record says `requires_auth: false`, `requires_billing: false`, and
`requires_provider_transport: false`, yet the hosted execution requires a provider key that is not
configured. A consumer cannot infer this failure from discovery. Catalog presence is therefore not
currently proof of deploy-time callability.

## Capability inventory for richer worlds

### News and source retrieval

#### Strong now: GDELT Context

`gdelt.context.search_context` is the best immediate `search_sources` candidate. Its result contains
stable external URLs plus title, domain, timestamp, matched sentence, and context. The current Signal
Atlas `article_search_v1` adapter already matches that output shape and conservatively stores only
metadata when content rights are unknown.

Limitations:

- it is a sentence-level context search, not a full document reader;
- query semantics require all terms in the same sentence;
- it is most useful for recent reporting rather than durable official records;
- a result URL still needs a separate rights-aware reader to support source inspection beyond
  metadata.

#### Blocked: aggregate news search

`MCP/mcp-search-toolkit/src/tools.ts` defines `search_news_multi` with strict schemas and shared
read-only annotations. The public catalog record is stale: `external_write`, missing read-only
annotations, and empty output schema. It must remain denied until Preference regenerates correct
metadata and a hosted smoke proves the normalized response.

#### Missing product primitive: safe URL read

Signal Atlas has a canonical `read_source` request, but no safe live provider mapping. The
Preference search toolkit implements `exa_url2text`, yet it has no usable public capability record.

A production URL reader should provide:

- an SSRF-safe allow/deny policy and DNS/IP revalidation;
- redirect, response-byte, timeout, and content-type limits;
- canonical final URL and stable external identity;
- title, publisher, publication/observation time, media type, and content hash;
- bounded text/excerpt or metadata-only output;
- robots, license, display-rights, and retention metadata;
- explicit failure classes for inaccessible, unsupported, paywalled, or disallowed content.

This is the most important missing Preference primitive for Signal Atlas provenance.

### Weather, climate, and hazards

The weather toolkit exposes 16 cataloged, strict, read-only capabilities, including:

- current conditions;
- forecast and historical conditions;
- alerts, minutely precipitation, route conditions, flood and marine forecasts;
- air quality, UV, pollen, astronomy, and climate projections;
- geocode and reverse geocode.

NOAA exposes another 46 read-only catalog records for points, stations, forecasts, alerts, zones,
geometry, observations, and deterministic weather bundles. Most say `task_support: forbidden`,
which is compatible with the synchronous path after the Signal correction.

The Natural Disaster Toolkit implements earthquake, cyclone, flood, wildfire, volcano, tsunami, and
multi-hazard operations, but its public catalog entries remain deferred for metadata. It should not
be assumed callable until exact records and hosted smokes exist.

Recommended Signal capabilities:

- `conditions_current`;
- `conditions_forecast`;
- `conditions_historical`;
- `weather_alerts`;
- `climate_projection`;
- `hazard_events`.

Each normalizes typed observations into canonical source records with source-specific freshness.

### Prediction-market discovery and resolution

Preference already has useful read-only research surfaces that do not expose trading:

- `polymarket.discovery.search_markets` and related summary/price-enriched discovery tools;
- `polymarket.discovery.get_resolution_tracker`;
- `kalshi.core.search_markets` and market-detail/resolution reads;
- `resolution.search_historical_resolutions`;
- `resolution.list_reference_classes` and `resolution.get_registry_stats`.

Signal Atlas should prefer these discovery and resolution packages over the six stale thin records
currently labeled `external_write`. The hosted Polymarket search and resolution statistics probes
both succeeded despite `task_support: forbidden`. The exact
`resolution.search_historical_resolutions` contract and a bounded three-record hosted invocation
also passed; Signal Atlas now enables that capability with metadata-only canonical sources and an
aggregate base-rate evidence record. Polymarket remains disabled because its catalog output schema
is open at both the root and result-row levels, so a consumer cannot prove complete response shape
compatibility before dispatch.

Recommended canonical capabilities:

- `search_markets`;
- `read_market`;
- `read_market_history`;
- `search_resolution_history`.

These are read-only context for creating or researching expeditions. They must never import order,
portfolio, wallet, relayer, market-execution, or trading capabilities into the game runtime.

### Economics and official statistics

FRED has 51 catalog records for series discovery/read, vintages, releases, regional data, inflation,
employment, GDP, housing, yield curves, and economic dashboards. This is an excellent fit for a
central-bank or macro-policy world, but the hosted provider currently fails because its FRED key is
missing.

World Bank source code defines `search_indicators` with a real output schema and shared read-only
annotations. Its public record is one of the six stale `external_write` entries and exposes no output
contract. Even after that record is fixed, Signal Atlas needs an indicator data read, not only an
indicator-name search.

Recommended canonical capabilities:

- `search_economic_series`;
- `read_economic_series`;
- `read_release_calendar`.

The normalized result should retain series identity, units, frequency, observation/vintage/retrieval
times, source organization, revision status, and a bounded set of observations. A revision should
supersede an older source version rather than overwrite it.

### Politics, law, and elections

Preference source contains Congress, Federal Register, CourtListener, OpenFEC, Treasury, BLS, and
SEC-oriented implementations or probes. Current public readiness is uneven:

- Congress bill search/status/detail tools exist but are deferred as `metadata_pending`;
- some broader official-record probes live under an experimental market-intelligence package;
- OpenFEC campaign-finance data cannot substitute for verified election results;
- no dependable official vote-count, election-result, or polling capability was identified.

Recommended canonical capability:

`search_official_records` with a closed `recordClass` such as `legislation`, `regulation`, `court`,
`campaign_finance`, `filing`, `labor`, or `treasury`. Provider mappings remain declarative; Signal
Atlas should not create a service per agency.

An election world should remain fixture/historical until an official results source with timestamps,
jurisdiction, reporting completeness, correction/version semantics, and resolution provenance is
available.

### Science, space, and literature

ArXiv exposes three mature, strict, read-only, task-optional capabilities for query construction,
paper search, and recent papers. These are suitable for a literature-search adapter and a research
milestone world.

NASA has a substantial implementation in the local source checkout but remains catalog-deferred.
GDELT DOC and dedicated geospatial places/maps are similarly implemented but not safely public through
exact catalog records today.

Recommended canonical capabilities:

- `search_scientific_literature`;
- `read_scientific_record`;
- `geocode_location`.

### Sports, aviation, and geospatial events

- The sports statistics package exists and covers multiple leagues, but it is absent from the public
  capability snapshot. A sports world should stay fixture-first until catalog and live readiness are
  proven.
- FAA NASSTATUS and aviation primitives have cataloged read-only records and can support airport or
  flight-disruption context.
- ADS-B, dedicated places search, and maps/imagery packages exist but remain catalog-deferred or need
  a narrower approved live surface.

Recommended canonical capabilities:

- `aviation_status`;
- `sports_event_state`;
- `geocode_location`.

### Deterministic analysis tools are not sources

Probability-model, statistical, temporal, causal, arbitrage, and market-intelligence primitives can
help Professor Vale compare evidence or compute bounded diagnostics. They do not independently
observe the external world and should not be normalized as new `SourceRecord` identities.

Signal Atlas needs a separate typed analysis-result boundary that records:

- analysis capability and version;
- exact input source/signal IDs;
- arguments and result hashes;
- deterministic output fields;
- assumptions and limitations;
- creation time and actor.

The analysis result may support a derived claim only when that claim cites the underlying source IDs.

## Required Signal Atlas integration work

### 1. Correct synchronous task compatibility

Remove exact `optional|required` matching from the safety gate, represent synchronous compatibility
explicitly, enable the GDELT mapping, and add contract tests proving that:

- read-only + task forbidden is valid for a synchronous mapping;
- read-only + task optional is valid;
- task required fails until a task-capable transport is implemented;
- external-write, destructive, unknown-schema, provider/server mismatch, extra required arguments,
  and response-shape drift still fail closed.

### 2. Route missions by canonical capability

`PrefAgentProxyDriver` currently intercepts only `observe_conditions`. New mappings alone do not make
agents use them.

The provider-neutral flow should be:

1. the orchestrator selects a canonical capability permitted by the place and mission;
2. the Pref Gateway executes the selected approved mapping and creates canonical source IDs;
3. the current-turn evidence packet contains only those bounded canonical records;
4. Codex may cite only those IDs and propose claims/signals;
5. runtime/world validation materializes events; the model never invents source identities.

Provider differences remain in mappings and bounded response adapters, not in per-provider agent
drivers or microservices.

### 3. Add a small adapter family

Implementation status: the first bounded family now includes article search, market summary,
resolution history, economic-series discovery, and full-series read adapters. Only GDELT and
Resolution are live-enabled. Polymarket is blocked by its open output schema, while FRED is blocked
by hosted provider-secret readiness. Contract tests preserve those distinctions instead of treating
an implemented parser as deployment eligibility.

Recommended initial adapters:

- `article_search_v1` for GDELT-like article metadata;
- `market_search_v1` for bounded read-only market summaries;
- `resolution_history_v1` for resolved-market/reference-class records;
- `economic_series_v1` for typed observations and vintages;
- `academic_search_v1` for paper metadata;
- `official_record_v1` for versioned official documents;
- `sensor_observation_v1` for weather/NOAA/aviation observations.

Every adapter must define rights/retention policy, stable source identity, record limits, freshness,
and output-schema matching. Do not accept arbitrary JSONPath or executable transforms in the mapping
file.

## Feedback for the Preference team

### P0 - Correct catalog truth

1. Regenerate the six read-looking records currently classified `external_write` from their actual
   tool definitions, annotations, and output schemas.
2. Configure the hosted FRED provider secret or mark the affected capabilities unavailable before
   discovery. `requires_auth: false` should not imply operational readiness when an internal provider
   key is missing.
3. Add catalog callability/deployment health distinct from package stability, for example
   `ready | degraded | unavailable`, provider-secret readiness, and timestamp/result of the latest
   harmless smoke.
4. Expose the meaning of `task_support` prominently in exact `search_tools` results or recovery
   guidance. It currently invites clients to confuse task augmentation with side-effect safety.

### P1 - Eliminate generator drift

`scripts/generate-public-mcp-catalog.ts` says enriched records come from the existing snapshot, then
reads `provider_capability_records` from that artifact and serializes them again. Runtime refs are
checked for presence, rejection, or deferral, but annotations and schemas are not regenerated from
the current package `ToolDefinition`.

That allows source definitions such as `search_news_multi` and `worldbank.search_indicators` to be
strict/read-only while their public records remain external-write/empty-schema indefinitely.

The generator should derive capability records from current registered tool definitions, or at
minimum fail CI when source annotations/input/output schemas disagree with the snapshot.

### P1 - Expose a safe source reader

Promote a narrowly secured URL-to-source operation with the provenance, SSRF, redirect, byte, time,
content-type, rights, and retention constraints listed above. This unlocks real source inspection
without asking each downstream product to build a crawler.

### P1 - Promote high-value read packages

Prioritize exact public records and hosted smokes for:

- Congress and official records;
- GDELT DOC;
- natural-disaster events;
- geospatial places;
- NASA;
- sports statistics.

Promotion should be selective and evidence-backed. A small read-only subset with strict schemas is
more useful than advertising an entire family with ambiguous availability.

### P2 - Standardize a source/evidence envelope

Where provider semantics allow, return consistent fields for stable external ID, canonical URL,
title, publisher, author, published/observed/retrieved timestamps, location, media type, bounded
excerpt/structured data, content hash inputs, and rights/license/retention policy. Signal Atlas can
still use provider-specific adapters, but a shared envelope reduces drift and makes provenance easier
to preserve.

### P2 - Fill official election-result coverage

Campaign-finance and market data are not official election results. A useful election capability
needs jurisdiction, contest identity, reporting units, completeness, timestamps, correction/version
history, source authority, and an explicit final/certified state.

## Recommended integration order

1. Fix Signal Atlas task-support semantics and enable GDELT `search_sources`.
2. Extend the agent proxy into provider-neutral canonical mission routing.
3. Add read-only market search and resolution-history adapters using the two hosted paths already
   proven callable.
4. Repair Preference FRED deployment/catalog truth, then add economic-series adapters for the macro
   scenario.
5. Add the safe URL reader so returned metadata can become inspectable source records under explicit
   rights.
6. Promote one official-record family and use the civic scenario as its end-to-end acceptance test.
7. Add analysis primitives through a separate derived-analysis contract, not as external sources.

## Security and product boundary

All proposed integrations remain read-only and simulation-first. Signal Atlas should continue to
deny Preference trading, execution, relayer, portfolio, wallet, order, and write-capable tools even
when those tools exist in the same hosted catalog.

No real trading path, order placement, wallet operation, or automatic market execution was added or
recommended by this audit.
