"""FastAPI application serving the Nokia Snake Clef Decision Benchmark."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict
import uvicorn
from fastapi import Body, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from snake_engine import SnakeEnvironment, SnakeDecisionController

app = FastAPI(title="Nokia Snake Clef System 1 Decision Benchmark")

env = SnakeEnvironment(width=16, height=16)
controller = SnakeDecisionController(env)
STATIC_DIR = Path(__file__).resolve().parent / "static"


@app.get("/api/state")
def get_state() -> Dict[str, Any]:
    """Retrieve full Snake game state and Clef decision telemetry."""
    _, questions, _ = env.build_clef_state_and_questions()
    criteria = questions["move"]["criteria"]
    candidates = list(criteria.keys())
    probs = {k: round(1.0 / len(candidates), 2) for k in candidates} if candidates else {"right": 1.0}

    stats = vars(controller.cache.stats)
    return {
        "width": env.width,
        "height": env.height,
        "snake": env.snake,
        "direction": env.direction,
        "food": env.food,
        "score": env.score,
        "move_num": env.move_count,
        "max_moves": env.max_moves,
        "is_game_over": env.is_game_over,
        "is_win": env.is_win,
        "game_over_reason": env.game_over_reason,
        "game_over_move": env.game_over_move,
        "active_backend": controller.active_backend,
        "answers": {
            "move": {
                "type": "choice",
                "choice": env.direction,
                "probabilities": probs,
                "confidence": 0.85,
            }
        },
        "cache_stats": stats,
    }


@app.post("/api/step")
def step_agent(payload: Dict[str, Any] = Body(default={})) -> Dict[str, Any]:
    """Execute one decision step with Clef."""
    try:
        manual_move = payload.get("direction")
        if manual_move in ("up", "down", "left", "right") and not env.is_game_over:
            env.step(manual_move)
            return controller.get_current_response(manual_move, 1.0, {manual_move: 1.0}, "manual_player", 1.0)
        return controller.step()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/reset")
def reset_game() -> Dict[str, Any]:
    """Reset snake and food back to start; preserves learned Fast-Path Cache."""
    env.reset()
    return get_state()


@app.post("/api/cache/clear")
def clear_cache() -> Dict[str, Any]:
    """Flush Fast-Path Cache entries and reset counters."""
    controller.cache.clear()
    stats = vars(controller.cache.stats)
    return {"status": "cleared", "cache_stats": stats}


@app.post("/api/backend")
def set_backend(backend: str = Body(..., embed=True)) -> Dict[str, Any]:
    """Switch active decision backend between 'cloudflare' and 'mock'."""
    controller.set_backend(backend)
    return {"active_backend": controller.active_backend}


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3000)
