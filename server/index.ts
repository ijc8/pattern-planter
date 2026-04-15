// Pattern Planter networking server.
//
// - Serves the built client from ../dist (run `npm run build` first, or use
//   `npm run start` which does both).
// - WebSocket endpoint at /ws. Maintains authoritative state for 8 trees plus
//   claims and players. Validates incoming intents against ownership and
//   relays them to all other clients.

import http from "node:http"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { WebSocketServer, WebSocket } from "ws"
import {
    applyIntent,
    newTree,
    NUM_TREES,
    Tree,
    Intent,
} from "../src/shared/apply"

import { existsSync } from "node:fs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, "..", "dist")
const SAMPLES_DIR = path.resolve(__dirname, "..", "samples")
const PORT = Number(process.env.PORT ?? 8080)

// ----- server state --------------------------------------------------------

interface Player {
    id: string
    color: string
    ws: WebSocket
}

const trees: Tree[] = Array.from({ length: NUM_TREES }, (_, i) => newTree(i))
const claims: (string | null)[] = Array.from({ length: NUM_TREES }, () => null)
const players = new Map<string, Player>()

function randomId(len = 6): string {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789"
    let out = ""
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
    return out
}

// Deterministic-ish vivid color derived from the player id.
function colorFor(id: string): string {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
    const hue = Math.abs(h) % 360
    return `hsl(${hue}, 80%, 55%)`
}

function snapshot() {
    return {
        trees,
        claims,
        players: Array.from(players.values(), (p) => ({ id: p.id, color: p.color })),
    }
}

function broadcast(msg: unknown, exceptId?: string) {
    const text = JSON.stringify(msg)
    for (const p of players.values()) {
        if (p.id === exceptId) continue
        if (p.ws.readyState === WebSocket.OPEN) p.ws.send(text)
    }
}

function send(ws: WebSocket, msg: unknown) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

// ----- HTTP (static) -------------------------------------------------------

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".ico": "image/x-icon",
    ".map": "application/json; charset=utf-8",
}

function resolveInDir(dir: string, pathname: string): string | null {
    const resolved = path.resolve(dir, "." + pathname)
    if (!resolved.startsWith(dir)) return null
    return resolved
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost")
    let pathname = decodeURIComponent(url.pathname)

    // /samples/* → serve from dough-samples/ directory (local sample library).
    if (pathname.startsWith("/samples/")) {
        const samplePath = pathname.slice("/samples".length) // e.g. "/piano.json"
        const resolved = resolveInDir(SAMPLES_DIR, samplePath)
        if (!resolved) { res.writeHead(403).end("forbidden"); return }
        try {
            const body = await readFile(resolved)
            const ext = path.extname(resolved).toLowerCase()
            res.writeHead(200, {
                "content-type": MIME[ext] ?? "application/octet-stream",
                "access-control-allow-origin": "*",
            })
            res.end(body)
        } catch {
            res.writeHead(404).end("not found")
        }
        return
    }

    // Everything else → serve from dist/.
    if (pathname === "/") pathname = "/index.html"
    const resolved = resolveInDir(DIST_DIR, pathname)
    if (!resolved) { res.writeHead(403).end("forbidden"); return }
    try {
        const body = await readFile(resolved)
        const ext = path.extname(resolved).toLowerCase()
        res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" })
        res.end(body)
    } catch {
        res.writeHead(404).end("not found")
    }
}

const httpServer = http.createServer((req, res) => {
    serveStatic(req, res).catch((err) => {
        console.error("static error", err)
        res.writeHead(500).end("server error")
    })
})

// ----- WebSocket -----------------------------------------------------------

const wss = new WebSocketServer({ server: httpServer, path: "/ws" })

// Ping/pong heartbeat to detect dead connections (e.g. wifi dropout).
// Without this, TCP can take minutes to notice a lost peer.
const PING_INTERVAL = 10_000  // send ping every 10s
const PONG_TIMEOUT = 30_000   // terminate if no pong within 30s

const alive = new Map<WebSocket, number>()  // ws → last pong timestamp

