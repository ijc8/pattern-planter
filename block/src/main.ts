import { codeGen } from "shift-codegen"


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
        yield mod(f(t) / 256, 1) * 2 - 1
    }
})()

const input = document.querySelector("input")!
input.onchange = e => {
    f = eval("t=>" + (e.target as HTMLInputElement).value)
    console.log("bang", f)
}

document.querySelector("button")!.onclick = () => {
    input.value = codeGen(generateExpression(4, true))
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
