"""API contract tests — PRD §12: issue → tamper → assert correct statuses."""

import pytest

from .conftest import auth, bot_flash_point, bot_reflex_drop, login


async def issue(client, token, game_id="flash_point"):
    res = await client.post("/v1/sessions", json={"game_id": game_id}, headers=auth(token))
    assert res.status_code == 200
    return res.json()


async def test_full_valid_flow(client):
    token = await login(client)
    sess = await issue(client, token)
    assert sess["difficulty"] == 30 and len(sess["spec"]["trials"]) == 20

    trials = bot_flash_point(sess["spec"])
    res = await client.post(
        f"/v1/sessions/{sess['session_id']}/results",
        json={"token": sess["token"], "trials": trials, "device": {}},
        headers=auth(token),
    )
    body = res.json()
    assert res.status_code == 200 and body["status"] == "valid"
    assert body["new_rating"] is not None and body["display_score"] > 0
    assert body["leaderboard_rank"] == 1
    assert body["next_difficulty"] >= 30  # staircase moved or held

    # summary reflects the session
    summ = (await client.get("/v1/me/summary", headers=auth(token))).json()
    assert summ["cortex_index"] is not None
    assert summ["recent_sessions"][0]["status"] == "valid"

    # trial detail drives the trial data view
    detail = (
        await client.get(f"/v1/me/sessions/{sess['session_id']}", headers=auth(token))
    ).json()
    assert len(detail["trials"]) == 20


async def test_bad_token_401(client):
    token = await login(client)
    sess = await issue(client, token)
    res = await client.post(
        f"/v1/sessions/{sess['session_id']}/results",
        json={"token": "f" * 64, "trials": bot_flash_point(sess["spec"]), "device": {}},
        headers=auth(token),
    )
    assert res.status_code == 401


async def test_duplicate_submit_409(client):
    token = await login(client)
    sess = await issue(client, token)
    payload = {"token": sess["token"], "trials": bot_flash_point(sess["spec"]), "device": {}}
    first = await client.post(
        f"/v1/sessions/{sess['session_id']}/results", json=payload, headers=auth(token)
    )
    assert first.status_code == 200
    dup = await client.post(
        f"/v1/sessions/{sess['session_id']}/results", json=payload, headers=auth(token)
    )
    assert dup.status_code == 409


async def test_sub90_rts_rejected(client):
    token = await login(client)
    sess = await issue(client, token)
    trials = bot_flash_point(sess["spec"])
    for t in trials:
        if t["response_ms"] is not None:
            t["response_ms"] = t["onset_ms"] + 45  # all anticipatory
    res = await client.post(
        f"/v1/sessions/{sess['session_id']}/results",
        json={"token": sess["token"], "trials": trials, "device": {}},
        headers=auth(token),
    )
    body = res.json()
    assert body["status"] == "rejected" and body["reason"] == "false_start_rate"


async def test_other_users_session_404(client):
    token_a = await login(client, "alice")
    token_b = await login(client, "bob")
    sess = await issue(client, token_a)
    res = await client.post(
        f"/v1/sessions/{sess['session_id']}/results",
        json={"token": sess["token"], "trials": [], "device": {}},
        headers=auth(token_b),
    )
    assert res.status_code == 404


async def test_leaderboard_ranks_two_users(client):
    for handle, rt in [("fast_fran", 220.0), ("slow_sam", 380.0)]:
        token = await login(client, handle)
        sess = await issue(client, token)
        res = await client.post(
            f"/v1/sessions/{sess['session_id']}/results",
            json={"token": sess["token"], "trials": bot_flash_point(sess["spec"], rt_median=rt), "device": {}},
            headers=auth(token),
        )
        assert res.json()["status"] == "valid"

    token = await login(client, "slow_sam")
    board = (await client.get("/v1/leaderboards/flash_point", headers=auth(token))).json()
    assert [e["handle"] for e in board["entries"]] == ["fast_fran", "slow_sam"]
    assert board["me"]["rank"] == 2


async def test_reflex_drop_full_valid_flow(client):
    """Second processing_speed game: issue → play → validate → rate."""
    token = await login(client, "dropper")
    sess = await issue(client, token, game_id="reflex_drop")
    assert sess["spec"]["rod_count"] == 6
    assert len(sess["spec"]["trials"]) == 24

    res = await client.post(
        f"/v1/sessions/{sess['session_id']}/results",
        json={"token": sess["token"], "trials": bot_reflex_drop(sess["spec"]), "device": {}},
        headers=auth(token),
    )
    body = res.json()
    assert body["status"] == "valid", body
    assert 0.0 <= body["server_metrics"]["performance_index"] <= 1.0
    assert body["new_rating"] is not None

    # It rates the same domain Flash Point does.
    summary = (await client.get("/v1/me/summary", headers=auth(token))).json()
    domains = {r["domain"] for r in summary["ratings"]}
    assert domains == {"processing_speed"}
    speed_games = [g["id"] for g in summary["games"] if g["domain"] == "processing_speed"]
    assert sorted(speed_games) == ["flash_point", "reflex_drop"]


async def test_reflex_drop_staircase_convergence(client):
    """Bot with fixed ability stabilizes within ±8 difficulty across 12 sessions."""
    token = await login(client, "steady_dropper")
    difficulties = []
    for i in range(12):
        sess = await issue(client, token, game_id="reflex_drop")
        difficulties.append(sess["difficulty"])
        res = await client.post(
            f"/v1/sessions/{sess['session_id']}/results",
            json={
                "token": sess["token"],
                "trials": bot_reflex_drop(sess["spec"], seed=100 + i),
                "device": {},
            },
            headers=auth(token),
        )
        assert res.json()["status"] == "valid"
    tail = difficulties[-4:]
    assert max(tail) - min(tail) <= 8, difficulties


async def test_staircase_convergence(client):
    """Bot with fixed ability stabilizes within ±8 difficulty across 12 sessions."""
    token = await login(client, "steady_bot")
    difficulties = []
    for i in range(12):
        sess = await issue(client, token)
        difficulties.append(sess["difficulty"])
        trials = bot_flash_point(sess["spec"], rt_median=300, seed=100 + i)
        res = await client.post(
            f"/v1/sessions/{sess['session_id']}/results",
            json={"token": sess["token"], "trials": trials, "device": {}},
            headers=auth(token),
        )
        assert res.json()["status"] == "valid"
    tail = difficulties[-4:]
    assert max(tail) - min(tail) <= 8, difficulties
