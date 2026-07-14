"use client";

import { SAMPLES, type DemoSample } from "./samples";

export function DemoLanding({ onChoose }: { onChoose: (sample: DemoSample) => void }) {
  return (
    <main id="main-content" className="landing">
      <section className="hero">
        <div>
          <p className="kicker">A debugger that refuses to spoil the lesson</p>
          <h1>Debug it yourself. We&apos;ll only ask questions.</h1>
        </div>
        <p className="hero-note">Run real Python in your browser, step through what actually happened, and climb a four-step hint ladder. No login. No code leaves your browser except as quoted tutor context.</p>
      </section>
      <section className="demo-banner" aria-label="Quick demo">
        <div><h2>New here? Break something on purpose.</h2><p>The first sample reaches an error, a trace, and your first Socratic question in one run.</p></div>
        <button className="button primary" onClick={() => onChoose(SAMPLES[0])}>Try a broken sample →</button>
      </section>
      <div className="sample-heading"><div><p className="kicker">Six tiny mysteries</p><h2>Choose a misconception</h2></div><span className="mono-label">all run locally</span></div>
      <div className="sample-list">
        {SAMPLES.map((sample, index) => (
          <button className="sample-card" key={sample.id} onClick={() => onChoose(sample)}>
            <span className="sample-number">0{index + 1}</span>
            <span><span className="kicker">{sample.eyebrow}</span><h3>{sample.title}</h3><p>{sample.discoveryGoal}</p></span>
            <span className="sample-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </main>
  );
}
