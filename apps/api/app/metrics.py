"""Server-side metric recomputation from raw trials — the source of truth.

Mirrors packages/core/src/metrics.ts exactly (PRD §5/§6). Client metrics are
advisory only.
"""

import statistics
from typing import Any

Trial = dict[str, Any]


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return min(hi, max(lo, v))


def _scoreable(trials: list[Trial]) -> list[Trial]:
    return [t for t in trials if not t["false_start"] and not t["interrupted"]]


def _rts(trials: list[Trial]) -> list[float]:
    return [
        t["response_ms"] - t["onset_ms"]
        for t in trials
        if not t["false_start"]
        and not t["interrupted"]
        and t["response_ms"] is not None
        and t["correct"]
    ]


def median(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


def iqr(xs: list[float]) -> float | None:
    if len(xs) < 4:
        return None
    qs = statistics.quantiles(xs, n=4, method="inclusive")
    return qs[2] - qs[0]


def compute_metrics(game_id: str, trials: list[Trial]) -> dict[str, Any]:
    sc = _scoreable(trials)
    rt = _rts(trials)
    n_false = sum(1 for t in trials if t["false_start"])
    accuracy = (sum(1 for t in sc if t["correct"]) / len(sc)) if sc else 0.0
    med = median(rt)
    base = {
        "accuracy": accuracy,
        "median_rt_ms": med,
        "rt_iqr_ms": iqr(rt),
        "false_start_rate": (n_false / len(trials)) if trials else 0.0,
        "scoreable_trials": len(sc),
    }
    base["performance_index"] = performance_index(game_id, trials, base)
    return base


def performance_index(game_id: str, trials: list[Trial], m: dict[str, Any]) -> float:
    med = m["median_rt_ms"]
    sc = _scoreable(trials)

    if game_id == "flash_point":
        speed = 0.0 if med is None else _clamp((450 - med) / 250)
        return _clamp(0.7 * speed + 0.3 * (1 - m["false_start_rate"]))

    if game_id == "vector":
        speed = 0.0 if med is None else _clamp((900 - med) / 500)
        rev = [t for t in sc if t["payload"].get("reverse")]
        rev_acc = (sum(1 for t in rev if t["correct"]) / len(rev)) if rev else 0.0
        return _clamp(0.55 * m["accuracy"] + 0.35 * speed + 0.10 * rev_acc)

    if game_id == "stackwise":
        resp = [t for t in sc if t["payload"].get("is_match") is not None]
        matches = [t for t in resp if t["payload"]["is_match"]]
        non = [t for t in resp if not t["payload"]["is_match"]]
        hit = (sum(1 for t in matches if t["correct"]) / len(matches)) if matches else 0.0
        cr = (sum(1 for t in non if t["correct"]) / len(non)) if non else 0.0
        return _clamp((hit + cr) / 2)

    if game_id == "drift_watch":
        if not sc:
            return 0.0
        fr = [
            (t["payload"]["n_correct"] / len(t["payload"]["target_ids"]))
            if t["payload"].get("target_ids")
            else 0.0
            for t in sc
        ]
        return _clamp(sum(fr) / len(fr))

    if game_id == "wide_angle":
        if not sc:
            return 0.0
        c_acc = sum(1 for t in sc if t["payload"].get("center_ok")) / len(sc)
        b_acc = sum(1 for t in sc if t["payload"].get("bearing_ok")) / len(sc)
        return _clamp(0.5 * c_acc + 0.5 * b_acc)

    if game_id == "echo_grid":
        if not sc:
            return 0.0
        js = []
        for t in sc:
            p = t["payload"]
            inter = p["n_correct"]
            union = p["n_cells"] + len(p["chosen"]) - inter
            js.append(inter / union if union else 0.0)
        return _clamp(sum(js) / len(js))

    raise ValueError(f"Unknown game_id: {game_id}")


def display_score(performance_index_value: float, difficulty: int) -> int:
    """PRD §9: round(1000 · performance_index · (0.5 + difficulty/200))."""
    return round(1000 * performance_index_value * (0.5 + difficulty / 200))
