"use client";

/** Shared multi-game chain — drives workout (3 games) and baseline (6 games)
 * with a 5-second interstitial between games (design doc §8). */

import { useCallback, useEffect, useState } from "react";
import { computeMetrics, GAME_META, type GameId, type SessionMetrics } from "@cortexwatt/core";
import { api, type IssuedSession, type SubmitResult } from "@/lib/api";
import { DomainChip } from "./DomainChip";
import { FocusSession, type FocusOutcome } from "./FocusSession";
import { GameGlyph } from "./GameGlyph";

export interface ChainResult {
  gameId: GameId;
  sessionId: string;
  result: SubmitResult;
  clientMetrics: SessionMetrics;
}

type Step =
  | { name: "interstitial"; index: number; secondsLeft: number }
  | { name: "playing"; index: number; session: IssuedSession }
  | { name: "submitting"; index: number }
  | { name: "error"; message: string };

export function GameChain({
  gameIds,
  onFinished,
}: {
  gameIds: GameId[];
  onFinished: (results: ChainResult[]) => void;
}) {
  const [step, setStep] = useState<Step>({ name: "interstitial", index: 0, secondsLeft: 5 });
  const [results, setResults] = useState<ChainResult[]>([]);

  const launch = useCallback(
    async (index: number) => {
      try {
        const session = await api.issueSession(gameIds[index]!);
        setStep({ name: "playing", index, session });
      } catch (e) {
        setStep({ name: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [gameIds],
  );

  // interstitial countdown
  useEffect(() => {
    if (step.name !== "interstitial") return;
    if (step.secondsLeft <= 0) {
      launch(step.index);
      return;
    }
    const t = setTimeout(
      () => setStep({ ...step, secondsLeft: step.secondsLeft - 1 }),
      1000,
    );
    return () => clearTimeout(t);
  }, [step, launch]);

  const onGameDone = useCallback(
    async (outcome: FocusOutcome, index: number, session: IssuedSession) => {
      if (outcome.kind === "exit") {
        onFinished(results);
        return;
      }
      if (outcome.kind === "void") {
        launch(index); // replay the same game with a fresh session
        return;
      }
      setStep({ name: "submitting", index });
      const gameId = gameIds[index]!;
      const clientMetrics = computeMetrics(gameId, outcome.trials);
      try {
        const result = await api.submitResults(session.session_id, {
          token: session.token,
          client_metrics: clientMetrics,
          trials: outcome.trials,
          device: outcome.device,
        });
        const next = [...results, { gameId, sessionId: session.session_id, result, clientMetrics }];
        setResults(next);
        if (index + 1 < gameIds.length) {
          setStep({ name: "interstitial", index: index + 1, secondsLeft: 5 });
        } else {
          onFinished(next);
        }
      } catch (e) {
        setStep({ name: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [gameIds, results, launch, onFinished],
  );

  if (step.name === "error")
    return (
      <div className="mt-16 text-center">
        <p className="text-sm text-dom-decision">{step.message}</p>
        <button
          onClick={() => onFinished(results)}
          className="mt-4 rounded-full border border-ink/20 px-6 py-2"
        >
          End session
        </button>
      </div>
    );

  if (step.name === "interstitial") {
    const gameId = gameIds[step.index]!;
    const meta = GAME_META[gameId];
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-focus text-focus-ink">
        <p className="text-sm text-focus-ink/50">
          {step.index + 1} of {gameIds.length}
        </p>
        <div className="mt-4 flex items-center gap-4">
          <GameGlyph gameId={gameId} domain={meta.domain} size={48} />
          <h2 className="display text-3xl font-semibold">Next: {meta.name}</h2>
        </div>
        <div className="mt-3">
          <DomainChip domain={meta.domain} dark />
        </div>
        <p className="num mt-8 text-5xl font-light text-focus-ink/70">{step.secondsLeft}</p>
        <button
          onClick={() => launch(step.index)}
          className="mt-6 text-sm text-focus-ink/50 underline-offset-4 hover:underline"
        >
          Skip
        </button>
      </div>
    );
  }

  if (step.name === "playing")
    return (
      <FocusSession
        gameId={gameIds[step.index]!}
        spec={step.session.spec}
        onDone={(o) => onGameDone(o, step.index, step.session)}
      />
    );

  return <p className="mt-16 text-center text-sm text-ink/50">Validating session…</p>;
}
