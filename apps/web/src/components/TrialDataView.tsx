"use client";

/** "See every trial" — per-trial dot strip, RT histogram with median marked,
 * plain-language caption, exportable (design doc §7). Server data only. */

import { useEffect, useState } from "react";
import { api, type SessionDetail } from "@/lib/api";

const CORAL = "var(--color-dom-decision)";

export function TrialDataView({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);

  useEffect(() => {
    if (!open || detail) return;
    api.sessionDetail(sessionId).then(setDetail).catch(() => {});
  }, [open, detail, sessionId]);

  const rts = (detail?.trials ?? [])
    .filter((t) => !t.false_start && t.response_ms !== null)
    .map((t) => t.response_ms! - t.onset_ms);
  const maxRt = rts.length ? Math.max(...rts) * 1.15 : 1000;
  const sorted = [...rts].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
  const fastest10 = sorted.slice(0, 10);
  const fastestAvg = fastest10.length
    ? Math.round(fastest10.reduce((a, b) => a + b, 0) / fastest10.length)
    : null;

  // histogram
  const BINS = 14;
  const bins = new Array(BINS).fill(0) as number[];
  const lo = sorted[0] ?? 0;
  const hi = sorted[sorted.length - 1] ?? 1;
  const span = Math.max(1, hi - lo);
  rts.forEach((rt) => {
    bins[Math.min(BINS - 1, Math.floor(((rt - lo) / span) * BINS))]!++;
  });
  const maxBin = Math.max(1, ...bins);

  const W = 560;
  const H = 140;
  const trials = detail?.trials ?? [];

  function exportJson() {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cortexwatt-${detail.game_id}-${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm font-medium text-pine underline-offset-4 hover:underline"
      >
        {open ? "Hide trial data" : "See every trial"}
      </button>

      {open && detail && (
        <div className="mt-4 rounded-2xl border border-ink/8 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">
            Reaction time per trial
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
            <line x1="30" y1={H - 20} x2={W - 8} y2={H - 20} stroke="currentColor" opacity="0.15" />
            {median !== null && (
              <line
                x1="30"
                x2={W - 8}
                y1={H - 20 - (median / maxRt) * (H - 35)}
                y2={H - 20 - (median / maxRt) * (H - 35)}
                stroke="var(--color-pine)"
                strokeDasharray="4 4"
                opacity="0.5"
              />
            )}
            {trials.map((t, i) => {
              const x = 34 + (i / Math.max(1, trials.length - 1)) * (W - 50);
              if (t.false_start) {
                return <circle key={i} cx={x} cy={H - 28} r="4" fill={CORAL} />;
              }
              if (t.response_ms === null) {
                return (
                  <circle key={i} cx={x} cy={16} r="4" fill="none" stroke="currentColor" opacity="0.4" />
                );
              }
              const rt = t.response_ms - t.onset_ms;
              const y = H - 20 - (rt / maxRt) * (H - 35);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="4"
                  fill={t.correct ? "var(--color-pine)" : "none"}
                  stroke="var(--color-pine)"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>
          <p className="mt-1 text-xs text-ink/45">
            Hollow = miss · <span style={{ color: CORAL }}>coral</span> = false start · dashed line =
            median
          </p>

          {rts.length >= 4 && (
            <>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-ink/45">
                RT distribution
              </p>
              <svg viewBox={`0 0 ${W} 90`} className="mt-2 w-full">
                {bins.map((b, i) => {
                  const bw = (W - 40) / BINS;
                  const h = (b / maxBin) * 60;
                  return (
                    <rect
                      key={i}
                      x={30 + i * bw + 1}
                      y={70 - h}
                      width={bw - 2}
                      height={h}
                      rx="2"
                      fill="var(--color-pine)"
                      opacity="0.55"
                    />
                  );
                })}
                {median !== null && (
                  <line
                    x1={30 + ((median - lo) / span) * (W - 40)}
                    x2={30 + ((median - lo) / span) * (W - 40)}
                    y1="4"
                    y2="74"
                    stroke="var(--color-ink)"
                    strokeWidth="1.5"
                  />
                )}
                <text x="30" y="86" fontSize="10" fill="currentColor" opacity="0.5" className="num">
                  {Math.round(lo)} ms
                </text>
                <text x={W - 10} y="86" fontSize="10" fill="currentColor" opacity="0.5" textAnchor="end" className="num">
                  {Math.round(hi)} ms
                </text>
              </svg>
            </>
          )}

          {fastestAvg !== null && (
            <p className="num mt-4 text-sm text-ink/65">
              Your fastest {fastest10.length} trials averaged {fastestAvg} ms.
            </p>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-ink/45">
            <button onClick={exportJson} className="font-medium text-pine hover:underline">
              Export JSON
            </button>
            {detail.device?.refresh_hz && (
              <span className="num">Display {detail.device.refresh_hz} Hz</span>
            )}
            {detail.device?.input_type && <span>{detail.device.input_type}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
