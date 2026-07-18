export const DOMAIN_LABEL: Record<string, string> = {
  processing_speed: "Processing speed",
  decision_control: "Decision & control",
  working_memory: "Working memory",
  attention: "Attention",
  visual: "Visual",
  memory: "Memory",
};

export const DOMAIN_COLOR: Record<string, string> = {
  processing_speed: "var(--color-dom-speed)",
  decision_control: "var(--color-dom-decision)",
  working_memory: "var(--color-dom-memory-w)",
  attention: "var(--color-dom-attention)",
  visual: "var(--color-dom-visual)",
  memory: "var(--color-dom-memory)",
};

export const DOMAIN_ORDER = [
  "processing_speed",
  "decision_control",
  "working_memory",
  "attention",
  "visual",
  "memory",
];
