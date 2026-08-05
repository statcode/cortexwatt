"use client";

/** Pre-game sheet — the modern launcher dialog (design doc §2): glyph, one-line
 * objective, a looping one-trial demo, level + personal stats, Play / Practice,
 * and an expandable "How scoring works". */

import { useEffect, useRef, useState } from "react";
import { FOCUS, GAME_META, type GameId } from "@cortexwatt/core";
import type { GameCatalogItem } from "@/lib/api";
import { DomainChip } from "./DomainChip";
import { GameGlyph } from "./GameGlyph";

const SCORING: Record<string, string> = {
  flash_point:
    "Your index is 70% speed (median reaction vs a 450 ms anchor) and 30% discipline (avoiding false starts). The response window tightens as your level rises.",
  reflex_drop:
    "50% speed (median catch time against a 700 ms six-choice anchor), 35% accuracy — grabbing the wrong rod counts against you — and 15% discipline for not jumping before the release. The catch window tightens as your level rises, so the rods fall faster.",
  vector:
    "55% accuracy, 35% speed, 10% bonus for reverse-trial accuracy. Reverse trials get more frequent and the window tighter as your level rises.",
  stackwise:
    "Balanced accuracy: your hit rate on matches averaged with your correct-rejection rate on non-matches. Speed is not scored — this is a capacity game. N rises with your level.",
  drift_watch:
    "The mean fraction of targets you recover per round. More orbs, faster drift, and (at high level) a fourth target as you climb.",
  wide_angle:
    "Half center-symbol accuracy, half bearing accuracy (±1 arc counts). Flashes get shorter, blips further out, clutter denser as your level rises.",
  echo_grid:
    "Mean overlap (Jaccard) between your rebuilt pattern and the true one. Bigger grids, more cells, shorter exposure, longer delays as you climb.",
};

