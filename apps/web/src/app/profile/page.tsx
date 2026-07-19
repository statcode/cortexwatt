"use client";

/** Profile — radar, CI trend, ratings with uncertainty, recent sessions. */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_META, type GameId } from "@cortexwatt/core";
import { api, hasToken, setToken, type MeSummary } from "@/lib/api";
import { CortexRadar } from "@/components/CortexRadar";
import { DomainChip } from "@/components/DomainChip";
import { DOMAIN_LABEL, DOMAIN_ORDER } from "@/lib/domains";
import { getPrefs, setPref, type Prefs } from "@/lib/prefs";

function CiSparkline({ history }: { history: { value: number; at: string }[] }) {
  if (history.length < 2) return null;
  const W = 280;
  const H = 60;
  const vals = history.map((h) => h.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(1, hi - lo);
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * (W - 8) + 4},${H - 8 - ((v - lo) / span) * (H - 16)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-xs">
      <polyline points={pts} fill="none" stroke="var(--color-pine)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    setPrefs(getPrefs());
    api.summary().then(setSummary).catch(() => {});
  }, [router]);

  if (!summary) return <p className="mt-10 text-sm text-ink/50">Loading…</p>;

  const ratings = Object.fromEntries(
    summary.ratings.map((r) => [r.domain, { rating: r.rating, rd: r.rd }]),
  );

  return (
    <div className="mx-auto mt-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display text-3xl font-semibold">{summary.handle}</h1>
          {summary.cortex_index !== null && (
            <p className="num mt-1 text-pine">Cortex Index {summary.cortex_index}</p>
          )}
        </div>
        <button
          onClick={() => {
            setToken(null);
            router.push("/login");
          }}
          className="text-sm text-ink/45 hover:underline"
        >
          Sign out
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="tile flex items-center justify-center">
          <CortexRadar ratings={ratings} size="md" />
        </div>
        <div className="space-y-3">
          {summary.ci_history.length >= 2 && (
            <div className="tile">
              <p className="text-xs text-ink/50">Cortex Index trend</p>
              <CiSparkline history={summary.ci_history} />
            </div>
          )}
          {DOMAIN_ORDER.map((d) => {
            const r = ratings[d];
            return (
              <div key={d} className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 border border-ink/8">
                <span className="text-sm">{DOMAIN_LABEL[d]}</span>
                <span className="num text-sm font-semibold">
                  {r ? (
                    <>
                      {Math.round(r.rating)}
                      <span className="font-normal text-ink/35"> ± {Math.round(r.rd)}</span>
                    </>
                  ) : (
                    <span className="text-ink/35">unrated</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="display mt-10 text-xl font-semibold">Preferences</h2>
      <div className="mt-3 rounded-2xl border border-ink/8 bg-white">
        <label className="flex cursor-pointer items-center gap-4 px-5 py-4">
          <input
            type="checkbox"
            checked={prefs?.speedometer ?? false}
            onChange={(e) => setPrefs(setPref("speedometer", e.target.checked))}
            className="h-5 w-5 accent-[var(--color-pine)]"
          />
          <span className="flex-1">
            <span className="block font-medium">In-game speed gauge</span>
            <span className="block text-sm text-ink/55">
              A live gauge that starts sweeping the instant the stimulus appears and
              freezes at your reaction time. It stays idle while you wait, so it never
              hints at when the stimulus is coming.
            </span>
          </span>
        </label>
      </div>

      <h2 className="display mt-10 text-xl font-semibold">Recent sessions</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-ink/8 bg-white">
        {summary.recent_sessions.length === 0 && (
          <p className="p-6 text-center text-sm text-ink/45">No sessions yet.</p>
        )}
        {summary.recent_sessions.map((s) => (
          <div key={s.session_id} className="flex items-center gap-3 border-b border-ink/5 px-5 py-3 last:border-0">
            <span className="flex-1 text-sm font-medium">
              {GAME_META[s.game_id as GameId]?.name ?? s.game_id}
            </span>
            <DomainChip domain={GAME_META[s.game_id as GameId]?.domain ?? ""} />
            <span className="num w-16 text-right text-sm">
              {s.server_metrics ? `${Math.round(s.server_metrics.performance_index * 100)}%` : "—"}
            </span>
            <span
              className={`w-24 text-right text-xs ${
                s.status === "valid" ? "text-pine" : "text-ink/40"
              }`}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
