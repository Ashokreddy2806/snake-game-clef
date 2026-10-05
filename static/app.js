/**
 * Nokia Snake Clef System 1 Benchmark Visualizer Controller
 */

let gameState = null;
let isAutoPlaying = false;
let autoPlayTimer = null;

// DOM Elements
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const lcdScoreEl = document.getElementById("lcdScore");
const lcdMoveEl = document.getElementById("lcdMove");
const lcdHighScoreEl = document.getElementById("lcdHighScore");
const moveCounterEl = document.getElementById("move-counter");
const scoreDisplayEl = document.getElementById("score-display");
const sourceBadgeEl = document.getElementById("source-badge");
const gameBannerEl = document.getElementById("game-banner");
const bannerIconEl = document.getElementById("banner-icon");
const bannerTextEl = document.getElementById("banner-text");
const jsonCodeEl = document.getElementById("json-code");
const latencyBadgeEl = document.getElementById("latency-badge");
const cacheHitRateEl = document.getElementById("cache-hit-rate");
const cacheSavedEl = document.getElementById("cache-saved");
const btnStep = document.getElementById("btn-step");
const btnAutoPlay = document.getElementById("btn-autoplay");
const btnReset = document.getElementById("btn-reset");
const btnClearCache = document.getElementById("btn-clear-cache");
const backendSelect = document.getElementById("backend-select");
const speedSlider = document.getElementById("speed-slider");
const speedLabel = document.getElementById("speed-label");

const btnUp = document.getElementById("btnUp");
const btnDown = document.getElementById("btnDown");
const btnLeft = document.getElementById("btnLeft");
const btnRight = document.getElementById("btnRight");

let highScore = parseInt(localStorage.getItem("nokia_snake_highscore") || "0", 10);

async function init() {
  if (lcdHighScoreEl) lcdHighScoreEl.innerText = highScore.toString().padStart(4, "0");
  await fetchState();
  setupEventListeners();
}

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    gameState = await res.json();
    if (backendSelect && gameState.active_backend) {
      backendSelect.value = gameState.active_backend;
    }
    renderCanvas();
    updateInspector(gameState);
  } catch (err) {
    console.error("Failed to fetch initial state:", err);
  }
}

function renderCanvas() {
  if (!gameState) return;
  const { width, height, snake, food, direction } = gameState;
  const tileSize = canvas.width / width;

  // Clear LCD background
  ctx.fillStyle = "#98b068";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Pixel Grid dots
  ctx.fillStyle = "rgba(37, 51, 21, 0.08)";
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      ctx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
    }
  }

  // Draw Food
  if (food) {
    const fx = food[0] * tileSize;
    const fy = food[1] * tileSize;
    const half = tileSize / 2;
    ctx.fillStyle = "#253315";
    ctx.fillRect(fx + 2, fy + 2, half - 2, half - 2);
    ctx.fillRect(fx + half + 1, fy + half + 1, half - 2, half - 2);
    ctx.fillRect(fx + half - 2, fy + half - 2, 4, 4);
  }

  // Draw Snake
  if (snake && snake.length > 0) {
    snake.forEach((seg, idx) => {
      const sx = seg[0] * tileSize;
      const sy = seg[1] * tileSize;
      const pad = 1.5;

      if (idx === 0) {
        // Head
        ctx.fillStyle = "#1c2810";
        ctx.fillRect(sx + pad, sy + pad, tileSize - pad * 2, tileSize - pad * 2);

        // Eyes
        ctx.fillStyle = "#98b068";
        if (direction === "right") {
          ctx.fillRect(sx + tileSize - 6, sy + 4, 2, 2);
          ctx.fillRect(sx + tileSize - 6, sy + tileSize - 6, 2, 2);
        } else if (direction === "left") {
          ctx.fillRect(sx + 4, sy + 4, 2, 2);
          ctx.fillRect(sx + 4, sy + tileSize - 6, 2, 2);
        } else if (direction === "down") {
          ctx.fillRect(sx + 4, sy + tileSize - 6, 2, 2);
          ctx.fillRect(sx + tileSize - 6, sy + tileSize - 6, 2, 2);
        } else if (direction === "up") {
          ctx.fillRect(sx + 4, sy + 4, 2, 2);
          ctx.fillRect(sx + tileSize - 6, sy + 4, 2, 2);
        }
      } else {
        // Body
        ctx.fillStyle = "#253315";
        ctx.fillRect(sx + pad, sy + pad, tileSize - pad * 2, tileSize - pad * 2);
        ctx.fillStyle = "#3a4e22";
        ctx.fillRect(sx + pad + 2, sy + pad + 2, tileSize - (pad + 2) * 2, tileSize - (pad + 2) * 2);
      }
    });
  }

  // Update LCD Status Bar
  if (lcdScoreEl && gameState.score !== undefined) {
    lcdScoreEl.innerText = gameState.score.toString().padStart(4, "0");
  }
  if (lcdMoveEl && gameState.move_num !== undefined) {
    lcdMoveEl.innerText = gameState.move_num.toString().padStart(4, "0");
  }
}

