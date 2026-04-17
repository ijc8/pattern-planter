# ☀️ 💧 🪴 🎵

**pattern-planter**

hacked together with [strudel](https://github.com/tidalcycles/strudel) and [d3](https://github.com/d3/d3).

bears some thematic & historical relation to [blocks](https://github.com/ijc8/blocks).

in performance: https://www.youtube.com/watch?v=haphoJngHJ4

## Setup

```sh
npm install
npm run start  # builds client + starts server on http://localhost:8080
```

For local development (Vite dev server with hot reload, no networking):
```sh
npm run dev
```

## Networked Ensemble Mode

Pattern Planter supports networked play for laptop ensembles. The server
(`server/index.ts`) serves the built client and runs a WebSocket relay so
multiple players can each claim and tend one of the 8 trees in real-time.

- Players see all trees and each other's cursors, but can only water/trim
  their own claimed tree.
- Spectators can watch without claiming a tree (useful for the PA/projector
  client).
- All clients produce audio independently; plug one into the PA for the
  audience.
- Designed for LAN use (works offline — samples are bundled in the repo).
  Use `ngrok` or similar if internet access is needed.

demo link coming soon.
