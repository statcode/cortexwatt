/** Which game to suggest next — shared by the Train hub's "Recommended today"
 * and the daily workout plan (PRD §11). */

import type { GameCatalogItem } from "./api";

const playedAt = (g: GameCatalogItem) => (g.last_played ? Date.parse(g.last_played + "Z") : 0);

/**
 * Least-certain rating first. Ratings are per *domain*, so every game sharing a
 * domain ties exactly on RD — a stable sort would then hand the slot to the same
 * game forever. Break those ties toward the least-recently-played game so a
 * domain's games rotate, and one a member has never touched goes first.
 */
export function byUncertainty(games: GameCatalogItem[]): GameCatalogItem[] {
  return [...games].sort((a, b) => {
    const rd = (b.rd ?? 350) - (a.rd ?? 350);
    return rd !== 0 ? rd : playedAt(a) - playedAt(b);
  });
}

/** A workout should span domains, so take at most one game per domain. */
export function planGames(games: GameCatalogItem[], count: number): GameCatalogItem[] {
  const seen = new Set<string>();
  const plan: GameCatalogItem[] = [];
  for (const g of byUncertainty(games)) {
    if (seen.has(g.domain)) continue;
    seen.add(g.domain);
    plan.push(g);
    if (plan.length === count) break;
  }
  return plan;
}
