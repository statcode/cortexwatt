export * from "./types";
export * from "./prng";
export * from "./timing";
export * from "./metrics";
export * from "./theme";
export * from "./practice";
export * from "./bot";
export { QueueInput } from "./input";

import type { GameId, GameModule, GameSpec } from "./types";
import { flashPoint } from "./games/flashPoint";
import { reflexDrop } from "./games/reflexDrop";
import { vector } from "./games/vector";
import { stackwise } from "./games/stackwise";
import { driftWatch } from "./games/driftWatch";
import { wideAngle } from "./games/wideAngle";
import { echoGrid } from "./games/echoGrid";

export { flashPoint, reflexDrop, vector, stackwise, driftWatch, wideAngle, echoGrid };
export { initOrbs, stepOrbs } from "./games/driftWatch";

export const games: Record<GameId, GameModule<GameSpec>> = {
  flash_point: flashPoint as GameModule<GameSpec>,
  reflex_drop: reflexDrop as GameModule<GameSpec>,
  vector: vector as GameModule<GameSpec>,
  stackwise: stackwise as GameModule<GameSpec>,
  drift_watch: driftWatch as GameModule<GameSpec>,
  wide_angle: wideAngle as GameModule<GameSpec>,
  echo_grid: echoGrid as GameModule<GameSpec>,
};

export const GAME_META: Record<
  GameId,
  { name: string; domain: string; tagline: string; keys: string }
> = {
  flash_point: {
    name: "Flash Point",
    domain: "processing_speed",
    tagline: "A lime disc appears after an unpredictable pause — respond the instant it does.",
    keys: "Space — respond",
  },
  reflex_drop: {
    name: "Reflex Drop",
    domain: "processing_speed",
    tagline: "Six rods hang from a rail. One drops without warning — catch it before it clears the line.",
    keys: "S D F · J K L — one key per rod",
  },
  vector: {
    name: "Vector",
    domain: "decision_control",
    tagline: "A sector glows — respond in its direction. If the core ignites, go opposite.",
    keys: "W E D S A Q — six directions",
  },
  stackwise: {
    name: "Stackwise",
    domain: "working_memory",
    tagline: "Does this tile match the one from N steps back?",
    keys: "J — match · F — no match",
  },
  drift_watch: {
    name: "Drift Watch",
    domain: "attention",
    tagline: "Three orbs pulse, then all drift identically — keep track and pick them out.",
    keys: "Arrows — cycle · Space — select",
  },
  wide_angle: {
    name: "Wide Angle",
    domain: "visual",
    tagline: "Catch the center symbol and the peripheral blip in one glance.",
    keys: "F / J — symbol · arrows + Space — bearing",
  },
  echo_grid: {
    name: "Echo Grid",
    domain: "memory",
    tagline: "A pattern lights, holds, vanishes — rebuild it after the delay.",
    keys: "Arrows + Space — place · Z — undo · ⏎ — confirm",
  },
};
