/** Typed API client for the CortexWatt FastAPI backend.
 * (Types mirror apps/api/app/schemas.py; regenerate seam: `make client`.) */

import type { GameSpec, SessionMetrics, TrialResult } from "@cortexwatt/core";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`${status}: ${detail}`);
  }
}

function token(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cw_token");
}

export function setToken(t: string | null): void {
  if (t === null) localStorage.removeItem("cw_token");
  else localStorage.setItem("cw_token", t);
}

export function hasToken(): boolean {
  return token() !== null;
}

async function call<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { detail?: string }).detail ?? res.statusText);
  return data as T;
}

// ── Types ──

export interface RatingSnapshot {
  domain: string;
  rating: number;
  rd: number;
}

export interface GameCatalogItem {
  id: string;
  domain: string;
  name: string;
  difficulty: number;
  rating: number | null;
  rd: number | null;
  last_played: string | null;
  best_display_score: number | null;
}

export interface MeSummary {
  user_id: string;
  handle: string;
  ratings: RatingSnapshot[];
  cortex_index: number | null;
  ci_history: { value: number; at: string }[];
  recent_sessions: {
    session_id: string;
    game_id: string;
    status: string;
    difficulty: number;
    submitted_at: string | null;
    server_metrics: SessionMetrics | null;
  }[];
  thirty_day_averages: Record<string, Partial<SessionMetrics>>;
  games: GameCatalogItem[];
}

export interface IssuedSession {
  session_id: string;
  seed: number;
  difficulty: number;
  spec: GameSpec;
  token: string;
  expires_at: string;
}

export interface DeviceInfo {
  user_agent?: string;
  viewport?: [number, number];
  input_type?: string;
  device_pixel_ratio?: number;
  refresh_interval_ms?: number;
  refresh_hz?: number;
}

export interface SubmitResult {
  status: "valid" | "rejected" | "quarantined";
  reason: string | null;
  server_metrics: SessionMetrics | null;
  display_score: number | null;
  rating_change: number | null;
  new_rating: number | null;
  new_rd: number | null;
  next_difficulty: number | null;
  cortex_index: number | null;
  leaderboard_rank: number | null;
}

export interface SessionDetail {
  session_id: string;
  game_id: string;
  difficulty: number;
  status: string;
  server_metrics: SessionMetrics | null;
  device: DeviceInfo | null;
  submitted_at: string | null;
  trials: TrialResult[];
}

export interface Leaderboard {
  board: string;
  period: string;
  entries: { score: number; rank: number; handle: string; is_me: boolean }[];
  me: { rank: number | null; score: number | null };
}

// ── Endpoints ──

export const api = {
  devLogin: (handle: string, birth_year?: number) =>
    call<{ user_id: string; handle: string; token: string }>("/v1/auth/dev-login", {
      method: "POST",
      body: { handle, birth_year },
    }),

  summary: () => call<MeSummary>("/v1/me/summary"),

  issueSession: (game_id: string) =>
    call<IssuedSession>("/v1/sessions", { method: "POST", body: { game_id } }),

  submitResults: (
    session_id: string,
    body: {
      token: string;
      client_metrics: SessionMetrics;
      trials: TrialResult[];
      device: DeviceInfo;
    },
  ) => call<SubmitResult>(`/v1/sessions/${session_id}/results`, { method: "POST", body }),

  sessionDetail: (session_id: string) => call<SessionDetail>(`/v1/me/sessions/${session_id}`),

  leaderboard: (board: string) => call<Leaderboard>(`/v1/leaderboards/${board}?period=weekly`),
};