async function performStep(manualDirection = null) {
  if (gameState && gameState.is_game_over) {
    stopAutoPlay();
    return;
  }

  btnStep.disabled = true;

  try {
    const body = manualDirection ? { direction: manualDirection } : {};
    const res = await fetch("/api/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    gameState = data;

    if (data.score > highScore) {
      highScore = data.score;
      localStorage.setItem("nokia_snake_highscore", highScore.toString());
      if (lcdHighScoreEl) lcdHighScoreEl.innerText = highScore.toString().padStart(4, "0");
    }

    renderCanvas();
    updateInspector(data);

    if (data.is_game_over || data.is_win) {
      stopAutoPlay();
    }
  } catch (err) {
    console.error("Step failed:", err);
  } finally {
    btnStep.disabled = false;
  }
}

function updateInspector(data) {
  // Move counter
  if (moveCounterEl && data.move_num !== undefined) {
    moveCounterEl.innerText = `Move ${data.move_num} of ${data.max_moves || 400}`;
  }

  // Score
  if (scoreDisplayEl && data.score !== undefined) {
    scoreDisplayEl.innerText = `Score: ${data.score}`;
  }

  // Source Badge
  if (sourceBadgeEl) {
    sourceBadgeEl.className = "source-badge";
    const src = data.source || "initial";
    if (src === "cache") {
      sourceBadgeEl.classList.add("badge-cache");
      sourceBadgeEl.innerText = "⚡ Stage 1 Cache";
    } else if (src === "cloudflare_clef") {
      sourceBadgeEl.classList.add("badge-clef");
      sourceBadgeEl.innerText = "☁️ Clef-Flash";
    } else if (src === "mock_engine") {
      sourceBadgeEl.classList.add("badge-mock");
      sourceBadgeEl.innerText = "🤖 Heuristic";
    } else if (src === "manual_player") {
      sourceBadgeEl.classList.add("badge-mock");
      sourceBadgeEl.innerText = "🎮 Manual Input";
    } else {
      sourceBadgeEl.classList.add("badge-clef");
      sourceBadgeEl.innerText = "⚡ Clef Ready";
    }
  }

  // Game Status Banner
  if (gameBannerEl) {
    if (data.is_game_over) {
      gameBannerEl.classList.remove("hidden");
      if (data.is_win) {
        gameBannerEl.className = "game-banner banner-victory";
        if (bannerIconEl) bannerIconEl.innerText = "🏆";
        if (bannerTextEl) bannerTextEl.innerText = `Victory! Board cleared in ${data.move_num} moves!`;
      } else if (data.game_over_reason === "hit_wall") {
        gameBannerEl.className = "game-banner banner-defeat";
        if (bannerIconEl) bannerIconEl.innerText = "💀";
        if (bannerTextEl) bannerTextEl.innerText = `Game Over! Hit perimeter wall at move ${data.move_num}.`;
      } else if (data.game_over_reason === "hit_body") {
        gameBannerEl.className = "game-banner banner-defeat";
        if (bannerIconEl) bannerIconEl.innerText = "💀";
        if (bannerTextEl) bannerTextEl.innerText = `Game Over! Collided with self body at move ${data.move_num}.`;
      } else if (data.game_over_reason === "moves_exhausted") {
        gameBannerEl.className = "game-banner banner-defeat";
        if (bannerIconEl) bannerIconEl.innerText = "⏳";
        if (bannerTextEl) bannerTextEl.innerText = `Game Over! Maximum moves (${data.max_moves}) exhausted.`;
      }
    } else {
      gameBannerEl.classList.add("hidden");
    }
  }

  // JSON Response
  if (jsonCodeEl && data.answers) {
    jsonCodeEl.innerHTML = highlightJSON({ answers: data.answers });
  }

  // Latency Badge
  if (latencyBadgeEl && data.execution_time_ms !== undefined) {
    const ms = data.execution_time_ms;
    latencyBadgeEl.innerText = ms < 1 ? "< 1 ms" : `${Math.round(ms)} ms`;
  }

  // Cache Telemetry
  if (data.cache_stats) {
    const stats = data.cache_stats;
    if (cacheHitRateEl && stats.total_requests !== undefined) {
      const pct = (stats.hit_rate * 100).toFixed(1);
      cacheHitRateEl.innerText = `${pct}% (${stats.hits}/${stats.total_requests})`;
    }
    if (cacheSavedEl && stats.total_latency_saved_ms !== undefined) {
      cacheSavedEl.innerText = `${Math.round(stats.total_latency_saved_ms)} ms`;
    }
  }
}

function highlightJSON(obj) {
  const jsonStr = JSON.stringify(obj, null, 2);
  return jsonStr
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function (match) {
        let cls = "json-number";
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "json-key";
            const keyContent = match.slice(0, -1);
            return `<span class="${cls}">${keyContent}</span><span class="json-punc">:</span>`;
          } else {
            cls = "json-string";
          }
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return `<span class="${cls}">${match}</span>`;
      }
    )
    .replace(/([{}[\],])/g, '<span class="json-punc">$1</span>');
}

