# Signal Atlas Interactive Concept

This is a dependency-free visual and interaction prototype for the **Helios-3 Expedition** vertical slice. It is intentionally implemented with plain HTML, CSS, and JavaScript so it can be reviewed immediately and then translated into the production React + Phaser stack.

## Run locally

From this directory:

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173` in a desktop browser. The design target is 1440 × 900 or larger.

## Demonstrated interactions

- Select agents in the left dock or on the map.
- Click any location, then dispatch the selected agent.
- Use the two mission-board tasks.
- Type natural-language commands in the bottom command desk.
- Open signal source records and pin evidence.
- Enter the Archive, consult Professor Vale, convene a meeting, and commit a simulated forecast.
- Pause the world, change speed, or use keyboard shortcuts: `M` for weather, `O` for archive, `Esc` to close, and `Cmd/Ctrl + K` for archive search.

## Review URLs

- World: `/?animate=0`
- World with toast: `/?animate=0&toast=1`
- Archive: `/?panel=archive&animate=0`
- Professor: `/?panel=professor&animate=0`
- Meeting: `/?panel=meeting&animate=0`
- Forecast: `/?panel=forecast&animate=0`
- Source inspector: `/?panel=source&animate=0`

## Boundaries

The prototype uses a fictional market and fixture records. It does not connect to Codex, Pref MCP, a prediction-market venue, wallets, or real-money execution. Those production interfaces are specified in the architecture documents and JSON Schemas elsewhere in this package.