const heartbeat = setInterval(() => {
    const now = Date.now()
    for (const [ws, lastPong] of alive) {
        if (now - lastPong > PONG_TIMEOUT) {
            console.log("[heartbeat] terminating unresponsive client")
            ws.terminate()
            alive.delete(ws)
        } else {
            ws.ping()
        }
    }
}, PING_INTERVAL)

wss.on("close", () => clearInterval(heartbeat))

wss.on("connection", (ws) => {
    const id = randomId()
    const color = colorFor(id)
    const player: Player = { id, color, ws }
    players.set(id, player)
    alive.set(ws, Date.now())
    console.log(`[join] ${id} (${players.size} total)`)

    send(ws, { type: "hello", playerId: id, color, snapshot: snapshot() })
    broadcast({ type: "player-join", playerId: id, color }, id)

    ws.on("pong", () => {
        alive.set(ws, Date.now())
    })

    ws.on("message", (data) => {
        // Any incoming data also proves the connection is alive.
        alive.set(ws, Date.now())
        let msg: any
        try {
            msg = JSON.parse(data.toString())
        } catch {
            return
        }
        handleMessage(player, msg)
    })

    ws.on("close", () => {
        alive.delete(ws)
        players.delete(id)
        for (let i = 0; i < NUM_TREES; i++) {
            if (claims[i] === id) {
                claims[i] = null
                broadcast({ type: "claim-update", treeIndex: i, ownerId: null })
            }
        }
        broadcast({ type: "player-leave", playerId: id })
        console.log(`[leave] ${id} (${players.size} total)`)
    })
})

function handleMessage(player: Player, msg: any) {
    switch (msg?.type) {
        case "claim": {
            const ti: number = msg.treeIndex
            if (!Number.isInteger(ti) || ti < 0 || ti >= NUM_TREES) return
            if (claims[ti] !== null) {
                send(player.ws, { type: "claim-result", treeIndex: ti, ok: false, reason: "already-claimed" })
                return
            }
            claims[ti] = player.id
            send(player.ws, { type: "claim-result", treeIndex: ti, ok: true })
            broadcast({ type: "claim-update", treeIndex: ti, ownerId: player.id })
            return
        }
        case "release": {
            const ti: number = msg.treeIndex
            if (!Number.isInteger(ti) || ti < 0 || ti >= NUM_TREES) return
            if (claims[ti] !== player.id) return
            claims[ti] = null
            broadcast({ type: "claim-update", treeIndex: ti, ownerId: null })
            return
        }
        case "intent": {
            const intent: Intent | undefined = msg.intent
            if (!intent || typeof intent !== "object") return
            const ti = intent.treeIndex
            if (!Number.isInteger(ti) || ti < 0 || ti >= NUM_TREES) return
            if (claims[ti] !== player.id) {
                console.warn(`[reject] ${player.id} intent on unowned tree ${ti}`)
                return
            }
            try {
                applyIntent(trees[ti], intent)
            } catch (e) {
                console.warn(`[reject] ${player.id} bad intent:`, (e as Error).message)
                return
            }
            // Relay to everyone except the sender (they applied optimistically).
            broadcast({ type: "intent", intent, senderId: player.id }, player.id)
            return
        }
        case "cursor": {
            // Light validation; relay to everyone else. No rate-limiting here —
            // clients throttle before sending.
            const relayed: any = {
                type: "cursor",
                playerId: player.id,
                color: player.color,
            }
            if (typeof msg.x === "number" && typeof msg.y === "number") {
                relayed.x = msg.x
                relayed.y = msg.y
                if (msg.tool === "can" || msg.tool === "can-pour" || msg.tool === "shears") relayed.tool = msg.tool
            }
            broadcast(relayed, player.id)
            return
        }
    }
}

httpServer.listen(PORT, () => {
    console.log(`pattern-planter server on http://localhost:${PORT}`)
    console.log(`  static: ${DIST_DIR}`)
    console.log(`  ws:     ws://localhost:${PORT}/ws`)
    if (existsSync(SAMPLES_DIR)) {
        console.log(`  samples: ${SAMPLES_DIR}`)
    } else {
        console.warn(`  ⚠ samples directory not found: ${SAMPLES_DIR}`)
        console.warn(`    run: npm run setup-samples`)
    }
})
