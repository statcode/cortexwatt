"use client";

/** Daily workout — chains 3 games, most-uncertain domains first (PRD §11). */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_META, type GameId } from "@cortexwatt/core";
import { api, hasToken, type MeSummary } from "@/lib/api";
import { DomainChip } from "@/components/DomainChip";
import { GameChain, type ChainResult } from "@/components/GameChain";
import { GameGlyph } from "@/components/GameGlyph";
import { DOMAIN_LABEL } from "@/lib/domains";
import { planGames } from "@/lib/recommend";

export default function WorkoutPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [phase, setPhase] = useState<"plan" | "running" | "done">("plan");
  const [results, setResults] = useState<ChainResult[]>([]);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    api.summary().then(setSummary).catch(() => {});
  }, [router]);

  if (!summary) return <p className="mt-10 text-sm text-ink/50">Loading…</p>;

  // Recommendation: least-certain (highest-RD) domains first, one game per domain.
  const plan = planGames(summary.games, 3).map((g) => g.id as GameId);

  if (phase === "running")
    return (
      <GameChain
        gameIds={plan}
        onFinished={(r) => {
          setResults(r);
          setPhase("done");
        }}
      />
    );

  if (phase === "done") {
    const totalScore = results.reduce((a, r) => a + (r.result.display_score ?? 0), 0);
    const lastCi = results.at(-1)?.result.cortex_index ?? null;
    return (
      <div className="mx-auto mt-12 max-w-md text-center">
        <h1 className="display text-3xl font-semibold">Workout complete</h1>
        <p className="display num mt-4 text-5xl font-semibold">{totalScore}</p>
        <p className="mt-1 text-sm text-ink/50">combined session score</p>
        {lastCi !== null && <p className="num mt-2 text-sm text-pine">Cortex Index {lastCi}</p>}
        <div className="mt-6 space-y-2 text-left">
          {results.map((r) => (
            <div key={r.sessionId} className="tile flex items-center gap-3">
              <GameGlyph gameId={r.gameId} domain={GAME_META[r.gameId].domain} size={32} />
              <span className="flex-1 font-medium">{GAME_META[r.gameId].name}</span>
              {r.result.status === "valid" ? (
                <span className="num text-sm">
                  {r.result.display_score}
                  <span className="text-ink/40">
                    {" "}
                    · {r.result.rating_change !== null && r.result.rating_change >= 0 ? "+" : ""}
                    {Math.round(r.result.rating_change ?? 0)}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-ink/40">not counted</span>
              )}
            </div>
          ))}
        </div>
        <Link
          href="/train"
          className="mt-8 inline-block rounded-full bg-lime px-8 py-2.5 font-semibold text-ink"
        >
          Back to Train
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <h1 className="display text-3xl font-semibold">Today&apos;s workout</h1>
      <p className="mt-1 text-ink/60">
        Three games, ~5 minutes. Ordered by where your ratings are least certain.
      </p>
      <div className="mt-6 space-y-3">
        {plan.map((id, i) => {
          const meta = GAME_META[id];
          const g = summary.games.find((x) => x.id === id)!;
          return (
            <div key={id} className="tile flex items-center gap-4">
              <span className="num text-sm text-ink/35">{i + 1}</span>
              <GameGlyph gameId={id} domain={meta.domain} size={36} />
              <div className="flex-1">
                <p className="font-semibold">{meta.name}</p>
                <DomainChip domain={meta.domain} />
              </div>
              <span className="num text-xs text-ink/40">
                {g.rd !== null ? `± ${Math.round(g.rd)}` : "unrated"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink/45">
        {DOMAIN_LABEL[GAME_META[plan[0]!].domain]} first — it&apos;s your least certain rating.
      </p>
      <button
        onClick={() => setPhase("running")}
        className="mt-6 w-full rounded-xl bg-lime py-3 font-semibold text-ink"
      >
        Start workout
      </button>
    </div>
  );
}
