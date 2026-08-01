"""Server-side validation gates — PRD §8. Pure functions; run in order, first
failure wins. Returns (status, reason, possibly-reclassified trials)."""

from typing import Any

from .metrics import compute_metrics, median
from .specgen import expected_trial_count

Trial = dict[str, Any]

RT_SCORED_GAMES = {"flash_point", "reflex_drop", "vector"}

REQUIRED_PAYLOAD_KEYS: dict[str, set[str]] = {
    "flash_point": set(),
    "reflex_drop": {"rod", "responded_rod"},
    "vector": {"sector", "reverse", "responded_sector"},
    "stackwise": {"is_match", "responded_match"},
    "drift_watch": {"selected_ids", "target_ids", "n_correct"},
    "wide_angle": {"center_ok", "bearing_ok", "chosen_arc"},
    "echo_grid": {"chosen", "n_correct", "n_extra", "n_cells"},
}


class GateResult:
    def __init__(self, status: str, reason: str | None = None, trials: list[Trial] | None = None):
        self.status = status  # "valid" | "rejected" | "quarantined"
        self.reason = reason
        self.trials = trials or []


def payload_shape_ok(game_id: str, spec: dict, trials: list[Trial]) -> bool:
    required = REQUIRED_PAYLOAD_KEYS[game_id]
    for t in trials:
        if not required <= set(t["payload"].keys()):
            return False
    if game_id == "reflex_drop":
        for t, trial_spec in zip(trials, spec["trials"]):
            # The client may not restate which rod dropped — that comes from the spec.
            if t["payload"]["rod"] != trial_spec["rod"]:
                return False
            responded = t["payload"]["responded_rod"]
            if responded is not None and not 0 <= responded < spec["rod_count"]:
                return False
    if game_id == "drift_watch":
        for t, round_spec in zip(trials, spec["rounds"]):
            ids = set(range(round_spec["orb_count"]))
            if not set(t["payload"]["selected_ids"]) <= ids:
                return False
            if sorted(t["payload"]["target_ids"]) != round_spec["target_ids"]:
                return False
    if game_id == "echo_grid":
        for t, trial_spec in zip(trials, spec["trials"]):
            cells = set(range(trial_spec["grid"] ** 2))
            if not set(t["payload"]["chosen"]) <= cells:
                return False
            if t["payload"]["n_cells"] != len(trial_spec["cells"]):
                return False
    return True


def run_gates(game_id: str, spec: dict, difficulty: int, trials: list[Trial]) -> GateResult:
    # Gate 3 — trial count & payload shape (1–2 are handled at the endpoint:
    # token/expiry/duplicate and spec-hash regeneration).
    if len(trials) != expected_trial_count(game_id, spec):
        return GateResult("rejected", "trial_count_mismatch")
    if not payload_shape_ok(game_id, spec, trials):
        return GateResult("rejected", "payload_shape_invalid")

    # Gate 4 — sub-90 ms responses on non-false-start trials → reclassify;
    # >30% false starts overall → rejected.
    trials = [dict(t) for t in trials]
    for t in trials:
        if (
            not t["false_start"]
            and t["response_ms"] is not None
            and (t["response_ms"] - t["onset_ms"]) < 90
        ):
            t["false_start"] = True
            t["correct"] = False
    n_false = sum(1 for t in trials if t["false_start"])
    if trials and n_false / len(trials) > 0.30:
        return GateResult("rejected", "false_start_rate", trials)

    # Gate 5 — median RT < 140 ms on RT-scored games.
    if game_id in RT_SCORED_GAMES:
        rts = [
            t["response_ms"] - t["onset_ms"]
            for t in trials
            if not t["false_start"] and not t["interrupted"] and t["response_ms"] is not None
        ]
        med = median(rts)
        if med is not None and med < 140:
            return GateResult("rejected", "median_rt_too_fast", trials)

    # Gate 6 — interrupted trials > 20%.
    n_int = sum(1 for t in trials if t["interrupted"])
    if trials and n_int / len(trials) > 0.20:
        return GateResult("rejected", "interrupted_rate", trials)

    # Gate 7 — perfect index at implausible speed on high difficulty.
    m = compute_metrics(game_id, trials)
    if (
        m["performance_index"] == 1.0
        and m["median_rt_ms"] is not None
        and m["median_rt_ms"] < 180
        and difficulty > 60
    ):
        return GateResult("quarantined", "implausible_perfection", trials)

    return GateResult("valid", None, trials)


def rating_jump_guard(old_rd: float, old_rating: float, new_rating: float) -> bool:
    """Gate 8 — True means quarantine: RD < 100 moving > 150 points."""
    return old_rd < 100 and abs(new_rating - old_rating) > 150
