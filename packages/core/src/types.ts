/** Shared game contract — PRD §5. Pure TS, zero React/DOM-global assumptions. */

export type Domain =
  | "processing_speed"
  | "decision_control"
  | "working_memory"
  | "attention"
  | "visual"
  | "memory";

export type GameId =
  | "flash_point"
  | "vector"
  | "stackwise"
  | "drift_watch"
  | "wide_angle"
  | "echo_grid";

// ── Per-game spec shapes (server is source of truth; practice mirrors) ──

export interface FlashPointSpec {
  game: "flash_point";
  trials: { foreperiod_ms: number }[];
  response_window_ms: number;
}

export interface VectorSpec {
  game: "vector";
  trials: { sector: number; reverse: boolean; foreperiod_ms: number }[];
  response_window_ms: number;
}

export interface StackwiseSpec {
  game: "stackwise";
  n: number;
  presentations: { cell: number }[];
  isi_ms: number;
}

export interface DriftWatchSpec {
  game: "drift_watch";
  rounds: { orb_count: number; target_ids: number[]; motion_seed: number }[];
  drift_speed: number; // px/s at reference 600px field
  duration_ms: number;
}

export interface WideAngleSpec {
  game: "wide_angle";
  trials: {
    center_symbol: 0 | 1; // 0 = ◆, 1 = ●
    bearing_arc: number; // 0–11
    eccentricity_pct: number;
    distractors: number;
    flash_ms: number;
    foreperiod_ms: number;
  }[];
}

export interface EchoGridSpec {
  game: "echo_grid";
  trials: { grid: number; cells: number[]; expose_ms: number; delay_ms: number }[];
}

export type GameSpec =
  | FlashPointSpec
  | VectorSpec
  | StackwiseSpec
  | DriftWatchSpec
  | WideAngleSpec
  | EchoGridSpec;

// ── Runtime contract ──

export interface TrialResult {
  trial_index: number;
  onset_ms: number; // performance.now() at stimulus paint
  response_ms: number | null; // null = timeout/miss
  correct: boolean;
  false_start: boolean;
  interrupted: boolean;
  payload: Record<string, unknown>;
}

export type InputKind = "pointer" | "key" | "button";

export interface InputEventLike {
  kind: InputKind;
  t: number; // event.timeStamp (same time-base as performance.now())
  x?: number; // canvas-local px
  y?: number;
  key?: string; // lowercase key for kind === "key"
  button?: string; // control-bar button id for kind === "button"
}

export interface InputAdapter {
  /** Drop any queued events (call before opening a response window). */
  clear(): void;
  /**
   * Resolve with the next input event, or null once `deadline` (performance.now()
   * time-base) passes. Rejects on abort.
   */
  next(opts?: { deadline?: number; signal?: AbortSignal }): Promise<InputEventLike | null>;
  /** Inject a synthetic event (test hook / bot / control-bar buttons). */
  inject(ev: InputEventLike): void;
}

/** Minimal control-bar the shell provides; games declare their buttons. */
export interface ControlBar {
  /** Replace bottom-bar buttons. Presses arrive via InputAdapter as kind "button". */
  set(buttons: { id: string; label: string; key?: string; variant?: "primary" | "ghost" }[]): void;
  clear(): void;
}

export interface GameContext {
  canvas: HTMLCanvasElement;
  input: InputAdapter;
  controls: ControlBar;
  onTrialProgress(i: number, n: number): void;
  /** Fired as each trial completes (drives the opt-in speed readout). */
  onTrialResult?(result: TrialResult): void;
  /** Fired at each measured stimulus onset — the moment the RT clock starts.
   * Drives the opt-in real-time speed gauge; never fired during foreperiods. */
  onStimulus?(onset_ms: number): void;
  abortSignal: AbortSignal;
  /** True once since last consume() if the tab blurred/hid mid-trial. */
  interruption: { consume(): boolean };
  reducedMotion: boolean;
  /** Injectable clocks for headless tests; default to globals. */
  now?: () => number;
  raf?: (cb: (t: number) => void) => number;
}

export interface GameModule<S extends GameSpec = GameSpec> {
  id: GameId;
  domain: Domain;
  run(spec: S, ctx: GameContext): Promise<TrialResult[]>;
}

// ── Derived metrics (PRD §5/§6) ──

export interface SessionMetrics {
  accuracy: number;
  median_rt_ms: number | null;
  rt_iqr_ms: number | null;
  false_start_rate: number;
  performance_index: number; // ∈ [0,1]
  scoreable_trials: number;
}