async function resetGame() {
  stopAutoPlay();
  try {
    const res = await fetch("/api/reset", { method: "POST" });
    gameState = await res.json();
    renderCanvas();
    updateInspector(gameState);
  } catch (err) {
    console.error("Reset failed:", err);
  }
}

async function clearCache() {
  try {
    const res = await fetch("/api/cache/clear", { method: "POST" });
    const data = await res.json();
    if (data.cache_stats && gameState) {
      gameState.cache_stats = data.cache_stats;
      updateInspector(gameState);
    }
  } catch (err) {
    console.error("Clear cache failed:", err);
  }
}

async function handleBackendChange(e) {
  const newBackend = e.target.value;
  try {
    await fetch("/api/backend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backend: newBackend }),
    });
  } catch (err) {
    console.error("Backend switch failed:", err);
  }
}

function toggleAutoPlay() {
  if (isAutoPlaying) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
}

function startAutoPlay() {
  if (gameState && gameState.is_game_over) return;
  isAutoPlaying = true;
  btnAutoPlay.innerHTML = '<span class="btn-icon">⏸</span> Pause';
  btnAutoPlay.classList.add("btn-primary");
  btnAutoPlay.classList.remove("btn-secondary");

  const speed = parseInt(speedSlider.value, 10);
  performStep();
  autoPlayTimer = setInterval(performStep, speed);
}

function stopAutoPlay() {
  isAutoPlaying = false;
  clearInterval(autoPlayTimer);
  btnAutoPlay.innerHTML = '<span class="btn-icon">▶</span> Auto-Play';
  btnAutoPlay.classList.add("btn-secondary");
  btnAutoPlay.classList.remove("btn-primary");
}

function setupEventListeners() {
  btnStep.addEventListener("click", () => performStep());
  btnAutoPlay.addEventListener("click", toggleAutoPlay);
  btnReset.addEventListener("click", resetGame);
  btnClearCache.addEventListener("click", clearCache);
  backendSelect.addEventListener("change", handleBackendChange);

  speedSlider.addEventListener("input", (e) => {
    const val = e.target.value;
    speedLabel.innerText = `${(val / 1000).toFixed(1)}s`;
    if (isAutoPlaying) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = setInterval(performStep, parseInt(val, 10));
    }
  });

  // On-screen D-Pad buttons
  btnUp.addEventListener("click", () => performStep("up"));
  btnDown.addEventListener("click", () => performStep("down"));
  btnLeft.addEventListener("click", () => performStep("left"));
  btnRight.addEventListener("click", () => performStep("right"));

  // Keyboard controls
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

    if (e.code === "Space") {
      e.preventDefault();
      toggleAutoPlay();
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      performStep();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      resetGame();
    } else if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      clearCache();
    } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
      e.preventDefault();
      performStep("up");
    } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      performStep("down");
    } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      e.preventDefault();
      performStep("left");
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      e.preventDefault();
      performStep("right");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
