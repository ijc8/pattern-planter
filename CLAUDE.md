# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

- `npm run dev` — Start Vite dev server (no networking)
- `npm run build` — TypeScript compilation + Vite build (`tsc && vite build`)
- `npm run start` — Build + start the WebSocket server (serves built client)
- `npm run server` — Start the server without rebuilding
- `npm run preview` — Preview production build via Vite

No test runner or linter is configured. Verify with `npx tsc --noEmit` and `npm run build`.

## What This Is

Pattern Planter is an interactive web-based musical tool combining D3.js tree visualization with Strudel (TidalCycles-inspired live coding) for audio synthesis. Users grow and prune visual trees that are converted into musical patterns in real-time. Designed for networked laptop ensemble performance. Related to the [blocks](https://github.com/ijc8/blocks) project.

## Architecture

### File Structure

- **`src/main.ts`** — Client-side app logic: D3 tree rendering, click handlers, Strudel integration, claim UI, cursor overlay, and network event handling.
- **`src/shared/apply.ts`** — Pure `Tree`/`Intent` types and `applyIntent()` logic shared between client and server. Both sides import this so mutation logic is in exactly one place.
- **`src/net.ts`** — Client-side WebSocket wrapper with reconnect, message queueing, and typed event callbacks.
- **`server/index.ts`** — Node HTTP+WS server (run via `tsx`). Serves `dist/` and `samples/`, maintains authoritative tree state, validates ownership on intents, relays messages between clients.

### Networking Model

The app supports a networked ensemble mode where each of the 8 trees can be claimed by a player. Design:

- **Optimistic mutation** — the tree owner applies changes locally and sends an `Intent` message; the server validates ownership, applies to its authoritative copy, and relays to all other clients.
- **Pre-rolled randomness** — the initiating client rolls all random choices (new node type, atom name, swap, IDs) and includes them in the intent so all clients converge deterministically.
- **Server-authoritative state** — the server holds `Tree[8]` + `claims[8]` so late joiners get a snapshot on connect.
- **Node IDs** are prefixed with tree index (e.g. `t2_17`) to avoid cross-client collisions.
- **Ping/pong heartbeat** detects dead connections within 30s.

### Data Flow

1. User clicks a tree node/link (gated by ownership — only the claimed tree responds)
2. Click handler rolls randomness into an `Intent` object
3. `applyIntent()` mutates the authoritative `treeJsons[i]` in place (optimistic)
4. D3 hierarchy is rebuilt from the mutated JSON; `update(source)` runs animated transitions (2000ms)
5. Intent is sent via WebSocket; server validates + relays to other clients
6. Remote clients receive the intent, apply it to their copy, and rebuild/animate
7. Trees are recursively converted to Strudel code via `convertTreeToExpression()`
8. Generated code is injected into the `<strudel-editor>` custom element and auto-evaluated (debounced at 100ms)
9. All 8 trees are stacked with spatial panning across the stereo field
10. Active leaf nodes are highlighted via `.onTrigger()` callback synchronized with audio playback

### Node Types

- **Atoms** — leaf nodes representing samples (e.g. `ocarina_small_stacc`, `guiro`) or notes (C2–BB3 with `piano` synth)
- **Unary functions** — `degrade`, `brak`, `rev` (applied to single child, cannot grow further)
- **Variadic functions** — `stack`, `chooseCycles`, `seq`, `cat` (clicking adds more children)

Each node has a unique `id` (e.g. `t0_3`) for tracking and an associated emoji for visual identification (defined in `EMOJI_MAP`).

### Key Interactions

- **Click node** → atom becomes a function with random children; variadic functions gain a child
- **Click link** → replaces the child with a new random atom (prune + regrow)
- **Click claim button** → claims/releases a tree (server-authoritative)
- **Ctrl/Cmd+.** → stop audio

### Active Node Highlighting

Leaf nodes flash yellow when their sample/note triggers during playback:
- Each atom is tagged via `.tag("t0_3")` in the generated Strudel code
- `.onTrigger()` (with `dominant=false`) fires a callback at audio trigger time
- `window.highlightAtoms()` adds the node ID to `activeAtoms`, schedules a 150ms removal timeout, and updates SVG rect fills via `updateTreeColors()`
- On tree structure changes, all highlights and pending timeouts are cleared in `playTree()`
- Node IDs use `_` as separator (not `:`) because Strudel's mini-notation parser treats `:` specially

### Local Sample Serving

Strudel's prebake normally fetches five sample registry JSONs from GitHub. `public/strudel.js` is patched (single string replace) so prebake instead loads one local file at `/samples/strudel.json` — a hand-rolled registry containing only the samples this app actually uses. The `samples/` directory (~7MB, checked in) holds that JSON plus the referenced audio files: 8 piano notes, 5 Dirt-Samples files, and 6 VCSL files. To add a new sample atom, add an entry to `samples/strudel.json` and copy the file out of the upstream `dough-samples` / `VCSL` / `Dirt-Samples` repo. For dict-keyed (note-indexed) VCSL samples, Strudel picks the key closest to MIDI 36 (C2) when no `.note()` is set, so that's the minimum you need to include.

### External Dependencies

- `strudel.js` is checked into the repo as a pre-built 1.7MB bundle (not from npm)
- D3 v7 and `ws` are npm production dependencies
- `tsx` runs the TypeScript server without a separate build step
- Samples are preloaded at startup to avoid latency during performance
