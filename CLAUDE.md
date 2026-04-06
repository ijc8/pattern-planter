# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — TypeScript compilation + Vite build (`tsc && vite build`)
- `npm run preview` — Preview production build

No test runner or linter is configured.

## What This Is

Pattern Planter is an interactive web-based musical tool combining D3.js tree visualization with Strudel (TidalCycles-inspired live coding) for audio synthesis. Users grow and prune visual trees that are converted into musical patterns in real-time. Related to the [blocks](https://github.com/ijc8/blocks) project.

## Architecture

Almost all application logic lives in **`src/main.ts`** (~465 lines). The app renders 8 independent tree visualizations in a single SVG (`#planter`), each representing a musical expression.

### Data Flow

1. User interacts with tree nodes/links (click to grow or prune)
2. D3 tree layout updates with animated transitions (2000ms)
3. Trees are recursively converted to Strudel code via `convertTreeToExpression()`
4. Generated code is injected into the `<strudel-editor>` custom element and auto-evaluated
5. All 8 trees are stacked with spatial panning across the stereo field
6. Active leaf nodes are highlighted via `.onTrigger()` callback synchronized with audio playback

### Node Types

- **Atoms** — leaf nodes representing samples (e.g. `ocarina_small_stacc`, `guiro`) or notes (C2–BB3 with `piano` synth)
- **Unary functions** — `degrade`, `brak`, `rev` (applied to single child, cannot grow further)
- **Variadic functions** — `stack`, `chooseCycles`, `seq`, `cat` (clicking adds more children)

Each node has a unique `id` (e.g. `node_0`) for tracking and an associated emoji for visual identification (defined in `EMOJI_MAP`).

### Key Interactions

- **Click node** → atom becomes a function with random children; variadic functions gain a child
- **Click link** → replaces the child with a new random atom (prune + regrow)
- **Ctrl/Cmd+.** → stop audio

### Active Node Highlighting

Leaf nodes flash yellow when their sample/note triggers during playback:
- Each atom is tagged via `.tag("node_X")` in the generated Strudel code
- `.onTrigger()` (with `dominant=false`) fires a callback at audio trigger time
- `window.highlightAtoms()` adds the node ID to `activeAtoms`, schedules a 150ms removal timeout, and updates SVG rect fills via `updateTreeColors()`
- On tree structure changes, all highlights and pending timeouts are cleared in `playTree()`

### External Dependencies

- `strudel.js` is checked into the repo as a pre-built 1.7MB bundle (not from npm)
- D3 v7 is the only npm production dependency
- Samples are preloaded at startup to avoid latency during performance
