import * as d3 from "d3"

import {
    applyIntent,
    classify,
    maxNumericIdSuffix,
    newTree as newTreeJson,
    NUM_TREES,
    NOTE_ATOMS,
    SAMPLE_ATOMS,
    UNARY_FUNCS,
    VARIADIC_FUNCS,
    Intent,
    Tree,
} from "./shared/apply"
import { Net, HelloSnapshot } from "./net"

// Emoji mapping for tree nodes
const EMOJI_MAP: Record<string, string> = {
    // Sample atoms
    "ocarina_small_stacc": "🐚",
    "guiro": "🪇",
    "psaltery_pluck": "🪕",
    "sleighbells": "🔔",
    "folkharp": "🪉",
    "didgeridoo": "🪈",
    "insect": "🦗",
    "insect:2": "🐝",
    "wind": "💨",
    "crow": "🐦‍⬛",
    "east": "🧭",
    "~": " ",
    // Note atoms - colored shapes by pitch, shape by octave
    // Octave 2 (low) - squares
    "c2": "🟥",
    "eb2": "🟨",
    "g2": "🟩",
    "bb2": "🟦",
    // Octave 3 (mid) - hearts
    "c3": "❤️",
    "eb3": "💛",
    "g3": "💚",
    "bb3": "💙",
    // Default octave (high) - circles
    "c": "🔴",
    "eb": "🟡",
    "g": "🟢",
    "bb": "🔵",
    // Unary functions
    "degrade": "🪙",
    "brak": "🧱",
    "rev": "⏪",
    // Variadic functions
    "stack": "📚",
    "chooseCycles": "🔀",
    "seq": "⏩",
    "cat": "🐱",
    // Special
    " ": "🫚",
}

function getEmoji(name: string): string {
    return EMOJI_MAP[name] || "❓"
}

// Authoritative tree state mirrored from the server.
const treeJsons: Tree[] = Array.from({ length: NUM_TREES }, (_, i) => newTreeJson(i))
const sources = [...new Array(NUM_TREES)].map(() => "silence")

// Per-tree local id counter for the owner client. Initialized from the tree
// snapshot on claim (max existing numeric suffix + 1).
const treeIdCounters: number[] = Array.from({ length: NUM_TREES }, () => 0)

function nextLocalId(treeIndex: number): string {
    return `t${treeIndex}_${treeIdCounters[treeIndex]++}`
}

function initCounter(treeIndex: number) {
    treeIdCounters[treeIndex] = maxNumericIdSuffix(treeJsons[treeIndex], treeIndex) + 1
}

const activeAtoms = new Set<string>()
const atomTimeouts = new Map<string, number>()
const treeRoots: d3.HierarchyNode<PointNode>[] = []

function choice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]
}

function genAtom() {
    return choice(Math.random() < 0.3 ? NOTE_ATOMS : SAMPLE_ATOMS)
}

interface Point {
    x: number
    y: number
}

// Extends the shared Tree shape with the mutable x0/y0 layout memory that d3
// writes as it runs transitions. These fields are not serialized over the
// network — the server stores plain Tree JSON.
interface PointNode extends Tree {
    x0?: number
    y0?: number
    children?: PointNode[]
}

// Ownership + player state (populated via Net callbacks).
let myPlayerId: string | null = null
let myColor: string = "white"
const ownedTrees = new Set<number>()
const claimOwners: (string | null)[] = Array.from({ length: NUM_TREES }, () => null)
const playerColors = new Map<string, string>()

// Per-tree handles used to push network-originated state into the d3 layer.
interface TreeHandle {
    rebuild(sourceId: string | null): void
}
const treeHandles: TreeHandle[] = []

let planterSvg: SVGSVGElement | null = null

