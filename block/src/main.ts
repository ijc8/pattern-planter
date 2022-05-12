import { codeGen } from "shift-codegen"
import { distance, mapping } from "zhang-shasha"

// var a = {
//     label: 'a',
//     children: [
//         {label: 'b', children: []},
//         {label: 'c', children: []}
//     ]
// }

// var b = {
//     label: 'a',
//     children: [
//         {label: 'b', children: []}
//     ]
// }

function children(node: any) {
    // return node.children
    if (node.type === "ConditionalExpression") {
        return [node.test, node.consequent, node.alternate]
    } else if (node.type === "BinaryExpression") {
        return [node.left, node.right]
    } else if (node.type === "UnaryExpression") {
        return [node.operand]
    } else {
        return []
    }
}

function insertCost() { return 1 }
function removeCost(node: any) {
    // if (node.type === "BinaryExpression") return Infinity
    return 1
}
function updateCost(from: any, to: any) {
    // return from.label === to.label ? 0 : 1
    if (from.type === to.type) {
        if (to.type === "BinaryExpression" && from.operator !== to.operator) {
            return 1
        }
        return 0
    }
    if ([from.type, to.type].includes("BinaryExpression")) return Infinity
    if ([from.type, to.type].includes("ConditionalExpression")) return Infinity
    return 1
}

// console.log("dist", distance(a, b, children, insertCost, removeCost, updateCost))
// console.log(mapping(a, b, children, insertCost, removeCost, updateCost))

let a = generateExpression(3, true)
const b = generateExpression(3, true)
console.log(codeGen(a), "->", codeGen(b))
console.log(a)
console.log(b)
console.log(JSON.parse(JSON.stringify(mapping(a, b, children, insertCost, removeCost, updateCost))))
// console.log(mapping(b, a, children, insertCost, removeCost, updateCost))

function replaceObject(target: any, source: any) {
    for (const prop of Object.getOwnPropertyNames(target)) {
        delete target[prop]
    }
    Object.assign(target, source)
}

// Execute the first instruction.
let m = mapping(a, b, children, insertCost, removeCost, updateCost)
let i = 0

function executeEdit(m: any[]) {
    for (let i = 0; i < m.length; i++) {
        if (m[i].type === "match") {
            console.log("Got a match, doing nothing.")
        } else {
            console.log("Got", JSON.parse(JSON.stringify(m[i])))
            if (m[i].type === "update") {
                console.log("Performing update")
                if (m[i].t1.type !== m[i].t2.type) {
                    replaceObject(m[i].t1, m[i].t2)
                } else {
                    m[i].t1.operator = m[i].t2.operator
                }
            } else if (m[i].type === "remove") {
                if (m[i].t1.type === "UnaryExpression") {
                    replaceObject(m[i].t1, m[i].t1.operand)
                } else if (m[i].t1.type === "BinaryExpression") {
                    // Replace with random child.
                    replaceObject(m[i].t1, Math.random() < 0.5 ? m[i].t1.left : m[i].t1.right)
                } else if (m[i].t1.type === "ConditionalExpression") {
                    // Replace with random branch.
                    replaceObject(m[i].t1, Math.random() < 0.5 ? m[i].t1.consequent : m[i].t1.alternate)
                } else {
                    console.log("uh oh", m[i].t1)
                    return false
                }
            } else {
                console.log("hmm", m[i])
                return false
            }
            return true
        }
    }
    return false
}

console.log("Distance:", distance(a, b, children, insertCost, removeCost, updateCost))
while (executeEdit(m)) {
    console.log(codeGen(a), "->", codeGen(b), "!")
    console.log("Distance:", distance(a, b, children, insertCost, removeCost, updateCost))
    m = mapping(a, b, children, insertCost, removeCost, updateCost)
}

console.log("All done")

console.log(a)

const canvas = document.querySelector("canvas")!
const ctx = canvas.getContext("2d")!
ctx.fillRect(0, 0, 10, 10)
ctx.imageSmoothingEnabled = false

const image = ctx.createImageData(40, 40)

const sampleRate = 48000

function render(input: Float32Array) {
    const data = image.data
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
            const index = x + y*40
            const v = Math.round((input[index] + 1) / 2 * 255)
            data[index*4 + 0] = v
            data[index*4 + 1] = v
            data[index*4 + 2] = v
            data[index*4 + 3] = 255
        }
    }
    ctx.putImageData(image, 0, 0)
}

const audioCtx = new AudioContext({ sampleRate })
console.log(audioCtx)

const buffers = [
    new AudioBuffer({ length: 1600, sampleRate }),
    new AudioBuffer({ length: 1600, sampleRate }),
]

let t = 0

const sources = [
    new AudioBufferSourceNode(audioCtx, { buffer: buffers[0] }),
    new AudioBufferSourceNode(audioCtx, { buffer: buffers[1] }),
]

sources[0].connect(audioCtx.destination)
sources[0].onended = () => {
    const data = buffers[0].getChannelData(0)
    for (let i = 0; i < data.length; i++) {
        data[i] = gen.next().value
    }
    render(data)
    const source = new AudioBufferSourceNode(audioCtx, { buffer: buffers[0] })
    source.connect(audioCtx.destination)
    source.onended = sources[0].onended
    source.start(t)
    t += buffers[0].duration
    sources[0] = source
}

