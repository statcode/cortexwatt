/** User preferences — localStorage-backed, per browser. */

export interface Prefs {
  /** Show the in-game speed readout after each response. Off by default —
   * Focus Mode is measurement-first; this is a deliberate opt-in. */
  speedometer: boolean;
}

const KEY = "cw_prefs";
const DEFAULTS: Prefs = { speedometer: false };

export function getPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Prefs {
  const next = { ...getPrefs(), [key]: value };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
