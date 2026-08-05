"""Deterministic puzzle spec generation — PRD §3/§6.

`generate(game_id, seed, difficulty)` is a pure function of its arguments,
using random.Random(seed). Golden tests assert byte-identical canonical output.
"""

import hashlib
import json
import math
import random
from typing import Any

Spec = dict[str, Any]

GAME_DOMAINS = {
    "flash_point": "processing_speed",
    "reflex_drop": "processing_speed",
    "vector": "decision_control",
    "stackwise": "working_memory",
    "drift_watch": "attention",
    "wide_angle": "visual",
    "echo_grid": "memory",
}


def canonical_json(spec: Spec) -> str:
    return json.dumps(spec, sort_keys=True, separators=(",", ":"))


def spec_hash(spec: Spec) -> str:
    return hashlib.sha256(canonical_json(spec).encode()).hexdigest()


def _foreperiod(rng: random.Random) -> int:
    """Truncated exponential, 1000–4000 ms, mean ≈ 1800 ms (PRD §4.4)."""
    lo, hi, mean = 1000, 4000, 800
    cap = 1 - math.exp(-(hi - lo) / mean)
    u = rng.random() * cap
    return round(lo + -mean * math.log(1 - u))


def stackwise_n(d: int) -> int:
    if d >= 85:
        return 4
    if d >= 55:
        return 3
    if d >= 25:
        return 2
    return 1


def expected_trial_count(game_id: str, spec: Spec) -> int:
    if game_id == "stackwise":
        return len(spec["presentations"]) - spec["n"]
    if game_id == "drift_watch":
        return len(spec["rounds"])
    return len(spec["trials"])


def generate(game_id: str, seed: int, difficulty: int) -> Spec:
    d = max(0, min(100, difficulty))
    rng = random.Random(seed)

    if game_id == "flash_point":
        return {
            "game": "flash_point",
            "trials": [{"foreperiod_ms": _foreperiod(rng)} for _ in range(20)],
            "response_window_ms": round(900 - 3 * d),
        }

    if game_id == "reflex_drop":
        rod_count = 6
        trials = []
        prev = -1
        for _ in range(24):
            # No immediate repeats: a rod dropping twice in a row would let the
            # player pre-position a finger, collapsing the six-choice decision.
            rod = rng.randint(0, rod_count - 1)
            while rod == prev:
                rod = rng.randint(0, rod_count - 1)
            trials.append({"rod": rod, "foreperiod_ms": _foreperiod(rng)})
            prev = rod
        return {
            "game": "reflex_drop",
            "rod_count": rod_count,
            "trials": trials,
            "catch_window_ms": round(900 - 4 * d),
        }

    if game_id == "vector":
        n = 24
        reverse_count = round(n * (10 + 0.2 * d) / 100)
        flags = [True] * reverse_count + [False] * (n - reverse_count)
        rng.shuffle(flags)
        return {
            "game": "vector",
            "trials": [
                {
                    # sector 0–3, clockwise from up: 0 = up, 1 = right,
                    # 2 = down, 3 = left — one per arrow key.
                    "sector": rng.randint(0, 3),
                    "reverse": rev,
                    "foreperiod_ms": _foreperiod(rng),
                }
                for rev in flags
            ],
            "response_window_ms": round(1500 - 8 * d),
        }

    if game_id == "stackwise":
        n_back = stackwise_n(d)
        total = 20 + 2 * n_back
        cells: list[int] = []
        consecutive = 0
        for i in range(total):
            if i < n_back:
                cells.append(rng.randint(0, 8))
                continue
            want_match = rng.random() < 0.3 and consecutive < 2
            if want_match:
                cells.append(cells[i - n_back])
                consecutive += 1
            else:
                cell = rng.randint(0, 8)
                while cell == cells[i - n_back]:
                    cell = rng.randint(0, 8)
                cells.append(cell)
                consecutive = 0
        return {
            "game": "stackwise",
            "n": n_back,
            "presentations": [{"cell": c} for c in cells],
            "isi_ms": round(2300 - 6 * d),
        }

    if game_id == "drift_watch":
        orb_count = 8 + d // 25
        n_targets = 4 if d >= 70 else 3
        return {
            "game": "drift_watch",
            "rounds": [
                {
                    "orb_count": orb_count,
                    "target_ids": sorted(rng.sample(range(orb_count), n_targets)),
                    "motion_seed": rng.randint(1, 2**31 - 1),
                }
                for _ in range(6)
            ],
            "drift_speed": round(70 + 1.2 * d),
            "duration_ms": 8000,
        }

    if game_id == "wide_angle":
        return {
            "game": "wide_angle",
            "trials": [
                {
                    "center_symbol": rng.randint(0, 1),
                    "bearing_arc": rng.randint(0, 11),
                    "eccentricity_pct": round(15 + 0.3 * d),
                    "distractors": d // 8,
                    "flash_ms": round(300 - 1.8 * d),
                    "foreperiod_ms": _foreperiod(rng),
                }
                for _ in range(16)
            ],
        }

    if game_id == "echo_grid":
        grid = 4 + d // 40
        n_cells = 3 + d // 16
        return {
            "game": "echo_grid",
            "trials": [
                {
                    "grid": grid,
                    "cells": sorted(rng.sample(range(grid * grid), n_cells)),
                    "expose_ms": round(1500 - 6 * d),
                    "delay_ms": round(1000 + 20 * d),
                }
                for _ in range(8)
            ],
        }

    raise ValueError(f"Unknown game_id: {game_id}")
