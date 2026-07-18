/** CortexRadar — one SVG component, 6 axes, 3 sizes (PRD §11). */

import { DOMAIN_COLOR, DOMAIN_LABEL, DOMAIN_ORDER } from "@/lib/domains";

const SIZES = { sm: 160, md: 260, lg: 360 } as const;

export function CortexRadar({
  ratings,
  size = "md",
  showLabels = true,
}: {
  /** domain → rating (800–2200 normalized internally); missing = 0 */
  ratings: Record<string, { rating: number; rd: number } | undefined>;
  size?: keyof typeof SIZES;
  showLabels?: boolean;
}) {
  const S = SIZES[size];
  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.36;

  const pt = (i: number, frac: number): [number, number] => {
    const a = (i * 60 - 90) * (Math.PI / 180);
    return [cx + R * frac * Math.cos(a), cy + R * frac * Math.sin(a)];
  };

  const norm = (r: number) => Math.min(1, Math.max(0.06, (r - 800) / 1400));
  const values = DOMAIN_ORDER.map((d) => {
    const r = ratings[d];
    return r ? norm(r.rating) : 0.06;
  });
  const poly = values.map((v, i) => pt(i, v).join(",")).join(" ");

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Domain ratings radar">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={DOMAIN_ORDER.map((_, i) => pt(i, f).join(",")).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.12"
        />
      ))}
      {DOMAIN_ORDER.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeWidth="1" opacity="0.12" />;
      })}
      <polygon points={poly} fill="var(--color-lime)" fillOpacity="0.25" stroke="var(--color-pine)" strokeWidth="2" strokeLinejoin="round" />
      {DOMAIN_ORDER.map((d, i) => {
        const [x, y] = pt(i, values[i]!);
        return <circle key={d} cx={x} cy={y} r={size === "sm" ? 2.5 : 3.5} fill={DOMAIN_COLOR[d]} />;
      })}
      {showLabels &&
        DOMAIN_ORDER.map((d, i) => {
          const [x, y] = pt(i, 1.28);
          return (
            <text
              key={d}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={size === "sm" ? 8 : 11}
              fill="currentColor"
              opacity="0.65"
            >
              {DOMAIN_LABEL[d]}
            </text>
          );
        })}
    </svg>
  );
}
