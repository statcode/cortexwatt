/** Focus Mode visual tokens — design doc 04. Games draw only with these. */

export const FOCUS = {
  bg: "#0E1513",
  ink: "#E8EFEA", // high-contrast text/marks on focus bg
  dim: "#2A3833", // hairlines, inactive structure
  dimmer: "#1A2420",
  lime: "#C9F24E", // Signal Lime — the action/stimulus accent
  coral: "#E37E6B", // false-start / decision-control hue
  violet: "#A48FD8", // working memory
  amber: "#E0B455", // attention
  teal: "#5FB8AC", // visual
  rose: "#E58FA8", // memory
  slate: "#8AA8C9", // processing speed
} as const;

export const DOMAIN_HUE: Record<string, string> = {
  processing_speed: FOCUS.slate,
  decision_control: FOCUS.coral,
  working_memory: FOCUS.violet,
  attention: FOCUS.amber,
  visual: FOCUS.teal,
  memory: FOCUS.rose,
};