sources[1].connect(audioCtx.destination)
sources[1].onended = () => {
    const data = buffers[1].getChannelData(0)
    for (let i = 0; i < data.length; i++) {
        data[i] = gen.next().value
    }
    render(data)
    const source = new AudioBufferSourceNode(audioCtx, { buffer: buffers[1] })
    source.connect(audioCtx.destination)
    source.onended = sources[1].onended
    source.start(t)
    t += buffers[1].duration
    sources[1] = source
}
// const promise = audioCtx.audioWorklet.addModule("worklet.js")

// Plan: compute 1600 samples at a time
// Send the samples to the main thread for rendering on the canvas.
// Send the samples out in 128-block chunks via AudioWorklet. (Awkward size, since 128 doesn't divide 1600.)
// Alternatively, do the thing with chaining AudioBufferSourceNodes, the way CPAL does it.

function mod(n: number, m: number) {
    return ((n % m) + m) % m;
}

let f = (t: number) => 0

const gen = (function* () {
    for (let t = 0;; t++) {
        if (t % 48000 === 0) console.log(t)
        yield mod(f(t) / 256, 1) * 2 - 1
    }
})()

const input = document.querySelector("input")!
input.onchange = e => {
    f = eval("t=>" + (e.target as HTMLInputElement).value)
    console.log("bang", f)
}

document.querySelector("button")!.onclick = () => {
    input.value = codeGen(generateExpression2(15))
    input.dispatchEvent(new Event("change"))
}

function generateExpression(depth: number, mustUseTime=false): any {
    const p = Math.random()
    if (depth === 0 || p < 0.1) {
        return generateAtom(mustUseTime)
    } else if (p < 0.2) {
        return generateUnaryExpression(depth, mustUseTime)
    } else if (p < 0.25) {
        return generateTernaryExpression(depth, mustUseTime)
    } else {
        return generateBinaryExpression(depth, mustUseTime)
    }
}

function generateAtom(mustUseTime=false) {
    const p = Math.random()
    const probT = 0.4
    if (mustUseTime || p < probT) {
        return { type: "IdentifierExpression", name: "t" }
    } else {
        // Larger numbers should be less likely. (Also, we skip 0.)
        return { type: "LiteralNumericExpression", value: Math.floor(Math.random() * ((1-probT)/(p-probT))) + 1 }
    }
}

function generateUnaryExpression(depth: number, mustUseTime=false) {
    return {
        type: "UnaryExpression",
        operator: "~",
        operand: generateExpression(depth-1, mustUseTime)
    }
}

function generateBinaryExpression(depth: number, mustUseTime=false) {
    const ops = ["<<",">>","+","-","*","/","%","|","&","^"]
    const operator = ops[Math.floor(Math.random() * ops.length)]
    const pos = Math.random() > 0.5
    return {
        type: "BinaryExpression",
        left: generateExpression(depth-1, mustUseTime && pos),
        operator,
        right: generateExpression(depth-1, mustUseTime && !pos),
    }
}

function generateTernaryExpression(depth: number, mustUseTime=false) {
    const ops = ["<","<=",">=",">","==","!="]
    const operator = ops[Math.floor(Math.random() * ops.length)]
    const pos = Math.floor(Math.random() * 4)
    return {
        type: "ConditionalExpression",
        test: {
            type: "BinaryExpression",
            left: generateExpression(depth-1, mustUseTime && (pos === 0)),
            operator,
            right: generateExpression(depth-1, mustUseTime && (pos === 1)),
        },
        consequent: generateExpression(depth-1, mustUseTime && (pos === 2)),
        alternate: generateExpression(depth-1, mustUseTime && (pos === 3)),
    }
}

function getDescendants(root: any) {
    const stack = [root]
    const descendants = []
    while (stack.length) {
        const node = stack.pop()
        descendants.push(node)
        for (const child of children(node)) {
            stack.push(child)
        }
    }
    return descendants
}

function growExpression(expr: any) {
    const nodes = getDescendants(expr)
    console.log("nodes", nodes)
    const dst = nodes[Math.floor(Math.random() * nodes.length)]
    const copy = JSON.parse(JSON.stringify(dst))
    console.log("chose", dst)
    if (Math.random() < 0.75) {
        const pos = Math.random() < 0.5
        const ops = ["<<",">>","+","-","*","/","%","|","&","^"]
        const operator = ops[Math.floor(Math.random() * ops.length)]
        replaceObject(dst, {
            type: "BinaryExpression",
            left: pos ? copy : generateAtom(),
            operator,
            right: pos ? generateAtom() : copy,
        })
    } else {
        replaceObject(dst, {
            type: "UnaryExpression",
            operator: "~",
            operand: copy,
        })
    }
}

function generateExpression2(n: number) {
    const expr = { type: "IdentifierExpression", name: "t" }
    for (let i = 0; i < n; i++) {
        growExpression(expr)
    }
    return expr
}
a = generateExpression(3, true)
console.log(codeGen(a))
growExpression(a)
console.log(codeGen(a))

async function start() {
    // const req = await fetch("tune.ogg")
    // const buffer = await req.arrayBuffer()
    // const decoded = (await audioCtx.decodeAudioData(buffer)).getChannelData(0)
    // gen = decoded[Symbol.iterator]()
    
    for (const buffer of buffers) {
        const data = buffer.getChannelData(0)
        for (let i = 0; i < data.length; i++) {
            data[i] = gen.next().value
        }
    }
    t = audioCtx.currentTime + 0.1
    sources[0].start(t)
    t += buffers[0].duration
    sources[1].start(t)
}

start()

export {}
