"""Determinism goldens — PRD §12: byte-identical canonical output."""

from pathlib import Path

import pytest

from app.specgen import GAME_DOMAINS, canonical_json, expected_trial_count, generate, spec_hash

GOLDENS = Path(__file__).parent / "goldens"
PAIRS = [(101, 0), (20260716, 45), (987654321, 100)]


@pytest.mark.parametrize("game_id", list(GAME_DOMAINS))
@pytest.mark.parametrize("seed,difficulty", PAIRS)
def test_golden_byte_identical(game_id: str, seed: int, difficulty: int):
    expected = (GOLDENS / f"{game_id}__{seed}__{difficulty}.json").read_text()
    assert canonical_json(generate(game_id, seed, difficulty)) == expected


@pytest.mark.parametrize("game_id", list(GAME_DOMAINS))
def test_generate_is_pure(game_id: str):
    a = generate(game_id, 424242, 50)
    b = generate(game_id, 424242, 50)
    assert canonical_json(a) == canonical_json(b)
    assert spec_hash(a) == spec_hash(b)
    # different seed → different puzzle
    c = generate(game_id, 424243, 50)
    assert spec_hash(a) != spec_hash(c)


def test_difficulty_parameter_mapping():
    fp0 = generate("flash_point", 1, 0)
    fp100 = generate("flash_point", 1, 100)
    assert fp0["response_window_ms"] == 900
    assert fp100["response_window_ms"] == 600
    assert len(fp0["trials"]) == 20
    assert all(1000 <= t["foreperiod_ms"] <= 4000 for t in fp0["trials"])

    rd0 = generate("reflex_drop", 1, 0)
    rd100 = generate("reflex_drop", 1, 100)
    assert rd0["catch_window_ms"] == 900
    assert rd100["catch_window_ms"] == 500
    assert len(rd0["trials"]) == 24
    assert rd0["rod_count"] == 6
    assert all(0 <= t["rod"] < 6 for t in rd0["trials"])
    assert all(1000 <= t["foreperiod_ms"] <= 4000 for t in rd0["trials"])
    # no immediate repeats — a repeat would let the player pre-position a finger
    rods = [t["rod"] for t in rd0["trials"]]
    assert all(a != b for a, b in zip(rods, rods[1:]))

    v100 = generate("vector", 1, 100)
    assert v100["response_window_ms"] == 700
    assert sum(t["reverse"] for t in v100["trials"]) == round(24 * 0.30)
    # four sectors, one per arrow key
    assert all(0 <= t["sector"] <= 3 for t in v100["trials"])
    assert {t["sector"] for t in generate("vector", 7, 50)["trials"]} == {0, 1, 2, 3}

    sw = generate("stackwise", 1, 60)
    assert sw["n"] == 3
    assert len(sw["presentations"]) == 20 + 2 * 3
    assert expected_trial_count("stackwise", sw) == 23

    dw = generate("drift_watch", 1, 75)
    assert dw["rounds"][0]["orb_count"] == 11
    assert len(dw["rounds"][0]["target_ids"]) == 4

    eg = generate("echo_grid", 1, 100)
    assert eg["trials"][0]["grid"] == 6
    assert len(eg["trials"][0]["cells"]) == 9
