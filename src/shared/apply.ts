// Shared types and pure logic for applying mutation intents to a tree.
// Imported by both the client (src/main.ts) and the server (server/index.ts).

export const SAMPLE_ATOMS = ["ocarina_small_stacc", "guiro", "psaltery_pluck", "sleighbells", "folkharp", "didgeridoo", "insect", "insect:2", "wind", "crow", "east", "~"]
export const NOTE_ATOMS = ["c2", "eb2", "g2", "bb2", "c3", "eb3", "g3", "bb3", "c", "eb", "g", "bb"]
export const UNARY_FUNCS = ["degrade", "brak", "rev"]
export const VARIADIC_FUNCS = ["stack", "chooseCycles", "seq", "cat"]

export const NUM_TREES = 8

export interface Tree {
    name: string
    fill: string
    id: string
    children?: Tree[]
}

export type NodeKind = "root" | "atom" | "unary" | "variadic"

export function classify(name: string): NodeKind {
    if (name === " ") return "root"
    if (UNARY_FUNCS.includes(name)) return "unary"
    if (VARIADIC_FUNCS.includes(name)) return "variadic"
    return "atom"
}

export function isAtom(name: string): boolean {
    return SAMPLE_ATOMS.includes(name) || NOTE_ATOMS.includes(name)
}

// Intent messages. The originating client pre-rolls all randomness and ships
// it in the intent so every client can apply deterministically.

export type Intent =
    | {
          kind: "grow-atom"
          treeIndex: number
          targetId: string
          // The function the atom becomes.
          newName: string
          // The additional atom introduced as a sibling (only used when variadic).
          newAtomName: string
          isVariadic: boolean
          // Always two ids: [id-for-old-atom-child, id-for-new-sibling]. The
          // second is unused in the unary case but we reserve it so the schema
          // is rigid.
          newIds: [string, string]
          swap: boolean
      }
    | {
          kind: "add-child"
          treeIndex: number
          targetId: string
          newAtomName: string
          newId: string
      }
    | {
          kind: "replace-link"
          treeIndex: number
          targetId: string
          newAtomName: string
          newId: string
      }

export function findNode(tree: Tree, id: string): Tree | null {
    if (tree.id === id) return tree
    if (!tree.children) return null
    for (const child of tree.children) {
        const found = findNode(child, id)
        if (found) return found
    }
    return null
}

export function findParent(tree: Tree, id: string): Tree | null {
    if (!tree.children) return null
    for (const child of tree.children) {
        if (child.id === id) return tree
        const found = findParent(child, id)
        if (found) return found
    }
    return null
}

function leaf(name: string, id: string): Tree {
    return { name, fill: "white", id }
}

// Applies an intent to the given tree in place. Returns the id of the node
// that should be the "animation source" for d3 enter/exit transitions (the
// same node the originating user clicked on).
//
// Throws on invalid intents (bad target, wrong kind). Callers should catch
// and reject the intent — on the server for validation, on the client as a
// last-line defense against bugs.
export function applyIntent(tree: Tree, intent: Intent): { sourceId: string } {
    switch (intent.kind) {
        case "grow-atom": {
            const target = findNode(tree, intent.targetId)
            if (!target) throw new Error(`grow-atom: node ${intent.targetId} not found`)
            if (classify(target.name) !== "atom") {
                throw new Error(`grow-atom: node ${intent.targetId} is not an atom (is ${target.name})`)
            }
            const oldName = target.name
            target.name = intent.newName
            if (intent.isVariadic) {
                if (classify(intent.newName) !== "variadic") {
                    throw new Error(`grow-atom: newName ${intent.newName} is not a variadic func`)
                }
                const children: Tree[] = [
                    leaf(oldName, intent.newIds[0]),
                    leaf(intent.newAtomName, intent.newIds[1]),
                ]
                if (intent.swap) {
                    const tmp = children[0]
                    children[0] = children[1]
                    children[1] = tmp
                }
                target.children = children
            } else {
                if (classify(intent.newName) !== "unary") {
                    throw new Error(`grow-atom: newName ${intent.newName} is not a unary func`)
                }
                target.children = [leaf(oldName, intent.newIds[0])]
            }
            return { sourceId: target.id }
        }

        case "add-child": {
            const target = findNode(tree, intent.targetId)
            if (!target) throw new Error(`add-child: node ${intent.targetId} not found`)
            if (classify(target.name) !== "variadic") {
                throw new Error(`add-child: node ${intent.targetId} is not a variadic func (is ${target.name})`)
            }
            if (!target.children) target.children = []
            target.children.push(leaf(intent.newAtomName, intent.newId))
            return { sourceId: target.id }
        }

        case "replace-link": {
            // targetId is the child that's being replaced.
            const parent = findParent(tree, intent.targetId)
            if (!parent || !parent.children) {
                throw new Error(`replace-link: parent of ${intent.targetId} not found`)
            }
            const idx = parent.children.findIndex((c) => c.id === intent.targetId)
            if (idx < 0) throw new Error(`replace-link: child ${intent.targetId} not in parent`)
            parent.children[idx] = leaf(intent.newAtomName, intent.newId)
            return { sourceId: parent.id }
        }
    }
}

// Initial tree for tree index `treeIndex`. Matches the original setupTree()
// shape: a root " " node with a single "~" child.
export function newTree(treeIndex: number): Tree {
    return {
        name: " ",
        fill: "white",
        id: `t${treeIndex}_0`,
        children: [
            {
                name: "~",
                fill: "white",
                id: `t${treeIndex}_1`,
            },
        ],
    }
}

// Highest numeric suffix currently used by an id of the form `t<index>:<n>` in
// this tree. Owners use this to initialize their local id counter on claim so
// that new ids don't collide with existing ones.
export function maxNumericIdSuffix(tree: Tree, treeIndex: number): number {
    const prefix = `t${treeIndex}_`
    let max = -1
    const walk = (t: Tree) => {
        if (t.id.startsWith(prefix)) {
            const n = parseInt(t.id.slice(prefix.length), 10)
            if (Number.isFinite(n) && n > max) max = n
        }
        if (t.children) for (const c of t.children) walk(c)
    }
    walk(tree)
    return max
}