function setupTree() {
    // https://stackoverflow.com/questions/69975911/rotate-tree-diagram-on-d3-js-v5-from-horizental-to-vertical
    // Set the dimensions and margins of the diagram
    const margin = {top: 20, right: 90, bottom: 30, left: 90},
        width = 1920 - margin.left - margin.right,
        height = 800 - margin.top - margin.bottom
    const _svg = d3.select("#planter").append("svg")
        .attr("width", width + margin.right + margin.left)
        .attr("height", height + margin.top + margin.bottom)
        .attr("viewBox", `0 0 ${width + margin.right + margin.left} ${height + margin.top + margin.bottom}`)
    planterSvg = _svg.node() as SVGSVGElement

    for (let treeIndex = 0; treeIndex < NUM_TREES; treeIndex++) {

        function clickTree(e: any) {
            console.log("clickTree", e)
        }

        function clickLink(e: Event, d: d3.HierarchyPointNode<PointNode>) {
            if (!ownedTrees.has(treeIndex)) return
            const targetId = d.data.id
            // Pre-roll: which atom to replace with, and its new id.
            const intent: Intent = {
                kind: "replace-link",
                treeIndex,
                targetId,
                newAtomName: genAtom(),
                newId: nextLocalId(treeIndex),
            }
            applyLocalIntent(intent)
            e.stopPropagation()
        }

        function clickNode(e: Event, d: d3.HierarchyPointNode<PointNode>) {
            if (!ownedTrees.has(treeIndex)) return
            // Prevent watering the root node
            if (d.data.name === " ") return
            const kind = classify(d.data.name)
            if (kind === "unary") {
                // No mutation defined for unary function clicks (same as original).
                return
            }
            if (kind === "variadic") {
                const intent: Intent = {
                    kind: "add-child",
                    treeIndex,
                    targetId: d.data.id,
                    newAtomName: genAtom(),
                    newId: nextLocalId(treeIndex),
                }
                applyLocalIntent(intent)
                e.stopPropagation()
                return
            }
            // Atom → function transform. Pre-roll everything.
            const isVariadic = Math.random() >= 0.25
            const newName = isVariadic ? choice(VARIADIC_FUNCS) : choice(UNARY_FUNCS)
            const intent: Intent = {
                kind: "grow-atom",
                treeIndex,
                targetId: d.data.id,
                newName,
                newAtomName: genAtom(),
                isVariadic,
                newIds: [nextLocalId(treeIndex), nextLocalId(treeIndex)],
                swap: Math.random() < 0.5,
            }
            applyLocalIntent(intent)
            e.stopPropagation()
        }

        function applyLocalIntent(intent: Intent) {
            // Optimistic: apply locally first, then send.
            let sourceId: string
            try {
                ;({ sourceId } = applyIntent(treeJsons[treeIndex], intent))
            } catch (err) {
                console.warn("local intent apply failed:", err)
                return
            }
            rebuild(sourceId)
            net.sendIntent(intent)
        }

        // append the svg object to the body of the page
        // appends a 'group' element to 'svg'
        // moves the 'group' element to the top left margin
        const svg = _svg
            .append("g")
            .attr("id", `tree-${treeIndex}`)
            .on("click", clickTree)
            .attr("transform", "translate(" + (margin.left + treeIndex * (width / NUM_TREES)) + "," + (height - margin.top) + ")")

        const duration = 2000

        // declares a tree layout and assigns the size
        const treemap = d3.tree().size([width / NUM_TREES, height])

        // Assigns parent, children, height, depth. `root` is rebuilt in place
        // after every mutation so that new Tree subtrees become HierarchyNodes.
        // The d3 join key is `d.data.id`, so transitions remain coherent across
        // rebuilds as long as ids are stable.
        let root = d3.hierarchy<PointNode>(treeJsons[treeIndex] as PointNode, d => d.children)
        root.data.x0 = height / 2
        root.data.y0 = 0

        treeRoots.push(root)

        function rebuild(sourceId: string | null) {
            root = d3.hierarchy<PointNode>(treeJsons[treeIndex] as PointNode, d => d.children)
            if (root.data.x0 === undefined) {
                root.data.x0 = height / 2
                root.data.y0 = 0
            }
            treeRoots[treeIndex] = root
            const source =
                (sourceId && root.descendants().find(n => n.data.id === sourceId)) || root
            update(source)
            playTree(root, treeIndex)
        }

        treeHandles.push({ rebuild })

        update(root)

        function update(source: d3.HierarchyNode<PointNode>) {
            // Assigns the x and y position for the nodes
            // Always calculate layout with root for correctness
            const treeLayout: d3.HierarchyPointNode<PointNode> = treemap(root as any) as any

            // Compute the new tree layout.
            const nodes = treeLayout.descendants(),
            links = treeLayout.descendants().slice(1)

            // Normalize for fixed-depth.
            nodes.forEach(d => { d.y = d.depth * 50 })

            // Find the node in the new layout that corresponds to source (for animations).
            // Since data objects are shared between the old and new hierarchies (we rebuild
            // from the same Tree JSON), reference equality is sufficient.
            const sourceNode = nodes.find(node => node.data === source.data) || treeLayout

            // Update the nodes...
            const node = svg.selectAll('g.node')
                .data(nodes, (d: any) => d.data.id)

            // Enter any new nodes at the parent's previous position.
            const nodeEnter = node.enter().append('g')
                .attr('class', 'node')
                .attr("transform", (d: d3.HierarchyPointNode<PointNode>) => {
                    const parent = d.parent;
                    if (parent && parent.data.x0 !== undefined) {
                        return "translate(" + parent.data.x0 + "," + -parent.data.y0! + ")";
                    }
                    return "translate(" + sourceNode.data.x0 + "," + -sourceNode.data.y0! + ")";
                })
                .on('click', clickNode)

            // var rectHeight = 60, rectWidth = 120
            const rectHeight = 30, rectWidth = 30

            nodeEnter.append('rect')
                .attr('class', 'node')
                .attr("width", rectWidth)
                .attr("height", rectHeight)
                .attr("x", 0)
                .attr("y", (rectHeight/2)*-1)
                .attr("rx","5")
                .style("fill", (d: d3.HierarchyPointNode<any>) => d.data.fill)
                .style("stroke", "black")

            // Add labels for the nodes
            nodeEnter.append('text')
                .attr("class", "node-text")
                .attr("dy", ".4em")
                .attr("x", rectWidth / 2)
                .attr("text-anchor", "middle")
                .style("font-size", "20px")
                .text((d: d3.HierarchyPointNode<any>) => getEmoji(d.data.name))

            // UPDATE
            const nodeUpdate = nodeEnter.merge(node as any)

            // Interrupt any ongoing transitions to prevent jank
            nodeUpdate.interrupt()

            // Transition to the proper position for the node
            nodeUpdate.transition()
                .duration(duration)
                .ease(d3.easeCubicInOut)
                .attr("transform", d => "translate(" + d.x + "," + -d.y + ")")

            // Update the text content (for when nodes transform)
            nodeUpdate.select('text')
                .text((d: d3.HierarchyPointNode<any>) => getEmoji(d.data.name))

            // Update the node attributes and style
            nodeUpdate.select('circle.node')
                .attr('r', 10)
                .style("fill", d => d.children ? "lightsteelblue" : "#fff")
                .attr('cursor', 'pointer')


            // Remove any exiting nodes - all collapse to source as a unit
            const nodeExit = node.exit().transition()
                .duration(duration)
                .ease(d3.easeCubicInOut)
                .attr("transform", function(this: any) {
                    return "translate(" + sourceNode.x + "," + -sourceNode.y! + ")";
                })
                .remove()

            // On exit reduce the node circles size to 0
            nodeExit.select('circle')
                .attr('r', 1e-6)

            // On exit reduce the opacity of text labels
            nodeExit.select('text')
                .style('fill-opacity', 1e-6)

            // Update the links...
            const link = svg.selectAll('path.link')
                .data(links, (d: any) => d.data.id)

            // Enter any new links at the parent's previous position.
            const linkEnter = link.enter().insert('path', "g")
                .attr("class", "link")
                .on("click", clickLink)
                .attr("stroke", "black")
                .attr("stroke-width", 3)
                .attr('d', (d: d3.HierarchyPointNode<PointNode>) => {
                    const parent = d.parent!;
                    const o = { x: parent.data.x0 ?? 0, y: parent.data.y0 ?? 0 }
                    return diagonal(o, o)
                })

            // UPDATE
            const linkUpdate = linkEnter.merge(link as any)

            // Interrupt any ongoing transitions to prevent jank
            linkUpdate.interrupt()

            // Transition back to the parent element position
            linkUpdate.transition()
                .duration(duration)
                .ease(d3.easeCubicInOut)
                .attr('d', function(d){ return diagonal(d, d.parent!) })

            // Remove any exiting links - all collapse to source as a unit
            link.exit().transition()
                .duration(duration)
                .ease(d3.easeCubicInOut)
                .attr('d', function(this: any) {
                    const o = { x: sourceNode.x!, y: sourceNode.y! }
                    return diagonal(o, o)
                })
                .remove()

            // Store the old positions for transition.
            nodes.forEach((d: d3.HierarchyPointNode<any>) => {
                d.data.x0 = d.x
                d.data.y0 = d.y
            })

            // Creates a curved (diagonal) path from parent to the child nodes
            function diagonal(s: Point, d: Point) {
                const path = `M ${s.x + (rectWidth / 2)} ${-s.y}
                    C ${(s.x + d.x) / 2 + (rectWidth / 2)} ${-s.y},
                    ${(s.x + d.x) / 2 + (rectWidth / 2)} ${-d.y},
                    ${d.x + (rectWidth / 2)} ${-d.y}`

                return path
            }
        }
    }
}

