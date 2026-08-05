"use client";

/** Per-game flow: pre-game sheet → practice / Focus Mode play → results. */

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  computeMetrics,
  generatePracticeSpec,
  GAME_META,
  type GameId,
  type GameSpec,
  type TrialResult,
} from "@cortexwatt/core";
import { api, hasToken, type IssuedSession, type MeSummary, type SubmitResult } from "@/lib/api";
import type { SessionMetrics } from "@cortexwatt/core";
import { FocusSession, type FocusOutcome } from "@/components/FocusSession";
import { PreGameSheet } from "@/components/PreGameSheet";
import { Results } from "@/components/Results";

const PRACTICE_COACH: Record<string, string> = {
  flash_point: "Tap or press Space the instant the disc appears.",
  reflex_drop: "One rod drops — press its key (S D F · J K L) or tap it before it clears the line.",
  vector: "A sector glows — press that arrow key. Coral core = press the opposite arrow.",
  stackwise: "Match if this tile equals the one N steps back. J = match, F = no match.",
  drift_watch: "Track the amber orbs through the drift, then pick them out.",
  wide_angle: "One glance: the center symbol and the lime blip's direction.",
  echo_grid: "Memorize the rose cells, wait out the delay, rebuild the pattern.",
};

type Phase =
  | { name: "sheet" }
  | { name: "practice"; spec: GameSpec }
  | { name: "playing"; session: IssuedSession }
  | { name: "submitting" }
  | { name: "results"; result: SubmitResult; clientMetrics: SessionMetrics; sessionId: string };

export default function GamePage() {
  const router = useRouter();
  const params = useParams<{ game: string }>();
  const gameId = params.game as GameId;
  const meta = GAME_META[gameId];

  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "sheet" });
  const [practiceNote, setPracticeNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api.summary().then(setSummary).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    if (!meta) {
      router.replace("/train");
      return;
    }
    refresh();
  }, [router, refresh, meta]);

  const game = summary?.games.find((g) => g.id === gameId);

  const startPlay = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await api.issueSession(gameId);
      setPracticeNote(null);
      setPhase({ name: "playing", session });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [gameId]);

  const startPractice = useCallback(() => {
    const d = Math.max(5, (game?.difficulty ?? 30) - 15);
    setPracticeNote(null);
    setPhase({ name: "practice", spec: generatePracticeSpec(gameId, d, { trialCap: 3 }) });
  }, [gameId, game]);

  const onPlayDone = useCallback(
    async (outcome: FocusOutcome, session: IssuedSession) => {
      if (outcome.kind === "exit") {
        setPhase({ name: "sheet" });
        return;
      }
      if (outcome.kind === "void") {
        // interrupted — session is void, never submitted; issue a fresh one
        await startPlay();
        return;
      }
      setPhase({ name: "submitting" });
      const clientMetrics = computeMetrics(gameId, outcome.trials);
      try {
        const result = await api.submitResults(session.session_id, {
          token: session.token,
          client_metrics: clientMetrics,
          trials: outcome.trials,
          device: outcome.device,
        });
        refresh();
        setPhase({ name: "results", result, clientMetrics, sessionId: session.session_id });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase({ name: "sheet" });
      }
    },
    [gameId, refresh, startPlay],
  );

  const onPracticeDone = useCallback(
    (outcome: FocusOutcome) => {
      if (outcome.kind === "complete") {
        const correct = outcome.trials.filter((t: TrialResult) => t.correct).length;
        setPracticeNote(
          `Practice done — ${correct}/${outcome.trials.length} correct. Practice never counts.`,
        );
      }
      setPhase({ name: "sheet" });
    },
    [],
  );

  if (!meta) return null;
  if (!game)
    return <p className="mt-10 text-sm text-ink/50">{error ?? "Loading…"}</p>;

  return (
    <div>
      {phase.name === "sheet" && (
        <>
          {error && <p className="mt-4 text-center text-sm text-dom-decision">{error}</p>}
          <PreGameSheet
            game={game}
            practiceNote={practiceNote}
            onPlay={startPlay}
            onPractice={startPractice}
            busy={busy}
          />
        </>
      )}

      {phase.name === "practice" && (
        <FocusSession
          gameId={gameId}
          spec={phase.spec}
          coachLine={PRACTICE_COACH[gameId]}
          onDone={onPracticeDone}
        />
      )}

      {phase.name === "playing" && (
        <FocusSession
          gameId={gameId}
          spec={phase.session.spec}
          onDone={(o) => onPlayDone(o, phase.session)}
        />
      )}

      {phase.name === "submitting" && (
        <p className="mt-16 text-center text-sm text-ink/50">Validating session…</p>
      )}

      {phase.name === "results" && (
        <Results
          gameId={gameId}
          domain={game.domain}
          result={phase.result}
          clientMetrics={phase.clientMetrics}
          summary={summary}
          sessionId={phase.sessionId}
          onNext={() => router.push("/train")}
          nextLabel="Back to Train"
          onReplay={startPlay}
        />
      )}
    </div>
  );
}
