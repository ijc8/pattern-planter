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

document.querySelector("button")!.onclick = e => {
    input.value = generateExpression(5)
    input.dispatchEvent(new Event("change"))
}

function generateExpression(depth: number): string {
    const ops = ["<<",">>","+","-","*","/","%","|","&","^"]
    const op = ops[Math.floor(Math.random() * ops.length)]
    if (depth === 0) {
        if (Math.random() < 0.5) {
            return "t"
        } else {
            return "" + Math.floor(Math.random() * 256)
        }
    }
    return `(${generateExpression(depth-1)}${op}${generateExpression(depth-1)})`
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