/** Looping single-trial demo — show, don't tell. */
function DemoLoop({ gameId }: { gameId: GameId }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const c = canvas.getContext("2d")!;
    const W = (canvas.width = 320);
    const H = (canvas.height = 180);
    const cx = W / 2;
    const cy = H / 2;
    let raf = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (t: number) => {
      const T = (t / 1000) % 3; // 3s loop
      c.fillStyle = FOCUS.bg;
      c.fillRect(0, 0, W, H);

      if (gameId === "flash_point") {
        if (T < 1.6) {
          c.strokeStyle = FOCUS.dim;
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(cx - 6, cy); c.lineTo(cx + 6, cy);
          c.moveTo(cx, cy - 6); c.lineTo(cx, cy + 6);
          c.stroke();
        } else {
          c.fillStyle = FOCUS.lime;
          c.beginPath();
          c.arc(cx, cy, 18, 0, Math.PI * 2);
          c.fill();
        }
      } else if (gameId === "reflex_drop") {
        const railY = 34;
        const rodH = 62;
        const catchY = 150;
        const xs = [0, 1, 2, 3.7, 4.7, 5.7].map((o) => cx - 2.85 * 30 + o * 30);
        c.strokeStyle = FOCUS.dim;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(xs[0]! - 12, railY);
        c.lineTo(xs[5]! + 12, railY);
        c.stroke();
        c.strokeStyle = FOCUS.dimmer;
        c.setLineDash([4, 7]);
        c.beginPath();
        c.moveTo(xs[0]! - 12, catchY);
        c.lineTo(xs[5]! + 12, catchY);
        c.stroke();
        c.setLineDash([]);
        // rod 4 releases at T=1.4 and is caught at T=1.9 (same s = ½gt² fall)
        const dropped = 4;
        const win = 0.75;
        const f = Math.min(1, Math.max(0, (T - 1.4) / win));
        const fall = (catchY - railY - rodH) * Math.min(f, 0.66) ** 2;
        xs.forEach((x, i) => {
          const active = i === dropped && T > 1.4;
          c.beginPath();
          c.roundRect(x - 5, railY + (active ? fall : 0), 10, rodH, 5);
          if (active) {
            c.fillStyle = FOCUS.lime;
            c.fill();
          } else {
            c.fillStyle = FOCUS.dimmer;
            c.fill();
            c.strokeStyle = FOCUS.dim;
            c.lineWidth = 1.3;
            c.stroke();
          }
        });
      } else if (gameId === "vector") {
        for (let k = 0; k < 4; k++) {
          const a0 = ((k * 90 - 41 - 90) * Math.PI) / 180;
          const a1 = ((k * 90 + 41 - 90) * Math.PI) / 180;
          const active = T > 1 && k === 1;
          c.strokeStyle = active ? FOCUS.lime : FOCUS.dim;
          c.lineWidth = active ? 4 : 1.5;
          c.beginPath();
          c.arc(cx, cy, 55, a0, a1);
          c.stroke();
        }
        c.strokeStyle = T > 2.2 ? FOCUS.coral : FOCUS.dimmer;
        c.beginPath();
        c.arc(cx, cy, 9, 0, Math.PI * 2);
        c.stroke();
      } else if (gameId === "stackwise") {
        for (let k = 0; k < 9; k++) {
          const col = k % 3, row = Math.floor(k / 3);
          const lit = (T < 1 && k === 4) || (T > 1.8 && T < 2.6 && k === 4);
          c.fillStyle = lit ? FOCUS.violet : FOCUS.dimmer;
          c.beginPath();
          c.roundRect(cx - 52 + col * 36, cy - 52 + row * 36, 30, 30, 5);
          c.fill();
        }
      } else if (gameId === "drift_watch") {
        const pts = [
          [0.3, 0.3], [0.7, 0.25], [0.5, 0.6], [0.25, 0.7], [0.75, 0.65], [0.55, 0.35],
        ];
        pts.forEach(([px, py], i) => {
          const wob = reduced ? 0 : Math.sin(t / 400 + i) * 6;
          c.fillStyle = T < 1.2 && i < 3 ? FOCUS.amber : FOCUS.ink;
          c.globalAlpha = T < 1.2 && i < 3 ? 0.9 : 0.8;
          c.beginPath();
          c.arc(px! * W + wob, py! * H + (reduced ? 0 : Math.cos(t / 500 + i) * 5), 9, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = 1;
        });
      } else if (gameId === "wide_angle") {
        if (T > 0.8 && T < 1.15) {
          c.fillStyle = FOCUS.ink;
          c.beginPath();
          c.moveTo(cx, cy - 9); c.lineTo(cx + 9, cy); c.lineTo(cx, cy + 9); c.lineTo(cx - 9, cy);
          c.fill();
          c.fillStyle = FOCUS.lime;
          c.beginPath();
          c.arc(cx + 62, cy - 38, 5, 0, Math.PI * 2);
          c.fill();
        } else {
          c.strokeStyle = FOCUS.dim;
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(cx - 6, cy); c.lineTo(cx + 6, cy);
          c.moveTo(cx, cy - 6); c.lineTo(cx, cy + 6);
          c.stroke();
        }
      } else if (gameId === "echo_grid") {
        const litCells = [1, 6, 8, 13];
        for (let k = 0; k < 16; k++) {
          const col = k % 4, row = Math.floor(k / 4);
          const lit = T < 1.2 && litCells.includes(k);
          const rebuilt = T > 2 && litCells.includes(k) && litCells.indexOf(k) < Math.floor((T - 2) * 5);
          c.fillStyle = lit || rebuilt ? FOCUS.rose : FOCUS.dimmer;
          c.beginPath();
          c.roundRect(cx - 58 + col * 30, cy - 58 + row * 30, 26, 26, 4);
          c.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gameId]);

  return <canvas ref={ref} className="w-full rounded-xl" style={{ aspectRatio: "16/9" }} />;
}

export function PreGameSheet({
  game,
  practiceNote,
  onPlay,
  onPractice,
  busy,
}: {
  game: GameCatalogItem;
  practiceNote: string | null;
  onPlay: () => void;
  onPractice: () => void;
  busy: boolean;
}) {
  const meta = GAME_META[game.id as GameId];
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <div className="mx-auto mt-8 max-w-lg">
      <div className="flex items-center gap-4">
        <GameGlyph gameId={game.id} domain={game.domain} size={56} />
        <div>
          <h1 className="display text-2xl font-semibold">{game.name}</h1>
          <DomainChip domain={game.domain} />
        </div>
      </div>

      <p className="mt-4 text-ink/70">{meta.tagline}</p>

      <div className="mt-4">
        <DemoLoop gameId={game.id as GameId} />
      </div>

      <div className="num mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        <div className="tile !p-3">
          <p className="text-xs text-ink/45">Level</p>
          <p className="display text-lg font-semibold">{game.difficulty}</p>
        </div>
        <div className="tile !p-3">
          <p className="text-xs text-ink/45">Rating</p>
          <p className="display text-lg font-semibold">
            {game.rating !== null ? Math.round(game.rating) : "—"}
          </p>
        </div>
        <div className="tile !p-3">
          <p className="text-xs text-ink/45">Best</p>
          <p className="display text-lg font-semibold">{game.best_display_score ?? "—"}</p>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-ink/45">⌨ {meta.keys}</p>

      {practiceNote && (
        <p className="mt-3 rounded-xl bg-pine/8 px-4 py-2 text-center text-sm text-pine">
          {practiceNote}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onPlay}
          disabled={busy}
          className="flex-1 rounded-xl bg-lime py-3 font-semibold text-ink disabled:opacity-50"
        >
          {busy ? "Preparing…" : "Play"}
        </button>
        <button
          onClick={onPractice}
          disabled={busy}
          className="flex-1 rounded-xl border border-ink/20 py-3 font-medium disabled:opacity-50"
        >
          Practice
        </button>
      </div>

      <button
        onClick={() => setRulesOpen(!rulesOpen)}
        className="mt-4 text-sm text-ink/50 underline-offset-4 hover:underline"
      >
        How scoring works
      </button>
      {rulesOpen && <p className="mt-2 text-sm leading-relaxed text-ink/60">{SCORING[game.id]}</p>}
    </div>
  );
}
