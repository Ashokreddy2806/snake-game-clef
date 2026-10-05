"""Nokia Snake simulation environment and Clef System 1 decision engine."""

from __future__ import annotations

import os
import random
import sys
import time
from collections import deque
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Set, Tuple
import httpx
from dotenv import load_dotenv

# Load .env credentials from current directory, parent directory, and workspace root
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / "maze-jev-style" / ".env")

DIRECTIONS: Dict[str, Tuple[int, int]] = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}
DIR_OPPOSITES: Dict[str, str] = {
    "up": "down",
    "down": "up",
    "left": "right",
    "right": "left",
}


class FastPathCache:
    """Stage 1 zero-latency content-addressable SHA-256 state cache."""

    def __init__(self, max_size: int = 1024, ttl_seconds: int = 3600) -> None:
        self.max_size = max_size
        self.ttl = ttl_seconds
        self._cache: Dict[str, Any] = {}
        self.stats = SimpleNamespace(
            hits=0,
            misses=0,
            evictions=0,
            total_requests=0,
            hit_rate=0.0,
            total_latency_saved_ms=0.0,
        )

    @staticmethod
    def compute_state_hash(state_str: str, criteria: Dict[str, str]) -> str:
        import hashlib
        import json
        payload = f"{state_str}::{json.dumps(criteria, sort_keys=True)}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    def get(self, key: str) -> Optional[Any]:
        self.stats.total_requests += 1
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["ts"] < self.ttl:
                self.stats.hits += 1
                self.stats.total_latency_saved_ms += 420.0  # Estimated neural inference latency saved
                self.stats.hit_rate = round(self.stats.hits / self.stats.total_requests, 4)
                return entry["data"]
            else:
                del self._cache[key]
        self.stats.misses += 1
        self.stats.hit_rate = round(self.stats.hits / self.stats.total_requests, 4)
        return None

    def set(self, key: str, value: Any) -> None:
        if len(self._cache) >= self.max_size:
            first_k = next(iter(self._cache))
            del self._cache[first_k]
            self.stats.evictions += 1
        self._cache[key] = {"data": value, "ts": time.time()}

    def clear(self) -> None:
        self._cache.clear()
        self.stats.hits = 0
        self.stats.misses = 0
        self.stats.evictions = 0
        self.stats.total_requests = 0
        self.stats.hit_rate = 0.0
        self.stats.total_latency_saved_ms = 0.0


class CloudflareBackend:
    """Cloudflare Workers AI Clef Decision Model Backend."""

    def __init__(self, account_id: Optional[str] = None, api_token: Optional[str] = None, model: Optional[str] = None) -> None:
        self.account_id = account_id or os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
        self.api_token = api_token or os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
        self.model = model or os.getenv("CLOUDFLARE_MODEL", "@cf/cloudflare/clef-flash").strip()

    def is_configured(self) -> bool:
        return bool(self.account_id and self.api_token and not self.account_id.startswith("your_"))

    def query_decision_sync(self, payload: Any) -> Any:
        if not self.is_configured():
            raise RuntimeError("Cloudflare credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) not configured in .env")

        url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/ai/run/{self.model}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

        body = {
            "state": getattr(payload, "state", ""),
            "questions": getattr(payload, "questions", {}),
        }

        with httpx.Client(timeout=12.0) as client:
            resp = client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()

        result = data.get("result", {})
        answers = result.get("answers", {})
        move_ans = answers.get("move", {})

        selected = move_ans.get("choice")
        confidence = float(move_ans.get("confidence", 0.85))
        probs = move_ans.get("probabilities", {})

        if not selected:
            criteria = body.get("questions", {}).get("move", {}).get("criteria", {})
            valid_keys = [k for k in criteria if "danger" not in str(criteria[k]).lower()]
            selected = valid_keys[0] if valid_keys else "right"

        if not probs and selected:
            probs = {selected: confidence}

        return SimpleNamespace(selected_action=selected, confidence=confidence, probabilities=probs)


