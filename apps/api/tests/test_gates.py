"""One test per validation gate in §8, including quarantine paths."""

from app.glicko import Rating, opponent_for_difficulty, update
from app.metrics import compute_metrics
from app.specgen import generate
from app.validation import rating_jump_guard, run_gates

from .conftest import bot_flash_point, bot_reflex_drop


def make(spec=None, **bot_kwargs):
    spec = spec or generate("flash_point", 5, 30)
    return spec, bot_flash_point(spec, **bot_kwargs)


def test_gate3_trial_count_mismatch():
    spec, trials = make()
    res = run_gates("flash_point", spec, 30, trials[:-1])
    assert res.status == "rejected" and res.reason == "trial_count_mismatch"


def test_gate3_payload_shape_invalid():
    spec = generate("echo_grid", 5, 30)
    trials = [
        dict(trial_index=i, onset_ms=1000 + i, response_ms=2000 + i, correct=True,
             false_start=False, interrupted=False, payload={})  # missing required keys
        for i in range(len(spec["trials"]))
    ]
    res = run_gates("echo_grid", spec, 30, trials)
    assert res.status == "rejected" and res.reason == "payload_shape_invalid"


def test_gate3_reflex_drop_restated_target_rod_rejected():
    """The client may not tell the server which rod dropped — the spec does."""
    spec = generate("reflex_drop", 5, 30)
    trials = bot_reflex_drop(spec)
    # claim the rod you grabbed was the one that fell
    trials[3]["payload"] = {"rod": (spec["trials"][3]["rod"] + 1) % 6, "responded_rod": None}
    res = run_gates("reflex_drop", spec, 30, trials)
    assert res.status == "rejected" and res.reason == "payload_shape_invalid"


def test_gate3_reflex_drop_rod_out_of_range_rejected():
    spec = generate("reflex_drop", 5, 30)
    trials = bot_reflex_drop(spec)
    trials[0]["payload"] = {"rod": spec["trials"][0]["rod"], "responded_rod": 99}
    res = run_gates("reflex_drop", spec, 30, trials)
    assert res.status == "rejected" and res.reason == "payload_shape_invalid"


def test_gate5_reflex_drop_is_rt_scored():
    """Six-choice RTs still can't beat the 140 ms physiological floor."""
    spec = generate("reflex_drop", 5, 30)
    trials = bot_reflex_drop(spec, rt_median=120.0, accuracy=1.0)
    res = run_gates("reflex_drop", spec, 30, trials)
    assert res.status == "rejected" and res.reason == "median_rt_too_fast"


def test_reflex_drop_wrong_rod_costs_accuracy_not_speed():
    """A grab at the wrong rod is a real response: it lowers accuracy, and its
    latency is excluded from median RT (which scores catches only)."""
    spec = generate("reflex_drop", 5, 30)
    clean = compute_metrics("reflex_drop", bot_reflex_drop(spec, accuracy=1.0))
    sloppy = compute_metrics("reflex_drop", bot_reflex_drop(spec, accuracy=0.6))
    assert sloppy["accuracy"] < clean["accuracy"]
    assert sloppy["performance_index"] < clean["performance_index"]


def test_gate4_sub90_reclassified_as_false_start():
    spec, trials = make()
    # one anticipatory response at 40 ms — should be reclassified, not rejected
    trials[0]["response_ms"] = trials[0]["onset_ms"] + 40
    res = run_gates("flash_point", spec, 30, trials)
    assert res.status == "valid"
    assert res.trials[0]["false_start"] is True and res.trials[0]["correct"] is False


def test_gate4_too_many_false_starts_rejected():
    spec, trials = make()
    for t in trials[: int(len(trials) * 0.4)]:
        t["response_ms"] = t["onset_ms"] + 50  # sub-90 → reclassified
    res = run_gates("flash_point", spec, 30, trials)
    assert res.status == "rejected" and res.reason == "false_start_rate"


def test_gate5_median_rt_too_fast():
    spec, trials = make(rt_median=110)  # >90 so not reclassified, but median < 140
    res = run_gates("flash_point", spec, 30, trials)
    assert res.status == "rejected" and res.reason == "median_rt_too_fast"


def test_gate6_interrupted_rate():
    spec, trials = make()
    for t in trials[: int(len(trials) * 0.3)]:
        t["interrupted"] = True
    res = run_gates("flash_point", spec, 30, trials)
    assert res.status == "rejected" and res.reason == "interrupted_rate"


def test_gate7_implausible_perfection_quarantined():
    # perfect index requires median RT ≤ 200 (speed=1) and zero false starts;
    # spec difficulty > 60 triggers the quarantine combination at RT < 180.
    spec = generate("flash_point", 5, 70)
    trials = bot_flash_point(spec, rt_median=165)
    for t in trials:  # force uniform fast-but-legal RTs
        t["response_ms"] = t["onset_ms"] + 165
        t["correct"] = True
    res = run_gates("flash_point", spec, 70, trials)
    assert res.status == "quarantined" and res.reason == "implausible_perfection"


def test_gate8_rating_jump_guard():
    assert rating_jump_guard(old_rd=80, old_rating=1500, new_rating=1700) is True
    assert rating_jump_guard(old_rd=80, old_rating=1500, new_rating=1600) is False
    assert rating_jump_guard(old_rd=200, old_rating=1500, new_rating=1900) is False


def test_valid_path_produces_metrics():
    spec, trials = make()
    res = run_gates("flash_point", spec, 30, trials)
    assert res.status == "valid"
    m = compute_metrics("flash_point", res.trials)
    assert 0 < m["performance_index"] <= 1
    assert m["median_rt_ms"] is not None and m["median_rt_ms"] > 140


def test_glicko_update_directionality():
    player = Rating()
    strong = update(player, opponent_for_difficulty(30), 0.95)
    weak = update(player, opponent_for_difficulty(30), 0.10)
    assert strong.rating > player.rating > weak.rating
    assert strong.rd < player.rd  # certainty grows with evidence
