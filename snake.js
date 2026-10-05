/**
 * Classic Nokia Monochrome Snake Engine
 * Authentic LCD aesthetic, strict classic collision, responsive touch/keyboard controls,
 * move telemetry, detailed game-over reporting, and Clef-style System 1 navigation.
 */

(function () {
  'use strict';

  // Constants & Config
  const GRID_SIZE = 20; // 20x20 grid
  const CANVAS_SIZE = 360;
  const TILE_SIZE = CANVAS_SIZE / GRID_SIZE; // 18px per tile

  const BASE_SPEED_MS = 160;
  const MIN_SPEED_MS = 50;
  const SPEED_DECREMENT = 4; // ms faster per food eaten

  // DOM Elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const scoreDisplay = document.getElementById('scoreDisplay');
  const movesDisplay = document.getElementById('movesDisplay');
  const highScoreDisplay = document.getElementById('highScoreDisplay');
  const speedDisplay = document.getElementById('speedDisplay');

  const gameOverlay = document.getElementById('gameOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySubtitle = document.getElementById('overlaySubtitle');
  const overlayStats = document.getElementById('overlayStats');
  const gameOverReasonEl = document.getElementById('gameOverReason');
  const gameOverMoveEl = document.getElementById('gameOverMove');
  const finalMovesEl = document.getElementById('finalMoves');
  const foodEatenEl = document.getElementById('foodEaten');
  const finalScoreSpan = document.getElementById('finalScore');
  const newHighScoreBadge = document.getElementById('newHighScoreBadge');

  const btnPause = document.getElementById('btnPause');
  const btnAutoAI = document.getElementById('btnAutoAI');
  const btnReset = document.getElementById('btnReset');
  const btnUp = document.getElementById('btnUp');
  const btnDown = document.getElementById('btnDown');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');

  // Game State Variables
  let snake = [];
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };
  let food = { x: 15, y: 10 };
  let score = 0;
  let moveCount = 0;
  let foodCount = 0;
  let highScore = parseInt(localStorage.getItem('nokia_snake_highscore') || '0', 10);
  let speedMs = BASE_SPEED_MS;
  let gameState = 'START'; // 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER'
  let gameLoopTimer = null;
  let isNewHighScore = false;
  let isAiMode = false;
  let lastGameOverReason = 'HIT WALL';

  // Initialize Game
  function init() {
    updateHighScoreUI();
    resetGame();
    setupEventListeners();
    render();
    showStartScreen();
  }

  function resetGame() {
    snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    moveCount = 0;
    foodCount = 0;
    speedMs = BASE_SPEED_MS;
    isNewHighScore = false;
    spawnFood();
    updateScoreUI();
    updateMovesUI();
  }

  function startGame() {
    if (gameState === 'PLAYING') return;
    if (gameState === 'START' || gameState === 'GAME_OVER') {
      resetGame();
    }
    gameState = 'PLAYING';
    hideOverlay();
    btnPause.innerText = 'PAUSE';
    clearInterval(gameLoopTimer);
    gameLoopTimer = setInterval(gameTick, speedMs);
  }

  function pauseGame() {
    if (gameState === 'PLAYING') {
      gameState = 'PAUSED';
      clearInterval(gameLoopTimer);
      btnPause.innerText = 'RESUME';
      showOverlay('PAUSED', 'PRESS PAUSE OR SPACE TO RESUME');
    } else if (gameState === 'PAUSED') {
      gameState = 'PLAYING';
      btnPause.innerText = 'PAUSE';
      hideOverlay();
      clearInterval(gameLoopTimer);
      gameLoopTimer = setInterval(gameTick, speedMs);
    }
  }

  function gameOver(reason = 'HIT WALL') {
    gameState = 'GAME_OVER';
    lastGameOverReason = reason;
    clearInterval(gameLoopTimer);
    btnPause.innerText = 'PAUSE';

    if (score > highScore) {
      highScore = score;
      localStorage.setItem('nokia_snake_highscore', highScore.toString());
      isNewHighScore = true;
      updateHighScoreUI();
    }

    if (gameOverReasonEl) gameOverReasonEl.innerText = reason;
    if (gameOverMoveEl) gameOverMoveEl.innerText = moveCount.toString();
    if (finalMovesEl) finalMovesEl.innerText = moveCount.toString();
    if (foodEatenEl) foodEatenEl.innerText = foodCount.toString();
    if (finalScoreSpan) finalScoreSpan.innerText = score.toString();

    if (isNewHighScore && score > 0) {
      newHighScoreBadge.classList.remove('hidden');
    } else {
      newHighScoreBadge.classList.add('hidden');
    }

    overlayStats.classList.remove('hidden');
    showOverlay('GAME OVER', 'PRESS ANY KEY OR TAP TO RETRY');
    render();
  }

  function showStartScreen() {
    gameState = 'START';
    overlayStats.classList.add('hidden');
    showOverlay('NOKIA SNAKE', 'PRESS ARROW KEYS OR TAP TO PLAY');
  }

  function showOverlay(title, subtitle) {
    overlayTitle.innerText = title;
    overlaySubtitle.innerText = subtitle;
    gameOverlay.classList.remove('hidden');
  }

  function hideOverlay() {
    gameOverlay.classList.add('hidden');
  }

  // Spawn Food on an empty tile
  function spawnFood() {
    let emptyTiles = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        let isOccupied = snake.some(segment => segment.x === x && segment.y === y);
        if (!isOccupied) {
          emptyTiles.push({ x, y });
        }
      }
    }

    if (emptyTiles.length === 0) {
      gameOver('BOARD CLEARED (VICTORY!)');
      return;
    }

    const randomIndex = Math.floor(Math.random() * emptyTiles.length);
    food = emptyTiles[randomIndex];
  }

  // System 1 BFS Decision Pathfinding for AI Autoplay
  function computeAiDecision() {
    const head = snake[0];
    const directions = [
      { name: 'up', x: 0, y: -1 },
      { name: 'down', x: 0, y: 1 },
      { name: 'left', x: -1, y: 0 },
      { name: 'right', x: 1, y: 0 }
    ];

    // Filter valid immediate moves (no wall, no body, no immediate 180 reversal)
    const validMoves = directions.filter(dir => {
      if (dir.x !== 0 && direction.x !== 0 && dir.x === -direction.x) return false;
      if (dir.y !== 0 && direction.y !== 0 && dir.y === -direction.y) return false;
      const nx = head.x + dir.x;
      const ny = head.y + dir.y;
      if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) return false;
      return !snake.some((s, idx) => idx < snake.length - 1 && s.x === nx && s.y === ny);
    });

    if (validMoves.length === 0) return direction;

    // BFS shortest path to food
    const queue = [[head, []]];
    const visited = new Set();
    visited.add(`${head.x},${head.y}`);
    let pathToFood = null;

    // Build obstacles set (snake body)
    const bodySet = new Set(snake.map(s => `${s.x},${s.y}`));

    while (queue.length > 0) {
      const [cur, path] = queue.shift();
      if (cur.x === food.x && cur.y === food.y) {
        pathToFood = path;
        break;
      }

      for (const d of directions) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !visited.has(key)) {
          // If first step from head, cannot hit body
          if (path.length === 0 && bodySet.has(key)) continue;
          // Intermediate step
          if (path.length > 0 && bodySet.has(key)) continue;

          visited.add(key);
          queue.push([{ x: nx, y: ny }, [...path, d]]);
        }
      }
    }

    if (pathToFood && pathToFood.length > 0) {
      const firstStep = pathToFood[0];
      const isStillValid = validMoves.some(m => m.x === firstStep.x && m.y === firstStep.y);
      if (isStillValid) return firstStep;
    }

    // Heuristic: Pick move with maximum open surrounding space (survival)
    let bestMove = validMoves[0];
    let maxOpen = -1;

    for (const move of validMoves) {
      const nx = head.x + move.x;
      const ny = head.y + move.y;
      let openCount = 0;
      for (const d of directions) {
        const tx = nx + d.x;
        const ty = ny + d.y;
        if (tx >= 0 && tx < GRID_SIZE && ty >= 0 && ty < GRID_SIZE && !bodySet.has(`${tx},${ty}`)) {
          openCount++;
        }
      }
      if (openCount > maxOpen) {
        maxOpen = openCount;
        bestMove = move;
      }
    }

    return bestMove;
  }

  // Main Game Step Loop
  function gameTick() {
    if (gameState !== 'PLAYING') return;

    if (isAiMode) {
      const aiDir = computeAiDecision();
      if (aiDir) {
        nextDirection = { x: aiDir.x, y: aiDir.y };
      }
    }

    // Apply buffered direction
    direction = { ...nextDirection };

    // Calculate new head position
    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y
    };

    // Increment Move Counter
    moveCount++;
    updateMovesUI();

    // Strict Classic Wall Collision Check
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      gameOver('HIT WALL');
      return;
    }

    // Self Collision Check
    for (let i = 0; i < snake.length; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        gameOver('HIT OWN BODY');
        return;
      }
    }

    // Add new head
    snake.unshift(head);

    // Check if food was eaten
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      foodCount++;
      updateScoreUI();

      // Increase Speed dynamically
      const newSpeed = Math.max(MIN_SPEED_MS, BASE_SPEED_MS - Math.floor(score / 10) * SPEED_DECREMENT);
      if (newSpeed !== speedMs) {
        speedMs = newSpeed;
        clearInterval(gameLoopTimer);
        gameLoopTimer = setInterval(gameTick, speedMs);
      }

      spawnFood();
    } else {
      // Remove tail if no food eaten
      snake.pop();
    }

    render();
  }

  // Update UI Stats
  function updateScoreUI() {
    if (scoreDisplay) scoreDisplay.innerText = score.toString().padStart(4, '0');
    const level = Math.min(10, Math.floor(score / 40) + 1);
    if (speedDisplay) speedDisplay.innerText = level.toString();
  }

  function updateMovesUI() {
    if (movesDisplay) movesDisplay.innerText = moveCount.toString().padStart(4, '0');
  }

  function updateHighScoreUI() {
    if (highScoreDisplay) highScoreDisplay.innerText = highScore.toString().padStart(4, '0');
  }

  // Render Frame
  function render() {
    // Clear canvas with LCD background
    ctx.fillStyle = '#98b068';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Subtle LCD pixel background dots
    ctx.fillStyle = 'rgba(37, 51, 21, 0.07)';
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }

    // Draw Food (Pixelated Nokia Icon)
    drawFood(food.x, food.y);

    // Draw Snake
    drawSnake();
  }

  function drawFood(x, y) {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const size = TILE_SIZE;

    ctx.fillStyle = '#253315';
    // 2x2 block checker pattern for retro apple/egg
    const half = size / 2;
    ctx.fillRect(px + 2, py + 2, half - 2, half - 2);
    ctx.fillRect(px + half + 1, py + half + 1, half - 2, half - 2);
    ctx.fillRect(px + half - 2, py + half - 2, 4, 4);
  }

  function drawSnake() {
    snake.forEach((segment, index) => {
      const px = segment.x * TILE_SIZE;
      const py = segment.y * TILE_SIZE;
      const pad = 1.5;

      if (index === 0) {
        // Snake Head: Dark solid with eye details
        ctx.fillStyle = '#1c2810';
        ctx.fillRect(px + pad, py + pad, TILE_SIZE - pad * 2, TILE_SIZE - pad * 2);

        // Eye spots
        ctx.fillStyle = '#98b068';
        if (direction.x === 1) { // moving right
          ctx.fillRect(px + TILE_SIZE - 6, py + 4, 2, 2);
          ctx.fillRect(px + TILE_SIZE - 6, py + TILE_SIZE - 6, 2, 2);
        } else if (direction.x === -1) { // moving left
          ctx.fillRect(px + 4, py + 4, 2, 2);
          ctx.fillRect(px + 4, py + TILE_SIZE - 6, 2, 2);
        } else if (direction.y === 1) { // moving down
          ctx.fillRect(px + 4, py + TILE_SIZE - 6, 2, 2);
          ctx.fillRect(px + TILE_SIZE - 6, py + TILE_SIZE - 6, 2, 2);
        } else if (direction.y === -1) { // moving up
          ctx.fillRect(px + 4, py + 4, 2, 2);
          ctx.fillRect(px + TILE_SIZE - 6, py + 4, 2, 2);
        }
      } else {
        // Snake Body: Segmented block with inner pixel shadow
        ctx.fillStyle = '#253315';
        ctx.fillRect(px + pad, py + pad, TILE_SIZE - pad * 2, TILE_SIZE - pad * 2);

        // Inner lighter pixel accent
        ctx.fillStyle = '#3a4e22';
        ctx.fillRect(px + pad + 2, py + pad + 2, TILE_SIZE - (pad + 2) * 2, TILE_SIZE - (pad + 2) * 2);
      }
    });
  }

  // Direction Input Handler
  function handleDirectionInput(newX, newY) {
    if (gameState === 'START' || gameState === 'GAME_OVER') {
      startGame();
      return;
    }
    if (gameState === 'PAUSED') {
      pauseGame(); // Resume
    }

    // If manual input is given, we can let user take over
    if (newX !== 0 && direction.x !== 0 && newX === -direction.x) return;
    if (newY !== 0 && direction.y !== 0 && newY === -direction.y) return;

    nextDirection = { x: newX, y: newY };
  }

  function toggleAiMode() {
    isAiMode = !isAiMode;
    if (btnAutoAI) {
      if (isAiMode) {
        btnAutoAI.innerText = 'AI: ON';
        btnAutoAI.classList.add('btn-ai-active');
      } else {
        btnAutoAI.innerText = 'AI: OFF';
        btnAutoAI.classList.remove('btn-ai-active');
      }
    }
    if (gameState === 'START' || gameState === 'GAME_OVER') {
      startGame();
    }
  }

  // Event Listeners
  function setupEventListeners() {
    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          handleDirectionInput(0, -1);
          highlightButton(btnUp);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          handleDirectionInput(0, 1);
          highlightButton(btnDown);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (e.ctrlKey || e.altKey) break;
          e.preventDefault();
          handleDirectionInput(-1, 0);
          highlightButton(btnLeft);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          handleDirectionInput(1, 0);
          highlightButton(btnRight);
          break;
        case ' ': // Space for pause/resume or start
          e.preventDefault();
          if (gameState === 'START' || gameState === 'GAME_OVER') {
            startGame();
          } else {
            pauseGame();
          }
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          resetGame();
          startGame();
          break;
        case 'Enter':
          e.preventDefault();
          if (gameState === 'START' || gameState === 'GAME_OVER') {
            startGame();
          }
          break;
      }
    });

    // Button Controls
    btnUp.addEventListener('click', () => handleDirectionInput(0, -1));
    btnDown.addEventListener('click', () => handleDirectionInput(0, 1));
    btnLeft.addEventListener('click', () => handleDirectionInput(-1, 0));
    btnRight.addEventListener('click', () => handleDirectionInput(1, 0));

    btnPause.addEventListener('click', () => {
      if (gameState === 'START' || gameState === 'GAME_OVER') {
        startGame();
      } else {
        pauseGame();
      }
    });

    if (btnAutoAI) {
      btnAutoAI.addEventListener('click', toggleAiMode);
    }

    btnReset.addEventListener('click', () => {
      resetGame();
      startGame();
    });

    gameOverlay.addEventListener('click', () => {
      if (gameState === 'START' || gameState === 'GAME_OVER') {
        startGame();
      } else if (gameState === 'PAUSED') {
        pauseGame();
      }
    });

    // Touch Swipe Support
    let touchStartX = 0;
    let touchStartY = 0;

    canvas.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;
      const minSwipeDistance = 25;

      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > minSwipeDistance) {
          if (diffX > 0) handleDirectionInput(1, 0);
          else handleDirectionInput(-1, 0);
        }
      } else {
        if (Math.abs(diffY) > minSwipeDistance) {
          if (diffY > 0) handleDirectionInput(0, 1);
          else handleDirectionInput(0, -1);
        }
      }
    }, { passive: true });
  }

  function highlightButton(btn) {
    if (!btn) return;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 120);
  }

  // Start initialization on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
