export function App() {
  return (
    <main className="loading-shell" aria-labelledby="signal-atlas-title">
      <section className="loading-card">
        <div className="atlas-mark" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">Local expedition runtime</p>
        <h1 id="signal-atlas-title">Signal Atlas</h1>
        <p className="tagline">Walk the world. Gather the signal. Price the future.</p>
        <div className="loading-line" role="status" aria-live="polite">
          <span className="loading-dot" aria-hidden="true" />
          Preparing the Helios-3 expedition
        </div>
      </section>
    </main>
  );
}