function updateTreeColors(root: d3.HierarchyNode<PointNode>, treeIndex: number) {
    const group = d3.select(`#tree-${treeIndex}`)
    root.descendants().forEach(node => {
        const isLeaf = !node.children || node.children.length === 0
        if (isLeaf && node.data.id) {
            node.data.fill = activeAtoms.has(node.data.id) ? "yellow" : "white"
        }
    })
    group.selectAll<SVGRectElement, d3.HierarchyPointNode<PointNode>>('rect.node')
        .style("fill", d => d.data.fill)
}

;(window as any).highlightAtoms = function(tags: any[]) {
    if (!tags || tags.length === 0) return
    for (const tag of tags) {
        const id = tag.__pure
        activeAtoms.add(id)
        // Clear any existing timeout for this tag
        const existing = atomTimeouts.get(id)
        if (existing !== undefined) clearTimeout(existing)
        // Set a timeout to remove the highlight
        atomTimeouts.set(id, window.setTimeout(() => {
            activeAtoms.delete(id)
            atomTimeouts.delete(id)
            treeRoots.forEach((root, i) => updateTreeColors(root, i))
        }, 150))
    }
    treeRoots.forEach((root, i) => updateTreeColors(root, i))
}

function convertTreeToExpression(tree: d3.HierarchyNode<PointNode>): string {
    if (tree.data.name === " ") { // HACK: Special case for root
        return convertTreeToExpression(tree.children![0])
    } else if (SAMPLE_ATOMS.includes(tree.data.name)) {
        return `s("${tree.data.name}").tag("${tree.data.id}")`
    } else if (NOTE_ATOMS.includes(tree.data.name)) {
        return `note("${tree.data.name}").s("piano").tag("${tree.data.id}")`
    } else {
        const args = tree.children!.map(convertTreeToExpression).join(",")
        return `${tree.data.name}(${args})`
    }
}

