"use client";

/** Train hub — game library grouped by domain, with a "Recommended today"
 * row driven by rating uncertainty (design doc §1). */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, hasToken, type MeSummary } from "@/lib/api";
import { DomainChip } from "@/components/DomainChip";
import { GameGlyph } from "@/components/GameGlyph";
import { DOMAIN_LABEL } from "@/lib/domains";

function timeAgo(iso: string | null): string {
  if (!iso) return "Not played yet";
  const days = Math.floor((Date.now() - new Date(iso + "Z").getTime()) / 86400000);
  if (days <= 0) return "Played today";
  if (days === 1) return "Played yesterday";
  return `Played ${days} days ago`;
}

export default function TrainHub() {
  const router = useRouter();
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    api.summary().then(setSummary).catch((e) => setError(String(e)));
  }, [router]);

  const recommended = useMemo(() => {
    if (!summary) return null;
    // Most-uncertain domain first: unrated (RD 350) beats everything.
    const byUncertainty = [...summary.games].sort((a, b) => (b.rd ?? 350) - (a.rd ?? 350));
    return byUncertainty[0] ?? null;
  }, [summary]);

  const playedAny = summary?.games.some((g) => g.last_played) ?? false;

  if (error) return <p className="mt-10 text-sm text-dom-decision">{error}</p>;
  if (!summary) return <p className="mt-10 text-sm text-ink/50">Loading…</p>;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="display text-3xl font-semibold">Train</h1>
          <p className="mt-1 text-ink/60">
            Six games, six domains. Every session is measured and rated.
          </p>
        </div>
      </div>

      {!playedAny && (
        <div className="mt-6 rounded-2xl border border-pine/20 bg-pine p-5 text-porcelain">
          <h2 className="display text-lg font-semibold">Start with your baseline</h2>
          <p className="mt-1 text-sm text-porcelain/75">
            Play all six games once to reveal your Cortex Index and domain radar.
          </p>
          <Link
            href="/baseline"
            className="mt-3 inline-block rounded-full bg-lime px-5 py-2 text-sm font-semibold text-ink"
          >
            Run baseline · ~12 min
          </Link>
        </div>
      )}

      {recommended && playedAny && (
        <div className="mt-6 rounded-2xl border border-ink/8 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/45">
            Recommended today
          </p>
          <div className="mt-2 flex items-center gap-4">
            <GameGlyph gameId={recommended.id} domain={recommended.domain} size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{recommended.name}</p>
              <p className="text-sm text-ink/55">
                Your {DOMAIN_LABEL[recommended.domain]} rating is the least certain — play{" "}
                {recommended.name} to sharpen it.
              </p>
            </div>
            <Link
              href={`/train/${recommended.id}`}
              className="rounded-full bg-lime px-5 py-2 text-sm font-semibold text-ink"
            >
              Play
            </Link>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.games.map((g) => (
          <Link
            key={g.id}
            href={`/train/${g.id}`}
            className="group rounded-2xl border border-ink/8 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <GameGlyph gameId={g.id} domain={g.domain} />
              <DomainChip domain={g.domain} />
            </div>
            <h3 className="display mt-3 text-lg font-semibold">{g.name}</h3>
            <div className="num mt-2 space-y-1 text-sm text-ink/60">
              <p>
                {g.rating !== null ? (
                  <>
                    Rating {Math.round(g.rating)}
                    <span className="text-ink/35"> ± {Math.round(g.rd ?? 0)}</span>
                  </>
                ) : (
                  "Unrated"
                )}
                {" · "}Level {g.difficulty}
              </p>
              <p>
                {g.best_display_score !== null ? `Best ${g.best_display_score}` : "No best yet"}
                <span className="text-ink/35"> · {timeAgo(g.last_played)}</span>
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
