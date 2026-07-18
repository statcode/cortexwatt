"use client";

/** Results screen — score count-up, three metric tiles with 30-day deltas,
 * rating pill with uncertainty hint, trial-data expander (design doc §6). */

import { useEffect, useState } from "react";
import type { SessionMetrics } from "@cortexwatt/core";
import type { MeSummary, SubmitResult } from "@/lib/api";
import { DOMAIN_LABEL } from "@/lib/domains";
import { TrialDataView } from "./TrialDataView";

function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(value);
      return;
    }
    const start = performance.now();
    const dur = 900;
    let raf: number;
    const tick = (t: number) => {
      const f = Math.min(1, (t - start) / dur);
      setV(Math.round(value * (1 - Math.pow(1 - f, 3))));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="num">{v}</span>;
}

function Delta({ value, unit, goodWhenLower = false }: { value: number | null; unit: string; goodWhenLower?: boolean }) {
  if (value === null) return <span className="text-xs text-ink/35">no 30-day baseline yet</span>;
  const good = goodWhenLower ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`num text-xs ${good ? "text-pine" : "text-ink/45"}`}>
      {sign}
      {unit === "%" ? Math.round(value * 100) : Math.round(value)}
      {unit} vs your 30-day average
    </span>
  );
}

export function Results({
  gameId,
  domain,
  result,
  clientMetrics,
  summary,
  sessionId,
  onNext,
  nextLabel,
  onReplay,
}: {
  gameId: string;
  domain: string;
  result: SubmitResult;
  clientMetrics: SessionMetrics;
  summary: MeSummary | null;
  sessionId: string;
  onNext: () => void;
  nextLabel: string;
  onReplay?: () => void;
}) {
  const m = result.server_metrics ?? clientMetrics;
  const avg = summary?.thirty_day_averages[gameId];

  if (result.status !== "valid") {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h1 className="display text-2xl font-semibold">Session not counted</h1>
        <p className="mt-2 text-ink/60">
          This session couldn&apos;t be validated and won&apos;t count.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {onReplay && (
            <button onClick={onReplay} className="rounded-full bg-lime px-6 py-2 font-semibold text-ink">
              Play again
            </button>
          )}
          <button onClick={onNext} className="rounded-full border border-ink/20 px-6 py-2">
            {nextLabel}
          </button>
        </div>
      </div>
    );
  }

  const ratingChange = result.rating_change ?? 0;
  const accDelta = avg?.accuracy !== undefined ? m.accuracy - avg.accuracy : null;
  const rtDelta =
    avg?.median_rt_ms !== undefined && m.median_rt_ms !== null && avg.median_rt_ms !== null
      ? m.median_rt_ms - (avg.median_rt_ms as number)
      : null;
  const iqrDelta =
    avg?.rt_iqr_ms !== undefined && m.rt_iqr_ms !== null && avg.rt_iqr_ms !== null
      ? m.rt_iqr_ms - (avg.rt_iqr_ms as number)
      : null;

  return (
    <div className="mx-auto mt-10 max-w-2xl">
      <div className="text-center">
        <p className="text-sm text-ink/50">Session score</p>
        <p className="display num mt-1 text-6xl font-semibold">
          <CountUp value={result.display_score ?? 0} />
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span
            className={`num rounded-full px-3 py-1 text-sm font-semibold ${
              ratingChange >= 0 ? "bg-lime/70 text-ink" : "bg-ink/8 text-ink/70"
            }`}
          >
            {ratingChange >= 0 ? "+" : ""}
            {Math.round(ratingChange)} {DOMAIN_LABEL[domain]}
          </span>
          {result.new_rd !== null && (
            <span className="num text-xs text-ink/40">± {Math.round(result.new_rd)} uncertainty</span>
          )}
          {result.leaderboard_rank !== null && (
            <span className="num text-xs text-ink/40">· #{result.leaderboard_rank} this week</span>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="tile">
          <p className="text-xs text-ink/50">Accuracy</p>
          <p className="display num mt-1 text-2xl font-semibold">{Math.round(m.accuracy * 100)}%</p>
          <Delta value={accDelta} unit="%" />
        </div>
        <div className="tile">
          <p className="text-xs text-ink/50">Median speed</p>
          <p className="display num mt-1 text-2xl font-semibold">
            {m.median_rt_ms !== null ? `${Math.round(m.median_rt_ms)} ms` : "—"}
          </p>
          <Delta value={rtDelta} unit=" ms" goodWhenLower />
        </div>
        <div className="tile">
          <p className="text-xs text-ink/50">Consistency</p>
          <p className="display num mt-1 text-2xl font-semibold">
            {m.rt_iqr_ms !== null ? `${Math.round(m.rt_iqr_ms)} ms` : "—"}
          </p>
          {/* small horizontal band motif — instrument heritage, flat */}
          {m.rt_iqr_ms !== null && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-ink/8">
              <div
                className="h-1.5 rounded-full bg-pine"
                style={{ width: `${Math.max(6, Math.min(100, 100 - m.rt_iqr_ms / 3))}%` }}
              />
            </div>
          )}
          <Delta value={iqrDelta} unit=" ms" goodWhenLower />
        </div>
      </div>

      {result.cortex_index !== null && (
        <p className="num mt-4 text-center text-sm text-ink/50">
          Cortex Index {result.cortex_index} · next level {result.next_difficulty}
        </p>
      )}

      <TrialDataView sessionId={sessionId} />

      <div className="mt-8 flex justify-center gap-3">
        {onReplay && (
          <button onClick={onReplay} className="rounded-full border border-ink/20 px-6 py-2">
            Play again
          </button>
        )}
        <button onClick={onNext} className="rounded-full bg-lime px-8 py-2 font-semibold text-ink">
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