// Trailing-debounce Strudel re-evaluation per tree, so a burst of mutations
// (local + relayed) doesn't thrash the scheduler.
const playTreeTimeouts: (number | null)[] = Array.from({ length: NUM_TREES }, () => null)
function playTree(tree: d3.HierarchyNode<PointNode>, treeIndex: number) {
    // Clear stale highlights when tree structure changes
    for (const timeout of atomTimeouts.values()) clearTimeout(timeout)
    atomTimeouts.clear()
    activeAtoms.clear()
    treeRoots.forEach((root, i) => updateTreeColors(root, i))

    sources[treeIndex] = convertTreeToExpression(tree)

    if (playTreeTimeouts[treeIndex] !== null) clearTimeout(playTreeTimeouts[treeIndex]!)
    playTreeTimeouts[treeIndex] = window.setTimeout(() => {
        playTreeTimeouts[treeIndex] = null
        const panned = sources.map((s, i) => `${s}.pan(${i / (NUM_TREES - 1)})`)
        // NOTE: The `onTrigger` call will need to be updated (drop the initial unused argument) after updating Strudel.
        const triggerCall = `.onTrigger((_, hap, currentTime, cps, targetTime) => { const diff = Math.max(0, targetTime - currentTime); setTimeout(() => window.highlightAtoms(hap.context.tags || []), diff * 1000); }, false)`
        const program = `//ctrl/cmd+. to stop\nstack(${panned.join(",")})${triggerCall}`
        repl.editor.setCode(program)
        repl.editor.evaluate()
    }, 100)
}

