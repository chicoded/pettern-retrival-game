# Pattern Retrieval: Guess the Glyph

Single-page static web game inspired by Adam Ilenich’s “PATTERN RETRIEVAL” project (Hopfield-style memory recall, CRT/phosphor aesthetic, and pixelated ASCII-era vibes). The core loop starts as scattered noise, converges into a recognizable 24×24 pixel “memory,” then asks you to guess what the network recalled.

## Run locally

- Option A: open `public/index.html` directly in a browser
- Option B: serve the `public/` folder with any static server (recommended for clipboard + audio behavior)

## Deploy

Deploy the `public/` folder as a static site (e.g., Vercel “Other” → output = `public`).

## Notes

- No frameworks, no build step, no external assets (font loads from Google Fonts).
- Pixel art is generated as 24×24 grids in `public/game.js`.
