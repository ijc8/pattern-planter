const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d")
ctx.fillRect(0, 0, 10, 10)
ctx.imageSmoothingEnabled = false

const image = ctx.createImageData(40, 40)

const sampleRate = 48000

function isIterable(obj) {
    if (obj == null) {
      return false
    }
    return typeof obj[Symbol.iterator] === 'function'
}

class Stream {
    constructor(iterable) {
        this.iterable = iterable
    }

    [Symbol.iterator]() {
        return this.iterable[Symbol.iterator]()
    }
}

class FunctionStream extends Stream {
    constructor(fn) {
        super()
        this.fn = fn
    }

    [Symbol.iterator]() {
        return this.fn()
    }
}

function stream(generatorFunction) {
    return (...args) => new FunctionStream(() => generatorFunction(...args))
}

function maybeConst(x) {
    return isIterable(x) ? x : c(x)
}

const osc = stream(function* (freqs) {
    freqs = maybeConst(freqs)
    let phase = 0
    for (const freq of freqs) {
        yield Math.sin(phase)
        phase += 2*Math.PI*freq/sampleRate
    }
})

const add = stream(function* (a, b) {
    a = maybeConst(a)
    b = maybeConst(b)
    while (true) {
        yield a.next().value + b.next().value
    }
})

const cat = stream(function* (a, b) {
    yield* a
    yield* b
})

const zip = stream(function* (a, b) {
    a = a[Symbol.iterator]()
    b = b[Symbol.iterator]()
    for (const x of a) {
        const { value: y, done } = b.next()
        if (done) break
        yield [x, y]
    }
})

const mul = stream(function* (a, b) {
    a = maybeConst(a)
    b = maybeConst(b)
    for (const [x, y] of zip(a, b)) {
        yield x * y
    }
})

const c = stream(function* (x) {
    while (true) {
        yield x
    }
})

const rand = new Stream(function* () {
    while (true) {
        yield Math.random()*2-1
    }
}())

const take = stream(function* (a, n) {
    a = a[Symbol.iterator]()
    for (let i = 0; i < n; i++) {
        yield a.next().value
    }
})

// let gen = mul(add(osc(c(120.1)), mul(rand, c(0.1))), c(0.5))
let woo = osc(add(240, mul(osc(0.1), 120)))
// let gen = mul(add(woo, mul(rand, osc(0.05))), 0.5)

function s(t) { return t * sampleRate }

let comp = mul(rand, cat(take(osc(1), s(0.5)), take(osc(4), s(0.5))))
// let gen = osc(c(200))

let gen = comp[Symbol.iterator]()

function render(input) {
    const data = image.data
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
            let index = x + y*40
            v = Math.round((input[index] + 1) / 2 * 255)
            data[index*4 + 0] = v
            data[index*4 + 1] = v
            data[index*4 + 2] = v
            data[index*4 + 3] = 255
        }
    }
    ctx.putImageData(image, 0, 0)
}

// let prev = 0
// function loop(time) {
//     // console.log(time - prev)
//     prev = time
//     render()
//     requestAnimationFrame(loop)
// }

// requestAnimationFrame(loop)

const audioCtx = new AudioContext({ sampleRate })
console.log(audioCtx)

const buffers = [
    new AudioBuffer({ length: 1600, sampleRate }),
    new AudioBuffer({ length: 1600, sampleRate }),
]

for (const buffer of buffers) {
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
        data[i] = gen.next().value
    }
}

let t = audioCtx.currentTime + 0.5

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
sources[0].start(t)
t += buffers[0].duration

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
sources[1].start(t)
// const promise = audioCtx.audioWorklet.addModule("worklet.js")

// Plan: compute 1600 samples at a time
// Send the samples to the main thread for rendering on the canvas.
// Send the samples out in 128-block chunks via AudioWorklet. (Awkward size, since 128 doesn't divide 1600.)
// Alternatively, do the thing with chaining AudioBufferSourceNodes, the way CPAL does it.