setupTree()

// ----- network client ------------------------------------------------------

function replaceAllTrees(snapshot: HelloSnapshot) {
    for (let i = 0; i < NUM_TREES; i++) {
        treeJsons[i] = snapshot.trees[i]
        treeHandles[i].rebuild(null)
        claimOwners[i] = snapshot.claims[i] ?? null
    }
    ownedTrees.clear()
    if (myPlayerId) {
        for (let i = 0; i < NUM_TREES; i++) {
            if (claimOwners[i] === myPlayerId) {
                ownedTrees.add(i)
                initCounter(i)
            }
        }
    }
}

const wsUrl = (() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:"
    return `${proto}//${location.host}/ws`
})()

const net = new Net(wsUrl, {
    onHello(playerId, color, snapshot) {
        myPlayerId = playerId
        myColor = color
        playerColors.set(playerId, color)
        for (const p of snapshot.players) playerColors.set(p.id, p.color)
        replaceAllTrees(snapshot)
        renderClaimBar()
    },
    onPlayerJoin(playerId, color) {
        playerColors.set(playerId, color)
    },
    onPlayerLeave(playerId) {
        playerColors.delete(playerId)
        removeRemoteCursor(playerId)
    },
    onClaimUpdate(treeIndex, ownerId) {
        claimOwners[treeIndex] = ownerId
        if (ownerId === myPlayerId) {
            if (!ownedTrees.has(treeIndex)) {
                ownedTrees.add(treeIndex)
                initCounter(treeIndex)
            }
        } else {
            ownedTrees.delete(treeIndex)
        }
        renderClaimBar()
    },
    onClaimResult(treeIndex, ok, reason) {
        if (!ok) console.warn(`claim ${treeIndex} rejected: ${reason}`)
    },
    onIntent(intent, _senderId) {
        try {
            const { sourceId } = applyIntent(treeJsons[intent.treeIndex], intent)
            treeHandles[intent.treeIndex].rebuild(sourceId)
        } catch (err) {
            console.warn("remote intent apply failed:", err)
        }
    },
    onCursor(playerId, color, x, y, visible) {
        updateRemoteCursor(playerId, color, x, y, visible)
    },
    onStatusChange(status) {
        const pill = document.getElementById("status-pill")
        if (!pill) return
        pill.textContent =
            status === "open" ? `● connected ${myPlayerId ?? ""}` :
            status === "connecting" ? "connecting…" :
            "disconnected"
        pill.style.background =
            status === "open" ? "rgba(40, 140, 40, 0.85)" :
            status === "connecting" ? "rgba(140, 140, 40, 0.85)" :
            "rgba(140, 40, 40, 0.85)"
    },
})

// ----- claim bar UI --------------------------------------------------------

function renderClaimBar() {
    const bar = document.getElementById("claim-bar")
    if (!bar) return
    bar.replaceChildren()
    for (let i = 0; i < NUM_TREES; i++) {
        const btn = document.createElement("button")
        btn.className = "claim-btn"
        const owner = claimOwners[i]
        if (owner === null) {
            btn.textContent = `claim t${i}`
            btn.addEventListener("click", () => net.claim(i))
        } else if (owner === myPlayerId) {
            btn.classList.add("mine")
            btn.textContent = `you · t${i} (release)`
            btn.addEventListener("click", () => net.release(i))
        } else {
            btn.classList.add("taken")
            const dot = document.createElement("span")
            dot.className = "owner-dot"
            dot.style.background = playerColors.get(owner) ?? "#888"
            btn.append(dot, `t${i} taken`)
            btn.disabled = true
        }
        bar.append(btn)
    }
}

// ----- cursors -------------------------------------------------------------

const remoteCursorEls = new Map<string, HTMLDivElement>()

function getRemoteCursorEl(playerId: string, color: string): HTMLDivElement {
    let el = remoteCursorEls.get(playerId)
    if (!el) {
        el = document.createElement("div")
        el.className = "remote-cursor"
        el.style.background = color
        const label = document.createElement("span")
        label.className = "label"
        label.textContent = playerId
        label.style.background = "rgba(0,0,0,0.7)"
        el.append(label)
        document.getElementById("cursors")!.append(el)
        remoteCursorEls.set(playerId, el)
    }
    return el
}

