"""Glicko-2 rating system — PRD §7.

One valid session = one match vs. an opponent of rating 800 + 12·difficulty
(RD 60); outcome s = performance_index (fractional scores accepted).
"""

import math
from dataclasses import dataclass

SCALE = 173.7178
TAU = 0.5
EPS = 1e-6


@dataclass
class Rating:
    rating: float = 1500.0
    rd: float = 350.0
    volatility: float = 0.06


def _g(phi: float) -> float:
    return 1 / math.sqrt(1 + 3 * phi**2 / math.pi**2)


def _e(mu: float, mu_j: float, phi_j: float) -> float:
    return 1 / (1 + math.exp(-_g(phi_j) * (mu - mu_j)))


def update(player: Rating, opponent: Rating, score: float) -> Rating:
    """Standard Glicko-2 update for a single match with fractional score."""
    mu = (player.rating - 1500) / SCALE
    phi = player.rd / SCALE
    mu_j = (opponent.rating - 1500) / SCALE
    phi_j = opponent.rd / SCALE

    g_j = _g(phi_j)
    e_j = _e(mu, mu_j, phi_j)
    v = 1 / (g_j**2 * e_j * (1 - e_j))
    delta = v * g_j * (score - e_j)

    # volatility iteration (Illinois algorithm)
    a = math.log(player.volatility**2)

    def f(x: float) -> float:
        ex = math.exp(x)
        return (ex * (delta**2 - phi**2 - v - ex)) / (2 * (phi**2 + v + ex) ** 2) - (x - a) / TAU**2

    big_a = a
    if delta**2 > phi**2 + v:
        big_b = math.log(delta**2 - phi**2 - v)
    else:
        k = 1
        while f(a - k * TAU) < 0:
            k += 1
        big_b = a - k * TAU

    fa, fb = f(big_a), f(big_b)
    while abs(big_b - big_a) > EPS:
        big_c = big_a + (big_a - big_b) * fa / (fb - fa)
        fc = f(big_c)
        if fc * fb <= 0:
            big_a, fa = big_b, fb
        else:
            fa = fa / 2
        big_b, fb = big_c, fc

    sigma_prime = math.exp(big_a / 2)
    phi_star = math.sqrt(phi**2 + sigma_prime**2)
    phi_prime = 1 / math.sqrt(1 / phi_star**2 + 1 / v)
    mu_prime = mu + phi_prime**2 * g_j * (score - e_j)

    return Rating(
        rating=mu_prime * SCALE + 1500,
        rd=phi_prime * SCALE,
        volatility=sigma_prime,
    )


def opponent_for_difficulty(difficulty: int) -> Rating:
    return Rating(rating=800 + 12 * difficulty, rd=60.0, volatility=0.06)
