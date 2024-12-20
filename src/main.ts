import { codeGen } from "shift-codegen"
import { parseModule } from "shift-parser"
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"

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
    const expr = getExpression()
    console.log(expr)
    if (expr) {
        drawTree(expr)
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
    const testValues = [13, 24, 32, 48001]
    let oldOutputs = testValues.map(_ => 0)
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
        
        // Let's see how interesting this expression is.
        const outputs = testValues.map(f)
        if (outputs.every(x => x === outputs[0])) {
            console.log("Inaudible, skipping.")
        } else if (outputs.every((x, i) => x === oldOutputs[i])) {
            console.log("Same as last function, skipping.")
        } else {
            await sleep(400 + Math.random() * 1500)
        }
        oldOutputs = outputs
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


function convertTree(expr) {
    let out = {}
    if (expr.type === "BinaryExpression") {
        out = {
            name: expr.operator,
            children: [expr.left, expr.right].map(convertTree),
        }
    } else if (expr.type === "UnaryExpression") {
        out = {
            name: expr.operator,
            children: [convertTree(expr.operand)],
        }
    } else if (expr.type === "LiteralNumericExpression") {
        out = {
            name: expr.value,
            children: [],
        }
    } else if (expr.type === "IdentifierExpression") {
        out = { name: expr.name }
    }
    Object.assign(out, {
        subname: "",
        fill: "white",
    })
    return out
}


function drawTree(expr) {
    const treeData = convertTree(expr)
    
    // https://stackoverflow.com/questions/69975911/rotate-tree-diagram-on-d3-js-v5-from-horizental-to-vertical
    // Set the dimensions and margins of the diagram
    var margin = {top: 20, right: 90, bottom: 30, left: 90},
    width = 960 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;
    
    // append the svg object to the body of the page
    // appends a 'group' element to 'svg'
    // moves the 'group' element to the top left margin
    var svg = d3.select("body").append("svg")
    .attr("width", width + margin.right + margin.left)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate("
        + margin.left + "," + margin.top + ")");
        
        var i = 0,
        duration = 750,
        root;
        
        // declares a tree layout and assigns the size
        var treemap = d3.tree().size([height, width]);
        
        // Assigns parent, children, height, depth
        root = d3.hierarchy(treeData, function(d) { return d.children; });
        root.x0 = height / 2;
        root.y0 = 0;
        
        // Collapse after the second level
        // root.children.forEach(collapse);
        
        update(root);
        
        // Collapse the node and all it's children
        function collapse(d) {
            if(d.children) {
                d._children = d.children
                d._children.forEach(collapse)
                d.children = null
            }
        }
        
        function update(source) {
            
            // Assigns the x and y position for the nodes
            var treeData = treemap(root);
            
            // Compute the new tree layout.
            var nodes = treeData.descendants(),
            links = treeData.descendants().slice(1);
            
            // Normalize for fixed-depth.
            nodes.forEach(function(d){ d.y = d.depth * 30}); 
            
            // ****************** Nodes section ***************************
            
            // Update the nodes...
            var node = svg.selectAll('g.node')
            .data(nodes, function(d) {return d.id || (d.id = ++i); });
            
            // Enter any new modes at the parent's previous position.
            var nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr("transform", function(d) {
                // BEFORE ....
                //return "translate(" + source.y0 + "," + source.x0 + ")";
                // AFTER ....
                return "translate(" + source.x0 + "," + source.y0 + ")";
            })
            .on('click', click);
            
            // var rectHeight = 60, rectWidth = 120;
            const rectHeight = 20, rectWidth = 20
            
            nodeEnter.append('rect')
            .attr('class', 'node')
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("x", 0)
            .attr("y", (rectHeight/2)*-1)
            .attr("rx","5")
            .style("fill", function(d) {
                return d.data.fill;
            })
            .style("stroke", "black");
            
            // Add labels for the nodes
            nodeEnter.append('text')
            .attr("class", "node-text")
            .attr("dy", ".35em")
            .attr("x", function(d) {
                return rectWidth / 2;
            })
            .attr("text-anchor", function(d) {
                return "middle";
            })
            .text(function(d) { return d.data.name; })
            .append("tspan")
            .attr("dy", "1.75em")
            .attr("x", function(d) {
                return 13;
            })
            .text(function(d) { return d.data.subname; });
            
            // UPDATE
            var nodeUpdate = nodeEnter.merge(node);
            
            // Transition to the proper position for the node
            nodeUpdate.transition()
            .duration(duration)
            .attr("transform", function(d) { 
                // BEFORE ....
                //return "translate(" + d.y + "," + d.x + ")";
                // AFTER ....
                return "translate(" + d.x + "," + d.y + ")";
            });
            
            // Update the node attributes and style
            nodeUpdate.select('circle.node')
            .attr('r', 10)
            .style("fill", function(d) {
                return d._children ? "lightsteelblue" : "#fff";
            })
            .attr('cursor', 'pointer');
            
            
            // Remove any exiting nodes
            var nodeExit = node.exit().transition()
            .duration(duration)
            .attr("transform", function(d) {
                // BEFORE ....
                //return "translate(" + source.y + "," + source.x + ")";
                // AFTER ....
                return "translate(" + source.x + "," + source.y + ")";
            })
            .remove();
            
            // On exit reduce the node circles size to 0
            nodeExit.select('circle')
            .attr('r', 1e-6);
            
            // On exit reduce the opacity of text labels
            nodeExit.select('text')
            .style('fill-opacity', 1e-6);
            
            // ****************** links section ***************************
            
            // Update the links...
            var link = svg.selectAll('path.link')
            .data(links, function(d) { return d.id; });
            
            // Enter any new links at the parent's previous position.
            var linkEnter = link.enter().insert('path', "g")
            .attr("class", "link")
            .attr('d', function(d){
                var o = {x: source.x0, y: source.y0}
                return diagonal(o, o)
            });
            
            // UPDATE
            var linkUpdate = linkEnter.merge(link);
            
            // Transition back to the parent element position
            linkUpdate.transition()
            .duration(duration)
            .attr('d', function(d){ return diagonal(d, d.parent) });
            
            // Remove any exiting links
            var linkExit = link.exit().transition()
            .duration(duration)
            .attr('d', function(d) {
                var o = {x: source.x, y: source.y}
                return diagonal(o, o)
            })
            .remove();
            
            // Store the old positions for transition.
            nodes.forEach(function(d){
                d.x0 = d.x;
                d.y0 = d.y;
            });
            
            // Creates a curved (diagonal) path from parent to the child nodes
            function diagonal(s, d) {
                
                // BEFORE ....
                //path = `M ${s.y} ${s.x}
                //        C ${(s.y + d.y) / 2} ${s.x},
                //          ${(s.y + d.y) / 2} ${d.x},
                //          ${d.y} ${d.x}`
                
                // AFTER ....
                const path = `M ${s.x + (rectWidth / 2)} ${s.y}
            C ${(s.x + d.x) / 2 + (rectWidth / 2)} ${s.y},
              ${(s.x + d.x) / 2 + (rectWidth / 2)} ${d.y},
              ${d.x + (rectWidth / 2)} ${d.y}`
                
                return path
            }
            
            // Toggle children on click.
            function click(d) {
                if (d.children) {
                    d._children = d.children;
                    d.children = null;
                } else {
                    d.children = d._children;
                    d._children = null;
                }
                update(d);
            }
        }
    }
