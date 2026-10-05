# Classic Nokia Monochrome Snake

An authentic retro Snake game featuring classic Nokia monochrome LCD screen visuals, pixel-art graphics, progressive speed scaling, strict wall collisions, and dual controls (keyboard + on-screen tactile D-pad).

## Features

- 🟢 **Monochrome LCD Aesthetics:** Authentic Nokia green screen palette, pixel grid dots, and retro styling.
- 🎮 **Strict Classic Gameplay:**
  - Continuous movement in discrete grid steps.
  - Food spawns on empty tiles.
  - Snake body grows and score increments (+10 per food).
  - Progressive speed acceleration as score increases.
  - Wall collision and self-collision trigger immediate Game Over.
- 🏆 **High Score Persistence:** Automatically saves your personal best locally in `localStorage`.
- 🕹️ **Controls:**
  - **Keyboard:** Arrow Keys (`↑`, `↓`, `←`, `→`) or `W`, `A`, `S`, `D`
  - **Pause / Resume:** `Space` bar or `PAUSE` button
  - **Restart:** `R` key or `RESET` button
  - **Touch & Mobile:** Responsive on-screen D-Pad buttons + swipe gesture support.

## How to Run

Simply open `index.html` in any modern web browser, or serve it using Python:

```powershell
python -m http.server 3000
```
Then navigate to `http://localhost:3000/index.html`.