class MockHeuristicBackend:
    """Local high-speed heuristic decision engine."""

    def query_decision_sync(self, payload: Any) -> Any:
        questions = getattr(payload, "questions", {})
        move_q = questions.get("move", {})
        criteria = move_q.get("criteria", {}) if isinstance(move_q, dict) else getattr(move_q, "criteria", {})

        scored: Dict[str, float] = {}
        for d, crit in criteria.items():
            c_lower = str(crit).lower()
            if "critical danger" in c_lower or "death" in c_lower:
                scored[d] = 0.01
            elif "advances toward food" in c_lower:
                # Extract step count if present
                scored[d] = 5.0
                if "momentum" in c_lower:
                    scored[d] += 1.0
            elif "moves further" in c_lower:
                scored[d] = 1.0
            else:
                scored[d] = 2.0

        total = sum(scored.values()) or 1.0
        probs = {k: round(v / total, 3) for k, v in scored.items()}
        selected = max(probs, key=probs.get) if probs else "right"
        confidence = probs.get(selected, 0.85)

        return SimpleNamespace(selected_action=selected, confidence=confidence, probabilities=probs)


class SnakeEnvironment:
    """Authentic Nokia Monochrome Snake Grid Simulation."""

    def __init__(self, width: int = 16, height: int = 16) -> None:
        self.width = width
        self.height = height
        self.max_moves = 400
        self.reset()

    def reset(self) -> None:
        """Reset board, snake, food, and move counters."""
        center_y = self.height // 2
        center_x = self.width // 2
        self.snake: List[Tuple[int, int]] = [
            (center_x, center_y),
            (center_x - 1, center_y),
            (center_x - 2, center_y),
        ]
        self.direction: str = "right"
        self.score: int = 0
        self.move_count: int = 1
        self.is_game_over: bool = False
        self.is_win: bool = False
        self.game_over_reason: Optional[str] = None
        self.game_over_move: Optional[int] = None
        self.food: Tuple[int, int] = (center_x + 4, center_y)
        self.spawn_food()

    def spawn_food(self) -> None:
        """Spawn food randomly on an unoccupied tile."""
        snake_set = set(self.snake)
        empty_tiles = [
            (x, y)
            for x in range(self.width)
            for y in range(self.height)
            if (x, y) not in snake_set
        ]
        if not empty_tiles:
            self.is_game_over = True
            self.is_win = True
            self.game_over_reason = "board_cleared"
            self.game_over_move = self.move_count
            return
        self.food = random.choice(empty_tiles)

    def get_bfs_distance(self, start: Tuple[int, int], target: Tuple[int, int], obstacles: Set[Tuple[int, int]]) -> int:
        """Calculate BFS shortest path steps avoiding obstacles."""
        if start == target:
            return 0
        queue = deque([(start[0], start[1], 0)])
        visited = {start}
        while queue:
            cx, cy, dist = queue.popleft()
            if (cx, cy) == target:
                return dist
            for dx, dy in DIRECTIONS.values():
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < self.width and 0 <= ny < self.height and (nx, ny) not in obstacles and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny, dist + 1))
        return 999  # Unreachable

    def get_flood_fill_space(self, start: Tuple[int, int], obstacles: Set[Tuple[int, int]]) -> int:
        """Measure accessible connected free tiles from start."""
        if start in obstacles or not (0 <= start[0] < self.width and 0 <= start[1] < self.height):
            return 0
        queue = deque([start])
        visited = {start}
        count = 0
        while queue:
            cx, cy = queue.popleft()
            count += 1
            for dx, dy in DIRECTIONS.values():
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < self.width and 0 <= ny < self.height and (nx, ny) not in obstacles and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny))
        return count

    def build_clef_state_and_questions(self) -> Tuple[str, Dict[str, Any], str]:
        """Formulate typed System 1 Clef decision prompt and Fast-Path hash key."""
        head = self.snake[0]
        hx, hy = head
        fx, fy = self.food
        snake_body_set = set(self.snake[:-1])  # Tail will move unless food eaten

        state_lines = [
            f"Game: Nokia Monochrome Snake (Grid: {self.width}x{self.height}).",
            f"Move #{self.move_count} of max {self.max_moves}. Score: {self.score}.",
            f"Snake Head Position: ({hx}, {hy}), Current Heading: {self.direction}, Length: {len(self.snake)}.",
            f"Food Target Position: ({fx}, {fy}).",
            f"Perimeter: Walls at x < 0, x >= {self.width}, y < 0, y >= {self.height} (Instant Death).",
        ]

        criteria: Dict[str, str] = {}
        opp_dir = DIR_OPPOSITES.get(self.direction, "")

        for d_name, (dx, dy) in DIRECTIONS.items():
            if d_name == opp_dir:
                # Disallow 180-degree immediate reversal into neck
                continue

            nx, ny = hx + dx, hy + dy
            next_pos = (nx, ny)

            # Check Wall Collision
            if nx < 0 or nx >= self.width or ny < 0 or ny >= self.height:
                criteria[d_name] = f"Move {d_name} to ({nx}, {ny}); CRITICAL DANGER: Hits perimeter wall (Instant Death); Avoid."
                continue

            # Check Body Collision
            if next_pos in snake_body_set:
                criteria[d_name] = f"Move {d_name} to ({nx}, {ny}); CRITICAL DANGER: Collides with snake body segment (Instant Death); Avoid."
                continue

            # Compute BFS distance to food and safe open space
            dist_to_food = self.get_bfs_distance(next_pos, self.food, snake_body_set)
            cur_dist_to_food = self.get_bfs_distance(head, self.food, snake_body_set)
            safe_tiles = self.get_flood_fill_space(next_pos, snake_body_set)

            parts = [f"Step {d_name} to ({nx}, {ny})"]
            if next_pos == self.food:
                parts.append("EATS FOOD (+10 score, growth)")
            elif dist_to_food < cur_dist_to_food:
                parts.append(f"advances toward food ({dist_to_food} steps away)")
            elif dist_to_food < 900:
                parts.append(f"moves further from food ({dist_to_food} steps away)")
            else:
                parts.append("food path obstructed, pathfinding survival route")

            parts.append(f"{safe_tiles} safe open tiles accessible")
            if d_name == self.direction:
                parts.append("continues current forward momentum")

            criteria[d_name] = "; ".join(parts)

        questions = {
            "move": {
                "type": "choice",
                "instructions": "Which move (up, down, left, right) should Snake execute to collect food and avoid walls or self-collision?",
                "criteria": criteria,
            }
        }

        cache_key = f"h:({hx},{hy})|dir:{self.direction}|len:{len(self.snake)}|f:({fx},{fy})|crit:{tuple(sorted(criteria.items()))}"
        return "\n".join(state_lines), questions, cache_key

    def step(self, chosen_dir: str) -> None:
        """Execute chosen move direction."""
        hx, hy = self.snake[0]
        dx, dy = DIRECTIONS.get(chosen_dir, DIRECTIONS["right"])
        nx, ny = hx + dx, hy + dy
        new_head = (nx, ny)

        self.direction = chosen_dir
        self.move_count += 1

        # Check Wall Collision
        if nx < 0 or nx >= self.width or ny < 0 or ny >= self.height:
            self.is_game_over = True
            self.game_over_reason = "hit_wall"
            self.game_over_move = self.move_count
            return

        # Check Self Collision
        if new_head in self.snake:
            self.is_game_over = True
            self.game_over_reason = "hit_body"
            self.game_over_move = self.move_count
            return

        self.snake.insert(0, new_head)

        # Check Food Consumption
        if new_head == self.food:
            self.score += 10
            self.spawn_food()
        else:
            self.snake.pop()

        if self.move_count >= self.max_moves and not self.is_game_over:
            self.is_game_over = True
            self.game_over_reason = "moves_exhausted"
            self.game_over_move = self.move_count


