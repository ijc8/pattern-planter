import { codeGen } from "shift-codegen"
import { parseModule } from "shift-parser";

function weightedChoice<T extends { weight: number }>(choices: T[]) {
    const totalWeight = choices.reduce((acc, choice) => acc + choice.weight, 0)
    let p = Math.random()
    for (const choice of choices) {
        const prob = choice.weight / totalWeight
        if (p < prob) return choice
        p -= prob
    }
    return undefined
}

function seemsAudible(f: (t: number) => number) {
    const testValues = [13, 24, 48001, 1234567]
    const outputs = testValues.map(f)
    return outputs.some(x => x != outputs[0])
}

function children(node: any) {
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

function replaceObject(target: any, source: any) {
    for (const prop of Object.getOwnPropertyNames(target)) {
        delete target[prop]
    }
    Object.assign(target, source)
}

const canvas = document.querySelector("canvas")!
const ctx = canvas.getContext("2d")!
ctx.fillRect(0, 0, 40, 40)
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

const buffers = [
    new AudioBuffer({ length: 1600, sampleRate }),
    new AudioBuffer({ length: 1600, sampleRate }),
]

let schedTime = 0

const sources = [
    new AudioBufferSourceNode(audioCtx, { buffer: buffers[0] }),
    new AudioBufferSourceNode(audioCtx, { buffer: buffers[1] }),
]

sources[0].connect(audioCtx.destination)
sources[0].onended = () => {
    const data = buffers[0].getChannelData(0)
    for (let i = 0; i < data.length; i++) {
        data[i] = next()
    }
    render(data)
    const source = new AudioBufferSourceNode(audioCtx, { buffer: buffers[0] })
    source.connect(audioCtx.destination)
    source.onended = sources[0].onended
    source.start(schedTime)
    schedTime += buffers[0].duration
    sources[0] = source
}

sources[1].connect(audioCtx.destination)
sources[1].onended = () => {
    const data = buffers[1].getChannelData(0)
    for (let i = 0; i < data.length; i++) {
        data[i] = next()
    }
    render(data)
    const source = new AudioBufferSourceNode(audioCtx, { buffer: buffers[1] })
    source.connect(audioCtx.destination)
    source.onended = sources[1].onended
    source.start(schedTime)
    schedTime += buffers[1].duration
    sources[1] = source
}

function mod(n: number, m: number) {
    return ((n % m) + m) % m;
}

let f = (_: number) => -1
let t = 0
function next() {
    return f(t++)
}

const input = document.querySelector("input")!
input.onchange = e => {
    if (getExpression()) {
        const g = eval("t=>" + (e.target as HTMLInputElement).value)
        f = (t: number) => mod((g(t)|0) / 256, 1) * 2 - 1
    }
}

const resetButton = document.querySelector<HTMLButtonElement>("#reset")!
resetButton.onclick = () => {
    input.value = "t"
    input.dispatchEvent(new Event("change"))
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

let autoPromise: Promise<void> | true | null
const autoButton = document.querySelector<HTMLButtonElement>("#auto")!
autoButton.onclick = () => {
    if (!autoPromise) {
        autoButton.classList.add("clicked")
        autoPromise = true
        autoPromise = runAuto()
    } else {
        autoButton.classList.remove("clicked")
        autoPromise = null
    }
}

async function runAuto() {
    if (input.value === "0" || !getExpression(false)) {
        resetButton.click()
    }
    while (autoPromise) {
        const choices = [{ button: growButton, weight: 0.5 }]
        if (input.value !== "t") {
            choices.push({ button: changeButton, weight: 0.4 })
            choices.push({ button: resetButton, weight: 0.01 })
            if (input.value.includes("t")) {
                choices.push({ button: shrinkButton, weight: 0.09 })
            }
        }
        const button = weightedChoice(choices)!.button
        button.click()
        button.classList.add("clicked")
        await sleep(50)
        button.classList.remove("clicked")
        if (seemsAudible(f)) {
            await sleep(400 + Math.random() * 1500)
        }
    }
}

function getExpression(warn=true) {
    let mod
    try {
        mod = parseModule(input.value)
    } catch {}
    if (!mod || mod.items.length !== 1 || mod.items[0].type !== "ExpressionStatement") {
        if (warn) alert("Please enter a valid expression.")
        return null
    }
    return mod.items[0].expression
}

function updateExpressionWithRules(rules: Rule[]) {
    const expr = getExpression()
    if (!expr) return
    applyRandomRule(expr, rules)
    input.value = codeGen(expr)
    input.dispatchEvent(new Event("change"))
}

const growButton = document.querySelector<HTMLButtonElement>("#grow")!
growButton.onclick = () => {
    updateExpressionWithRules(growRules)
}

const shrinkButton = document.querySelector<HTMLButtonElement>("#shrink")!
shrinkButton.onclick = () => {
    updateExpressionWithRules(shrinkRules)
}

const changeButton = document.querySelector<HTMLButtonElement>("#change")!
changeButton.onclick = () => {
    updateExpressionWithRules(changeRules)
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

function generateConstant() {
    // Larger numbers should be less likely. (Also, we skip 0.)
    return Math.floor(Math.random() * (1/Math.random())) + 1
}

function generateAtom(mustUseTime=false) {
    const p = Math.random()
    const probT = 0.4
    if (mustUseTime || p < probT) {
        return { type: "IdentifierExpression", name: "t" }
    } else {
        return { type: "LiteralNumericExpression", value: generateConstant() }
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

interface Rule {
    name: string
    type?: string
    apply: (node: any) => any
    weight: number
}

const BINARY_OPS = ["<<",">>","+","-","*","/","%","|","&","^"]

const growRules = [{
    // expr -> `expr <op> atom` or `atom <op> expr`
    name: "growBinaryOp",
    apply(node: any) {
        const pos = Math.random() < 0.5
        const operator = BINARY_OPS[Math.floor(Math.random() * BINARY_OPS.length)]
        return {
            type: "BinaryExpression",
            left: pos ? node : generateAtom(),
            operator,
            right: pos ? generateAtom() : node,
        }
    },
    weight: 3,
}, {
    // x -> ~x
    name: "growUnaryOp",
    apply: (node: any) => ({
        type: "UnaryExpression",
        operator: "~",
        operand: node,
    }),
    weight: 1,
}]

function applyRandomRule(expr: any, rules: Rule[]) {
    // Get all nodes to which at least one rule applies.
    const nodes = getDescendants(expr).filter(node => rules.some(
        rule => !rule.type || rule.type === node.type
    ))
    // Randomly select node.
    if (nodes.length === 0) {
        console.log("No matching nodes!")
        return
    }
    const dst = nodes[Math.floor(Math.random() * nodes.length)]
    const copy = JSON.parse(JSON.stringify(dst))
    // Randomly select applicable rule using weights.
    const applicable = rules.filter(rule => !rule.type || rule.type === dst.type)
    const rule = weightedChoice(applicable)!
    // Apply selected rule.
    console.log("Applying rule:", rule.name)
    replaceObject(dst, rule.apply(copy))
}

const shrinkRules = [{
    // x <op> y -> `x` or `y`
    // NOTE: Currently this applies anywhere in the tree, so it could lop off most of the expression
    // in one step. Might be better if it only applies to BinaryExpressions containing a leaf node.
    name: "shrinkBinaryOp",
    type: "BinaryExpression",
    apply: (node: any) => Math.random() < 0.5 ? node.left : node.right,
    weight: 1,
}, {
    // ~x -> x
    name: "shrinkUnaryOp",
    type: "UnaryExpression",
    apply: (node: any) => node.operand,
    weight: 1,
}]

const changeRules = [{
    // x <op> y -> x <different op> y
    name: "switchBinaryOp",
    type: "BinaryExpression",
    apply: (node: any) => ({
        ...node,
        operator: BINARY_OPS.filter(op => op !== node.operator)[Math.floor(Math.random() * (BINARY_OPS.length - 1))]
    }),
    weight: 2,
}, {
    // x <op> y -> y <op> x
    // NOTE: Currently this also applies to commutative operators: +, *, &, |, ^. Would be nice to exclude those.
    name: "swapBinaryOp",
    type: "BinaryExpression",
    apply: (node: any) => ({
        ...node,
        left: node.right,
        right: node.left,
    }),
    weight: 1,
}, {
    // t -> <constant>
    name: "variableToConstant",
    type: "IdentifierExpression",
    apply: () => ({
        type: "LiteralNumericExpression",
        value: generateConstant(),
    }),
    weight: 1,
}, {
    // <constant> -> t
    name: "constantToVariable",
    type: "LiteralNumericExpression",
    apply: () => ({
        type: "IdentifierExpression",
        name: "t",
    }),
    weight: 1,
}, {
    // <constant> -> <constant>
    name: "switchConstant",
    type: "LiteralNumericExpression",
    apply: () => ({
        type: "LiteralNumericExpression",
        value: generateConstant(),
    }),
    weight: 1,
}]

async function start() {
   
    for (const buffer of buffers) {
        const data = buffer.getChannelData(0)
        for (let i = 0; i < data.length; i++) {
            data[i] = next()
        }
    }
    schedTime = audioCtx.currentTime + 0.1
    sources[0].start(schedTime)
    schedTime += buffers[0].duration
    sources[1].start(schedTime)
}

function resumeContextOnInteraction(audioContext: AudioContext) {
    // from https://github.com/captbaritone/winamp2-js/blob/a5a76f554c369637431fe809d16f3f7e06a21969/js/media/index.js#L8-L27
    if (audioContext.state === "suspended") {
        const resume = async () => {
            await audioContext.resume()
            if (audioContext.state === "running") {
                document.body.removeEventListener("touchend", resume, false)
                document.body.removeEventListener("click", resume, false)
                document.body.removeEventListener("keydown", resume, false)
                start()
            }
        }
        document.body.addEventListener("touchend", resume, false)
        document.body.addEventListener("click", resume, false)
        document.body.addEventListener("keydown", resume, false)
    } else {
        start()
    }
}

resumeContextOnInteraction(audioCtx)
