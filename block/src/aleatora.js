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
    a = maybeConst(a)[Symbol.iterator]()
    b = maybeConst(b)[Symbol.iterator]()
    while (true) {
        yield a.next().value + b.next().value
    }
})

const cat = stream(function* (a, b) {
    yield* a
    yield* b
})

const cycle = stream(function* (s) {
    while (true) {
        yield* s
    }
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

const map = stream(function* (s, f) {
    for (const x of s) {
        yield f(x)
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

const count = stream(function* (i = 0) {
    while (true) {
        yield i++
    }
})

function s(t) { return t * sampleRate }


// let gen = mul(add(osc(c(120.1)), mul(rand, c(0.1))), c(0.5))
// let woo = osc(add(240, mul(osc(0.1), 120)))
// let comp = mul(add(woo, mul(rand, osc(0.05))), 0.5)
// let comp = mul(rand, cycle(cat(cat(take(osc(1), s(0.5)), take(osc(4), s(0.5))), take(c(0), s(0.5)))))
// let comp = map(map(count(), t => t / 48000), t => ((t%(1/30))>(1/60))*2-1)
// let comp = map(count(), t => mod(f(t) / 256, 1) * 2 - 1)
// let comp = map(count(), t => (f(t) / 256) % 1 * 2 - 1)
// let gen = comp[Symbol.iterator]()
