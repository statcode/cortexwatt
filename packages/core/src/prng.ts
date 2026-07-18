/** mulberry32 — tiny seeded PRNG. Same algorithm is used for Drift Watch
 * physics reproducibility; the server only generates rated specs (Python). */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Truncated exponential foreperiod, 1000–4000 ms, mean ≈ 1800 ms (PRD §4.4). */
export function sampleForeperiod(rng: () => number): number {
  const lo = 1000;
  const hi = 4000;
  const mean = 800; // of the exponential part above lo
  // inverse-CDF of truncated exponential
  const cap = 1 - Math.exp(-(hi - lo) / mean);
  const u = rng() * cap;
  return Math.round(lo + -mean * Math.log(1 - u));
}
