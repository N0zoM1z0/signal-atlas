# Signal Atlas offline demo script

## Setup

1. Start explicitly in offline fixture/scripted mode so a previous live-integration shell cannot change the demo:

   ```bash
   unset SIGNAL_ATLAS_PREF_MODE SIGNAL_ATLAS_PREF_BEARER_TOKEN SIGNAL_ATLAS_CODEX_MODE
   pnpm dev
   ```

   Open `http://127.0.0.1:4173` at 1440 × 900.

2. Keep sound off for a silent demo, or enable it once to demonstrate the opt-in synthesized cues.
3. For recording, use `/?capture=1`; for a narrated product walkthrough, use the ordinary URL so the first-expedition guide remains visible.

## Six-minute walkthrough

### 0:00 — Explain the world

Point out the fictional-market label, current public/team probabilities, six-place map, three agent roles, source-linked signal rail, and command desk. Say: “Research is geography here: agents travel to the places where evidence lives.”

### 0:45 — Dispatch Mira

Select Mira, leave “Check latest weather at Galehaven Weather Tower” in the command field, choose **Dispatch**, inspect the bounded draft, and confirm it. Use **Skip travel** if the demo must stay short. Let the authoritative travel/work/signal cues finish.

Open the new crosswind signal. Show its source class, retrieved/observed times, Pref primitive, response hash, reliability, freshness, and bounded medium impact range. Emphasize that the fictional forecast does not change merely because a source arrived.

### 2:00 — Establish a base rate

Select Orin and dispatch “Search historical delays in Archive Quarter.” Open Archive with `A`, search for “crosswind,” compare the archive source with its derived signal, and add the record to the case-file tray.

### 3:15 — Ask a bounded question

Open Professor with `P`, select the weather and archive evidence, choose **Correlation check**, and ask whether the signals are independent. Show the explicit evidence used, assumptions, limitations, and suggested next question. Professor Vale cannot introduce hidden sources.

### 4:10 — Commit judgment

Open Forecast with `C`. Set your player forecast to 48% yes, link both evidence signals, write a public rationale, and commit. Point to the separate initial and revised forecasts: evidence and judgment remain distinct.

### 5:00 — Resolve and replay

Open Replay with `R`, resolve the authored fixture, and scrub the event sequence. Jump between the source, signal, forecast, resolution, and Brier-score landmarks. Export the public case file and note that private forecast memos are excluded.

## Trust close

- The experience is fictional and contains no trading, betting, payment, order, or market-write path.
- Fixture mode is fully offline; local Codex and live Pref are optional, boundary-labeled paths.
- Phaser presents the world but never owns authority. Commands become validated events, and replay verifies the final projection hash.
- Every visual and sound element used by the runtime demo/capture is original or programmatic; capture mode removes debug UI without removing provenance or runtime truth.