function removeRemoteCursor(playerId: string) {
    const el = remoteCursorEls.get(playerId)
    if (el) {
        el.remove()
        remoteCursorEls.delete(playerId)
    }
}

// `x`,`y` are SVG user-space coordinates (the same coords d3 uses internally
// via the root SVG's viewBox). Convert to client pixels using the SVG's
// current screen CTM, then position the cursor div in page coordinates.
function updateRemoteCursor(playerId: string, color: string, x: number, y: number, visible: boolean) {
    if (!visible) {
        removeRemoteCursor(playerId)
        return
    }
    if (!planterSvg) return
    const ctm = planterSvg.getScreenCTM()
    if (!ctm) return
    const pt = planterSvg.createSVGPoint()
    pt.x = x
    pt.y = y
    const screen = pt.matrixTransform(ctm)
    const el = getRemoteCursorEl(playerId, color)
    el.style.left = `${screen.x}px`
    el.style.top = `${screen.y}px`
}

// Local mousemove → SVG coordinates → throttled send.
let pendingCursor: { x: number; y: number } | null = null
let cursorRafScheduled = false
function handleMouseMove(ev: MouseEvent) {
    if (!planterSvg) return
    const ctm = planterSvg.getScreenCTM()
    if (!ctm) return
    const pt = planterSvg.createSVGPoint()
    pt.x = ev.clientX
    pt.y = ev.clientY
    const svgPt = pt.matrixTransform(ctm.inverse())
    pendingCursor = { x: svgPt.x, y: svgPt.y }
    if (!cursorRafScheduled) {
        cursorRafScheduled = true
        requestAnimationFrame(() => {
            cursorRafScheduled = false
            if (pendingCursor) {
                net.sendCursor(pendingCursor.x, pendingCursor.y, true)
                pendingCursor = null
            }
        })
    }
}
window.addEventListener("mousemove", handleMouseMove)
window.addEventListener("mouseleave", () => {
    net.sendCursor(0, 0, false)
})

// Use myColor to tint the status pill text so players can tell apart two
// browser tabs at a glance.
document.addEventListener("DOMContentLoaded", () => {
    const pill = document.getElementById("status-pill")
    if (pill) pill.style.borderLeft = `6px solid ${myColor}`
})

// Redirect Strudel's sample fetches from GitHub to the local server so the app
// works on a LAN without internet. This intercepts fetch() BEFORE the
// <strudel-editor> element is created, so prebake's own sample registry loads
// are redirected transparently — no need to call samples() ourselves (which
// would create an AudioContext before a user gesture).
const sampleRedirects: [string, string][] = [
    ["https://raw.githubusercontent.com/felixroos/dough-samples/main/", "/samples/"],
    ["https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/", "/samples/Dirt-Samples/"],
    ["https://raw.githubusercontent.com/sgossner/VCSL/master/", "/samples/VCSL/"],
    ["https://raw.githubusercontent.com/geikha/tidal-drum-machines/main/", "/samples/tidal-drum-machines/"],
]
const _origFetch = window.fetch.bind(window)
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string") {
        for (const [from, to] of sampleRedirects) {
            if (input.startsWith(from)) {
                input = to + input.slice(from.length)
                break
            }
        }
    }
    return _origFetch(input, init)
}

// Filter out silence marker
const samplesToLoad = SAMPLE_ATOMS.filter(s => s !== "~")
console.log(`Preloading ${samplesToLoad.length + 1} samples...`)

// Build a Strudel pattern that includes all samples we want to preload
// Using gain(0) to trigger loading without playing audio
const samplePatterns = samplesToLoad.map(sample => `s("${sample}")`)
// Add piano sample
const allPatterns = [...samplePatterns, `note("c").s("piano")`]
const preloadCode = `// evaluate this (ctrl/cmd+enter) to pre-load samples\nstack(${allPatterns.join(',')}).gain(0)`

console.log('Preload code:', preloadCode)

const repl = document.createElement('strudel-editor') as any
repl.setAttribute('code', preloadCode)
document.getElementById('strudel')!.append(repl)
