/** Original geometric marks per game — no clip art (design doc §"Train hub"). */

import { DOMAIN_COLOR } from "@/lib/domains";

const GLYPHS: Record<string, (c: string) => React.ReactNode> = {
  flash_point: (c) => (
    <>
      <circle cx="24" cy="24" r="7" fill={c} />
      <circle cx="24" cy="24" r="15" fill="none" stroke={c} strokeWidth="1.5" opacity="0.35" />
    </>
  ),
  reflex_drop: (c) => (
    <>
      <line x1="11" y1="13" x2="37" y2="13" stroke={c} strokeWidth="1.5" opacity="0.45" />
      {[14, 21, 35].map((x) => (
        <rect
          key={x}
          x={x - 2}
          y="13"
          width="4"
          height="16"
          rx="2"
          fill="none"
          stroke={c}
          strokeWidth="1.3"
          opacity="0.4"
        />
      ))}
      {/* the released rod, caught mid-fall */}
      <rect x="26" y="21" width="4" height="16" rx="2" fill={c} />
    </>
  ),
  vector: (c) => (
    <>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line
          key={a}
          x1={24 + 10 * Math.sin((a * Math.PI) / 180)}
          y1={24 - 10 * Math.cos((a * Math.PI) / 180)}
          x2={24 + 17 * Math.sin((a * Math.PI) / 180)}
          y2={24 - 17 * Math.cos((a * Math.PI) / 180)}
          stroke={c}
          strokeWidth={a === 0 ? 3.5 : 1.5}
          opacity={a === 0 ? 1 : 0.4}
        />
      ))}
      <circle cx="24" cy="24" r="4" fill="none" stroke={c} strokeWidth="1.5" />
    </>
  ),
  stackwise: (c) => (
    <>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`${r}${col}`}
            x={12 + col * 9}
            y={12 + r * 9}
            width="7"
            height="7"
            rx="1.5"
            fill={r === 1 && col === 1 ? c : "none"}
            stroke={c}
            strokeWidth="1.3"
            opacity={r === 1 && col === 1 ? 1 : 0.4}
          />
        )),
      )}
    </>
  ),
  drift_watch: (c) => (
    <>
      <circle cx="16" cy="18" r="4.5" fill={c} />
      <circle cx="31" cy="14" r="4.5" fill="none" stroke={c} strokeWidth="1.5" opacity="0.45" />
      <circle cx="27" cy="31" r="4.5" fill="none" stroke={c} strokeWidth="1.5" opacity="0.45" />
      <path d="M14 30 q 4 -5 8 0" fill="none" stroke={c} strokeWidth="1.3" opacity="0.5" />
    </>
  ),
  wide_angle: (c) => (
    <>
      <path d="M24 20 l 4 4 l -4 4 l -4 -4 z" fill={c} />
      <circle cx="24" cy="24" r="16" fill="none" stroke={c} strokeWidth="1.3" opacity="0.35" />
      <circle cx="37" cy="15" r="3" fill={c} opacity="0.85" />
    </>
  ),
  echo_grid: (c) => (
    <>
      {[
        [0, 0, 0.35], [1, 0, 1], [2, 0, 0.35], [3, 0, 0.35],
        [0, 1, 0.35], [1, 1, 0.35], [2, 1, 1], [3, 1, 0.35],
        [0, 2, 1], [1, 2, 0.35], [2, 2, 0.35], [3, 2, 0.35],
        [0, 3, 0.35], [1, 3, 0.35], [2, 3, 0.35], [3, 3, 1],
      ].map(([col, r, o], i) => (
        <rect
          key={i}
          x={12 + (col as number) * 7}
          y={12 + (r as number) * 7}
          width="5.5"
          height="5.5"
          rx="1.2"
          fill={c}
          opacity={o as number}
        />
      ))}
    </>
  ),
};

export function GameGlyph({
  gameId,
  domain,
  size = 48,
}: {
  gameId: string;
  domain: string;
  size?: number;
}) {
  const color = DOMAIN_COLOR[domain] ?? "currentColor";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {GLYPHS[gameId]?.(color)}
    </svg>
  );
}
