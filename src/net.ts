// Client-side WebSocket wrapper. Owns the connection, queues messages until
// open, dispatches inbound messages to typed callbacks. Kept small on purpose:
// nothing app-specific beyond message shapes lives here.

import type { Intent, Tree } from "./shared/apply"

export type CursorTool = "hand" | "can" | "can-pour" | "shears" | "shears-closed"

export interface HelloSnapshot {
    trees: Tree[]
    claims: (string | null)[]
    players: { id: string; color: string }[]
}

export interface Handlers {
    // `color` is null until the player claims their first tree (server defers
    // palette assignment so spectator clients don't consume a slot).
    onHello?(playerId: string, color: string | null, snapshot: HelloSnapshot): void
    onPlayerJoin?(playerId: string, color: string): void
    onPlayerLeave?(playerId: string): void
    onClaimUpdate?(treeIndex: number, ownerId: string | null): void
    onClaimResult?(treeIndex: number, ok: boolean, reason?: string): void
    onIntent?(intent: Intent, senderId: string): void
    onCursor?(playerId: string, color: string | null, pos: { x: number; y: number; tool: CursorTool } | null): void
    onStatusChange?(status: "connecting" | "open" | "closed"): void
}

export class Net {
    private ws: WebSocket | null = null
    private queue: string[] = []
    private reconnectDelay = 1000

    constructor(private url: string, private handlers: Handlers) {
        this.connect()
    }

    private connect() {
        this.handlers.onStatusChange?.("connecting")
        const ws = new WebSocket(this.url)
        this.ws = ws
        ws.addEventListener("open", () => {
            this.handlers.onStatusChange?.("open")
            for (const msg of this.queue) ws.send(msg)
            this.queue.length = 0
            this.reconnectDelay = 1000
        })
        ws.addEventListener("message", (ev) => {
            let msg: any
            try {
                msg = JSON.parse(ev.data)
            } catch {
                return
            }
            this.dispatch(msg)
        })
        ws.addEventListener("close", () => {
            this.handlers.onStatusChange?.("closed")
            this.ws = null
            setTimeout(() => this.connect(), this.reconnectDelay)
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000)
        })
        ws.addEventListener("error", () => {
            // close will fire next; nothing to do here.
        })
    }

    private dispatch(msg: any) {
        switch (msg?.type) {
            case "hello":
                this.handlers.onHello?.(msg.playerId, msg.color, msg.snapshot)
                return
            case "player-join":
                this.handlers.onPlayerJoin?.(msg.playerId, msg.color)
                return
            case "player-leave":
                this.handlers.onPlayerLeave?.(msg.playerId)
                return
            case "claim-update":
                this.handlers.onClaimUpdate?.(msg.treeIndex, msg.ownerId)
                return
            case "claim-result":
                this.handlers.onClaimResult?.(msg.treeIndex, msg.ok, msg.reason)
                return
            case "intent":
                this.handlers.onIntent?.(msg.intent, msg.senderId)
                return
            case "cursor": {
                const pos = typeof msg.x === "number" && typeof msg.y === "number"
                    ? { x: msg.x, y: msg.y, tool: (msg.tool ?? "hand") as CursorTool }
                    : null
                this.handlers.onCursor?.(msg.playerId, msg.color, pos)
                return
            }
        }
    }

    private send(obj: unknown) {
        const text = JSON.stringify(obj)
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(text)
        } else {
            this.queue.push(text)
        }
    }

    claim(treeIndex: number) {
        this.send({ type: "claim", treeIndex })
    }
    release(treeIndex: number) {
        this.send({ type: "release", treeIndex })
    }
    sendIntent(intent: Intent) {
        this.send({ type: "intent", intent })
    }
    sendCursor(pos: { x: number; y: number; tool: CursorTool } | null) {
        const msg: any = { type: "cursor" }
        if (pos) {
            msg.x = pos.x
            msg.y = pos.y
            if (pos.tool !== "hand") msg.tool = pos.tool
        }
        this.send(msg)
    }
}
