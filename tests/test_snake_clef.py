"""Tests for Nokia Snake Clef System 1 Decision Engine and FastAPI Server."""

import pytest
from fastapi.testclient import TestClient
from snake_engine import SnakeEnvironment, SnakeDecisionController, FastPathCache
from server import app


def test_snake_initialization():
    env = SnakeEnvironment(width=16, height=16)
    assert env.width == 16
    assert env.height == 16
    assert len(env.snake) == 3
    assert env.move_count == 1
    assert env.score == 0
    assert not env.is_game_over


def test_snake_wall_collision():
    env = SnakeEnvironment(width=16, height=16)
    env.snake = [(0, 5), (1, 5), (2, 5)]
    env.direction = "left"
    env.step("left")
    assert env.is_game_over
    assert env.game_over_reason == "hit_wall"
    assert env.game_over_move == 2


def test_snake_self_collision():
    env = SnakeEnvironment(width=16, height=16)
    env.snake = [(5, 5), (5, 6), (6, 6), (6, 5), (6, 4)]
    env.direction = "right"
    env.step("right")
    assert env.is_game_over
    assert env.game_over_reason == "hit_body"


def test_snake_food_eating():
    env = SnakeEnvironment(width=16, height=16)
    env.snake = [(5, 5), (4, 5), (3, 5)]
    env.food = (6, 5)
    env.step("right")
    assert not env.is_game_over
    assert env.score == 10
    assert len(env.snake) == 4
    assert env.snake[0] == (6, 5)


def test_clef_state_and_criteria_builder():
    env = SnakeEnvironment(width=16, height=16)
    state_str, questions, cache_key = env.build_clef_state_and_questions()
    assert "Nokia Monochrome Snake" in state_str
    assert "move" in questions
    assert "criteria" in questions["move"]
    assert "left" not in questions["move"]["criteria"]  # Disallows 180 reverse when facing right


def test_fast_path_cache():
    cache = FastPathCache()
    h = cache.compute_state_hash("state1", {"up": "move up"})
    assert cache.get(h) is None
    cache.set(h, {"action": "up", "confidence": 0.95, "probabilities": {"up": 0.95}})
    cached = cache.get(h)
    assert cached is not None
    assert cached["action"] == "up"
    assert cache.stats.hits == 1


def test_server_endpoints():
    client = TestClient(app)

    # GET /api/state
    res = client.get("/api/state")
    assert res.status_code == 200
    data = res.json()
    assert "snake" in data
    assert "food" in data
    assert "answers" in data

    # POST /api/step
    res = client.post("/api/step", json={})
    assert res.status_code == 200
    data = res.json()
    assert data["move_num"] == 2

    # POST /api/reset
    res = client.post("/api/reset")
    assert res.status_code == 200
    data = res.json()
    assert data["move_num"] == 1
