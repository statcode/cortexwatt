"use client";

/** Hidden dev page — 50 automated synthetic trials measuring loop timing
 * jitter (PRD §4.8). Sanity-checks the rAF pipeline on new machines. */

import { useState } from "react";
import { estimateRefresh } from "@cortexwatt/core";

interface Report {
  refresh_hz: number;
  refresh_interval_ms: number;
  trials: number;
  median_jitter_ms: number;
  p95_jitter_ms: number;
  max_jitter_ms: number;
  samples: number[];
}

async function runLatencyProbe(): Promise<Report> {
  const refresh = await estimateRefresh();
  const expected = refresh.interval_ms;
  const jitters: number[] = [];

  for (let i = 0; i < 50; i++) {
    // schedule a synthetic "stimulus paint" and measure frame-delta error
    const t0 = await new Promise<number>((r) => requestAnimationFrame(r));
    const t1 = await new Promise<number>((r) => requestAnimationFrame(r));
    jitters.push(Math.abs(t1 - t0 - expected));
  }

  const sorted = [...jitters].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  return {
    refresh_hz: refresh.hz,
    refresh_interval_ms: Math.round(expected * 100) / 100,
    trials: jitters.length,
    median_jitter_ms: Math.round(q(0.5) * 1000) / 1000,
    p95_jitter_ms: Math.round(q(0.95) * 1000) / 1000,
    max_jitter_ms: Math.round(sorted[sorted.length - 1]! * 1000) / 1000,
    samples: jitters.map((j) => Math.round(j * 1000) / 1000),
  };
}

export default function LatencyPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);

  return (
    <div className="mx-auto mt-10 max-w-lg">
      <h1 className="display text-2xl font-semibold">/dev/latency</h1>
      <p className="mt-1 text-sm text-ink/55">
        50 synthetic trials; reports rAF timing jitter against the estimated refresh interval.
      </p>
      <button
        disabled={running}
        onClick={async () => {
          setRunning(true);
          setReport(await runLatencyProbe());
          setRunning(false);
        }}
        className="mt-5 rounded-xl bg-lime px-6 py-2.5 font-semibold text-ink disabled:opacity-50"
      >
        {running ? "Running…" : "Run probe"}
      </button>

      {report && (
        <div className="num mt-6 space-y-1 rounded-2xl border border-ink/8 bg-white p-5 text-sm">
          <p>Display: {report.refresh_hz} Hz ({report.refresh_interval_ms} ms/frame)</p>
          <p>Trials: {report.trials}</p>
          <p>Median jitter: {report.median_jitter_ms} ms</p>
          <p>p95 jitter: {report.p95_jitter_ms} ms</p>
          <p>Max jitter: {report.max_jitter_ms} ms</p>
          <p className={report.p95_jitter_ms < 4 ? "text-pine" : "text-dom-decision"}>
            {report.p95_jitter_ms < 4
              ? "Timing pipeline looks healthy."
              : "High jitter — close other tabs / check throttling."}
          </p>
        </div>
      )}
    </div>
  );
}