class SnakeDecisionController:
    """Controller orchestrating Clef inference, Fast-Path Cache, and game execution."""

    def __init__(self, env: SnakeEnvironment) -> None:
        self.env = env
        self.cache = FastPathCache(max_size=1024, ttl_seconds=3600)
        self.cf_backend = CloudflareBackend()
        self.mock_backend = MockHeuristicBackend()
        self.active_backend = "cloudflare" if self.cf_backend.is_configured() else "mock"

    def set_backend(self, backend_name: str) -> None:
        if backend_name == "cloudflare" and self.cf_backend.is_configured():
            self.active_backend = "cloudflare"
        else:
            self.active_backend = "mock"

    def step(self, backend_override: Optional[str] = None) -> Dict[str, Any]:
        """Execute one decision step."""
        if backend_override:
            self.set_backend(backend_override)

        start_time = time.perf_counter()

        if self.env.is_game_over:
            return self.get_current_response(self.env.direction, 1.0, {self.env.direction: 1.0}, "environment", 0.05)

        state_str, questions, cache_key = self.env.build_clef_state_and_questions()
        criteria = questions["move"]["criteria"]
        state_hash = FastPathCache.compute_state_hash(cache_key, criteria)

        cached = self.cache.get(state_hash)
        if cached is not None:
            chosen_dir = cached["action"]
            conf = cached["confidence"]
            probs = cached["probabilities"]
            source = "cache"
        else:
            payload = SimpleNamespace(state=state_str, questions=questions)
            try:
                if self.active_backend == "cloudflare":
                    res = self.cf_backend.query_decision_sync(payload)
                    source = "cloudflare_clef"
                else:
                    res = self.mock_backend.query_decision_sync(payload)
                    source = "mock_engine"
            except Exception:
                res = self.mock_backend.query_decision_sync(payload)
                source = "mock_engine_fallback"

            chosen_dir = res.selected_action
            conf = res.confidence
            probs = res.probabilities
            self.cache.set(state_hash, {"action": chosen_dir, "confidence": conf, "probabilities": probs})

        # Ensure valid fallback if chosen_dir is invalid
        valid_candidates = [k for k, v in criteria.items() if "critical danger" not in str(v).lower()]
        if chosen_dir not in criteria or "critical danger" in str(criteria.get(chosen_dir, "")).lower():
            if valid_candidates:
                chosen_dir = valid_candidates[0]

        # Execute in environment
        self.env.step(chosen_dir)

        exec_time = (time.perf_counter() - start_time) * 1000.0
        return self.get_current_response(chosen_dir, conf, probs, source, exec_time)

    def get_current_response(self, action: str, confidence: float, probabilities: Dict[str, float], source: str, execution_time: float) -> Dict[str, Any]:
        stats = vars(self.cache.stats)
        return {
            "width": self.env.width,
            "height": self.env.height,
            "snake": self.env.snake,
            "direction": self.env.direction,
            "food": self.env.food,
            "score": self.env.score,
            "move_num": self.env.move_count,
            "max_moves": self.env.max_moves,
            "is_game_over": self.env.is_game_over,
            "is_win": self.env.is_win,
            "game_over_reason": self.env.game_over_reason,
            "game_over_move": self.env.game_over_move,
            "active_backend": self.active_backend,
            "source": source,
            "execution_time_ms": round(execution_time, 2),
            "answers": {
                "move": {
                    "type": "choice",
                    "choice": action,
                    "probabilities": {k: round(float(v), 3) for k, v in probabilities.items()},
                    "confidence": round(confidence, 3),
                }
            },
            "cache_stats": stats,
        }
