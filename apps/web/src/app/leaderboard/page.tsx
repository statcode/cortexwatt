"use client";

/** Weekly leaderboards — per game + Cortex Index (PRD §9/§10). */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_META, type GameId } from "@cortexwatt/core";
import { api, hasToken, type Leaderboard } from "@/lib/api";

const BOARDS: { id: string; label: string }[] = [
  { id: "ci", label: "Cortex Index" },
  ...Object.entries(GAME_META).map(([id, m]) => ({ id, label: m.name })),
];

export default function LeaderboardPage() {
  const router = useRouter();
  const [board, setBoard] = useState("ci");
  const [data, setData] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    setData(null);
    api.leaderboard(board).then(setData).catch((e) => setError(String(e)));
  }, [board, router]);

  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <h1 className="display text-3xl font-semibold">Leaderboard</h1>
      <p className="mt-1 text-sm text-ink/55">
        Weekly · {data?.period ?? ""} · best validated score counts
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoard(b.id)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              board === b.id ? "bg-pine text-porcelain" : "bg-ink/5 text-ink/70 hover:bg-ink/10"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-6 text-sm text-dom-decision">{error}</p>}

      {data && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-ink/8 bg-white">
          {data.entries.length === 0 && (
            <p className="p-8 text-center text-sm text-ink/45">
              No validated sessions on this board yet this week. Be the first.
            </p>
          )}
          {data.entries.map((e) => (
            <div
              key={e.rank}
              className={`flex items-center gap-4 border-b border-ink/5 px-5 py-3 last:border-0 ${
                e.is_me ? "bg-lime/15" : ""
              }`}
            >
              <span className="num w-8 text-sm text-ink/40">#{e.rank}</span>
              <span className="flex-1 font-medium">
                {e.handle}
                {e.is_me && <span className="ml-2 text-xs text-pine">you</span>}
              </span>
              <span className="num font-semibold">{e.score}</span>
            </div>
          ))}
          {data.me.rank !== null && data.me.rank > data.entries.length && (
            <div className="flex items-center gap-4 bg-lime/15 px-5 py-3">
              <span className="num w-8 text-sm text-ink/40">#{data.me.rank}</span>
              <span className="flex-1 font-medium">
                You
              </span>
              <span className="num font-semibold">{data.me.score}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
