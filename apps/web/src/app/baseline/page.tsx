"use client";

/** Baseline assessment — all six games once, then the radar reveal (PRD §7/§11). */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GameId } from "@cortexwatt/core";
import { api, hasToken, type MeSummary } from "@/lib/api";
import { CortexRadar } from "@/components/CortexRadar";
import { GameChain } from "@/components/GameChain";

const ORDER: GameId[] = [
  "flash_point",
  "vector",
  "stackwise",
  "drift_watch",
  "wide_angle",
  "echo_grid",
];

export default function BaselinePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "running" | "reveal">("intro");
  const [summary, setSummary] = useState<MeSummary | null>(null);

  useEffect(() => {
    if (!hasToken()) router.replace("/login");
  }, [router]);

  if (phase === "running")
    return (
      <GameChain
        gameIds={ORDER}
        onFinished={() => {
          api.summary().then(setSummary).catch(() => {});
          setPhase("reveal");
        }}
      />
    );

  if (phase === "reveal") {
    const ratings = Object.fromEntries(
      (summary?.ratings ?? []).map((r) => [r.domain, { rating: r.rating, rd: r.rd }]),
    );
    return (
      <div className="mx-auto mt-10 max-w-md text-center">
        <h1 className="display text-3xl font-semibold">Your baseline</h1>
        {summary?.cortex_index !== null && summary?.cortex_index !== undefined && (
          <>
            <p className="display num mt-6 text-6xl font-semibold text-pine">
              {summary.cortex_index}
            </p>
            <p className="mt-1 text-sm text-ink/50">Cortex Index · 0–1000</p>
          </>
        )}
        <div className="mt-6 flex justify-center">
          <CortexRadar ratings={ratings} size="lg" />
        </div>
        <p className="mx-auto mt-4 max-w-sm text-sm text-ink/60">
          Six domains, one honest picture. Ratings start uncertain — every session
          sharpens them.
        </p>
        <Link
          href="/train"
          className="mt-8 inline-block rounded-full bg-lime px-8 py-2.5 font-semibold text-ink"
        >
          Start training
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-12 max-w-md text-center">
      <h1 className="display text-3xl font-semibold">Baseline assessment</h1>
      <p className="mt-3 text-ink/65">
        Six games, one pass each, about 12 minutes. At the end you&apos;ll see your
        Cortex Index and domain radar for the first time.
      </p>
      <p className="mt-2 text-sm text-ink/45">
        Find a quiet moment — measurement is the product.
      </p>
      <button
        onClick={() => setPhase("running")}
        className="mt-8 rounded-xl bg-lime px-10 py-3 font-semibold text-ink"
      >
        Begin
      </button>
    </div>
  );
}
