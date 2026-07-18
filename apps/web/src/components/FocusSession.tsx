"use client";

/** Focus Mode — the product's ritual (design doc §4/§5).
 * Dim to #0E1513, 3-2-1 countdown, near-zero HUD: a hairline trial-progress
 * track and a barely-visible pause affordance. No live scores, ever. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateRefresh,
  games,
  InterruptionWatcher,
  QueueInput,
  type GameId,
  type GameSpec,
  type TrialResult,
} from "@cortexwatt/core";
import type { DeviceInfo } from "@/lib/api";

export type FocusOutcome =
  | { kind: "complete"; trials: TrialResult[]; device: DeviceInfo }
  | { kind: "void" } // interrupted/abandoned — never submitted
  | { kind: "exit" };

interface ControlButton {
  id: string;
  label: string;
  key?: string;
  variant?: "primary" | "ghost";
}

export function FocusSession({
  gameId,
  spec,
  coachLine,
  onDone,
}: {
  gameId: GameId;
  spec: GameSpec;
  /** Practice-mode instruction line rendered over the field. */
  coachLine?: string | null;
  onDone: (outcome: FocusOutcome) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [progress, setProgress] = useState(0);
  const [buttons, setButtons] = useState<ControlButton[]>([]);
  const [interrupted, setInterrupted] = useState(false);
  const inputRef = useRef<QueueInput | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const pause = useCallback(() => {
    abortRef.current?.abort();
    setInterrupted(true);
  }, []);

  // Countdown ritual
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 900);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause]);

  // Run the game once the countdown finishes
  useEffect(() => {
    if (countdown !== null || startedRef.current) return;
    startedRef.current = true;

    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const size = () => {
      canvas.width = Math.round(stage.clientWidth * dpr);
      canvas.height = Math.round(stage.clientHeight * dpr);
    };
    size();

    const input = new QueueInput();
    input.attach(stage, canvas);
    inputRef.current = input;

    const watcher = new InterruptionWatcher();
    watcher.attach();

    const abort = new AbortController();
    abortRef.current = abort;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    (async () => {
      const refresh = await estimateRefresh();
      const device: DeviceInfo = {
        user_agent: navigator.userAgent,
        viewport: [window.innerWidth, window.innerHeight],
        input_type: navigator.maxTouchPoints > 0 ? "touch" : "keyboard+pointer",
        device_pixel_ratio: dpr,
        refresh_interval_ms: Math.round(refresh.interval_ms * 100) / 100,
        refresh_hz: refresh.hz,
      };

      try {
        const trials = await games[gameId].run(spec, {
          canvas,
          input,
          controls: {
            set: (b) => setButtons(b),
            clear: () => setButtons([]),
          },
          onTrialProgress: (i, n) => setProgress(n > 0 ? i / n : 0),
          abortSignal: abort.signal,
          interruption: watcher,
          reducedMotion,
        });

        // §4.6 — >20% interrupted trials: session abandoned, never submitted.
        const interruptedCount = trials.filter((t) => t.interrupted).length;
        if (trials.length > 0 && interruptedCount / trials.length > 0.2) {
          setInterrupted(true);
          return;
        }
        onDone({ kind: "complete", trials, device });
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // pause/exit path
        console.error(err);
        setInterrupted(true);
      }
    })();

    return () => {
      abort.abort();
      input.detach();
      watcher.detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, gameId, spec]);

  const pressButton = (id: string, e: React.PointerEvent) => {
    inputRef.current?.inject({ kind: "button", button: id, t: e.timeStamp });
  };

  return (
    <div className="focus-enter fixed inset-0 z-50 flex flex-col bg-focus text-focus-ink">
      {/* hairline trial-progress track */}
      <div className="hairline-track w-full">
        <div className="hairline-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <div ref={stageRef} className="relative min-h-0 flex-1 touch-none select-none">
        <canvas ref={canvasRef} data-focus-canvas className="absolute inset-0 h-full w-full" />

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              key={countdown}
              className="countdown-breathe display num text-7xl font-medium text-focus-ink/90"
            >
              {countdown === 0 ? "" : countdown}
            </span>
          </div>
        )}

        {coachLine && countdown === null && !interrupted && (
          <div className="pointer-events-none absolute inset-x-0 top-8 text-center">
            <p className="text-sm text-focus-ink/60">{coachLine}</p>
          </div>
        )}

        {interrupted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-focus/95">
            <p className="display text-xl font-medium">Session interrupted</p>
            <p className="mt-1 text-sm text-focus-ink/60">This one won&apos;t count.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => onDone({ kind: "void" })}
                className="rounded-full bg-lime px-6 py-2 font-semibold text-ink"
              >
                Replay
              </button>
              <button
                onClick={() => onDone({ kind: "exit" })}
                className="rounded-full border border-focus-ink/25 px-6 py-2 text-focus-ink/80"
              >
                Exit
              </button>
            </div>
          </div>
        )}

        {/* barely-visible pause affordance */}
        {!interrupted && (
          <button
            onClick={pause}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Pause session"
            className="absolute right-4 top-4 rounded-full px-3 py-1 text-xs text-focus-ink/25 hover:text-focus-ink/60"
          >
            ⏸
          </button>
        )}

        {/* quiet exit — leaves without submitting; the session simply expires */}
        {!interrupted && (
          <button
            onClick={() => {
              abortRef.current?.abort();
              onDone({ kind: "exit" });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Exit session"
            className="absolute bottom-4 right-4 rounded-full border border-focus-ink/15 px-4 py-1.5 text-sm text-focus-ink/40 hover:border-focus-ink/40 hover:text-focus-ink/80"
          >
            Exit
          </button>
        )}
      </div>

      {/* control bar — games declare their buttons */}
      {buttons.length > 0 && !interrupted && countdown === null && (
        <div className="flex justify-center gap-3 px-4 pb-8 pt-2">
          {buttons.map((b) => (
            <button
              key={b.id}
              onPointerDown={(e) => pressButton(b.id, e)}
              className={`min-h-16 min-w-32 rounded-2xl px-6 text-base font-semibold ${
                b.variant === "primary"
                  ? "bg-lime text-ink"
                  : "border border-focus-ink/20 text-focus-ink/85"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
