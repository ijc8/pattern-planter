import { codeGen } from "shift-codegen"
import { parseModule } from "shift-parser"
// import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm"
import * as d3 from "d3"

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
    // const expr = getExpression()
    // console.log(expr)
    // if (expr) {
        // drawTree(expr)
        const g = eval("t=>" + (e.target as HTMLInputElement).value)
        f = (t: number) => mod((g(t)|0) / 256, 1) * 2 - 1
    // }
}

function playTree(tree) {
    // input.value = convertTreeToProgram(tree)
    // input.dispatchEvent(new Event("change"))
    // evaluate(input.value)
    repl.editor.setCode(convertTreeToProgram(tree))
    repl.editor.evaluate()
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

function choice(array: any[]) {
    return array[Math.floor(Math.random() * array.length)]
}

function generateBinaryExpression(depth: number, mustUseTime=false) {
    const operator = choice(BINARY_OPS)
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
        for (const child of children(node).reverse()) {
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

let _update = null

function genAtom() {
    // return Math.random() < 0.4 ? "t" : generateConstant()
    return choice(Math.random() < 0.3 ? NOTE_ATOMS : SAMPLE_ATOMS)
}

const SAMPLE_ATOMS = ["bd", "sd", "hh"]
const NOTE_ATOMS = ["c", "eb", "g", "bb"]
const UNARY_FUNCS = ["degrade", "brak"]
const VARIADIC_FUNCS = ["stack", "chooseCycles", "seq", "cat"]

function setupTree() {
    // console.log(getDescendants(expr))
    // const treeData = convertTree(expr)
    const treeData = {
        name: " ",
        fill: "white",
        children: [{
            name: "bd",
            fill: "white"
        }],
    }
    
    // https://stackoverflow.com/questions/69975911/rotate-tree-diagram-on-d3-js-v5-from-horizental-to-vertical
    // Set the dimensions and margins of the diagram
    var margin = {top: 20, right: 90, bottom: 30, left: 90},
    width = 960 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;


    // if (_update !== null) {
    //     // declares a tree layout and assigns the size
    //     var treemap = d3.tree().size([height, width]);

    //     // Assigns parent, children, height, depth
    //     root = d3.hierarchy(treeData, function(d) { return d.children; });
    //     root.x0 = height / 2;
    //     root.y0 = 0;
    //     _update(root)
    //     return
    // }

    _update = update

    function clickTree(e) {
        console.log("clickTree", e)
        // updateExpressionWithRules(growRules)
    }

    function clickLink(e, d) {
        console.log("clickLink", e, d)
        // const expr = getExpression()
        // const nodes = getDescendants(expr)
        // console.log(nodes[d.data.pos])
        // replaceObject(nodes[d.data.pos], generateAtom(false))
        // input.value = codeGen(expr)
        // input.dispatchEvent(new Event("change"))
        // d.children = null
        // d.data.name = "!"
        const parent = d.parent
        const index = parent.children.indexOf(d)
        console.log("index", index)
        parent.children[index] = Object.assign(new Node, {
            parent,
            depth: parent.depth + 1,
            data: {
                name: genAtom(),
                fill: "white",
            }
        })
        update(d)
        e.stopPropagation()
        playTree(root)

    }

    function clickNode(e, d) {
        console.log("clickNode", e, d)
        if (UNARY_FUNCS.includes(d.data.name)) {
            console.log("can't grow this")
        } else if (VARIADIC_FUNCS.includes(d.data.name)) {
            d.children.push(Object.assign(new Node, {
                parent: d,
                depth: d.depth + 1,
                data: {
                    name: genAtom(),
                    fill: "white",
                }
            }))
        } else {
            // Atom; replace
            const parent = d.parent
            const index = parent.children.indexOf(d)
            const type = Math.random() < 0.25 ? "unary" : "variadic"
            const replacement = Object.assign(new Node, {
                parent,
                depth: d.depth,
                data: {
                    name: type === "unary" ? choice(UNARY_FUNCS) : choice(VARIADIC_FUNCS),
                    fill: "white",
                }
            })
            replacement.children = [Object.assign(new Node, {
                parent: replacement,
                depth: replacement.depth + 1,
                data: {
                    name: d.data.name,
                    fill: "white",
                }
            })]
            if (type === "variadic") {
                replacement.children.push(Object.assign(new Node, {
                    parent: replacement,
                    depth: replacement.depth + 1,
                    data: {
                        name: genAtom(),
                        fill: "white",
                    }
                }))
                if (Math.random() < 0.5) {
                    const tmp = replacement.children[0]
                    replacement.children[0] = replacement.children[1]
                    replacement.children[1] = tmp
                }
            }
            parent.children[index] = replacement
            // replaceObject(d, replacement)
        }
        update(d)
        e.stopPropagation()
        playTree(root)
    }
    
    // append the svg object to the body of the page
    // appends a 'group' element to 'svg'
    // moves the 'group' element to the top left margin
    var svg = d3.select("body").append("svg")
        .on("click", clickTree)
        .attr("width", width + margin.right + margin.left)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var i = 0, duration = 750, root;
    
    // declares a tree layout and assigns the size
    var treemap = d3.tree().size([height, width]);
    
    // Assigns parent, children, height, depth
    root = d3.hierarchy(treeData, function(d) { return d.children; });
    root.x0 = height / 2;
    root.y0 = 0;
    
    // Collapse after the second level
    // root.children.forEach(collapse);
    
    update(root);

    const Node = d3.hierarchy.prototype.constructor

    
    function update(source) {
        console.log("update", source, convertTreeToProgram(root))
        
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
        
        // Enter any new nodes at the parent's previous position.
        var nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr("transform", function(d) {
                // BEFORE ....
                //return "translate(" + source.y0 + "," + source.x0 + ")";
                // AFTER ....
                return "translate(" + source.x0 + "," + source.y0 + ")";
            })
            .on('click', clickNode);
        
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
            .data(links, d => d.id);
        
        // Enter any new links at the parent's previous position.
        var linkEnter = link.enter().insert('path', "g")
            .attr("class", "link")
            .on("click", clickLink)
            .attr("stroke", "black")
            .attr("stroke-width", 3)
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
            const path = `M ${s.x + (rectWidth / 2)} ${s.y}
                C ${(s.x + d.x) / 2 + (rectWidth / 2)} ${s.y},
                ${(s.x + d.x) / 2 + (rectWidth / 2)} ${d.y},
                ${d.x + (rectWidth / 2)} ${d.y}`
            
            return path
        }
    }
}

function convertTreeToProgram(tree) {
    return convertTreeToExpression(tree)
//     return `
// samples('github:felixroos/samples')
// samples('https://strudel.cc/tidal-drum-machines.json', 'github:ritchse/tidal-drum-machines/main/machines/')

// ${convertTreeToExpression(tree)}
// `
}

function convertTreeToExpression(tree) {
    console.log("???", tree, tree.data.name, tree.children?.length)
    if (tree.data.name === " ") { // HACK: Special case for root...
        return convertTreeToExpression(tree.children[0])
    } else if (SAMPLE_ATOMS.includes(tree.data.name)) {
        return `s("${tree.data.name}")`
    } else if (NOTE_ATOMS.includes(tree.data.name)) {
        return `note("${tree.data.name}").s("piano")`
    } else {
        const args = tree.children.map(convertTreeToExpression).join(",")
        return `${tree.data.name}(${args})`
    }
}

setupTree()

// initStrudel({
//     // prebake: () => samples('github:tidalcycles/dirt-samples'),
//     prebake: () => registerSoundfonts(),
// })

const repl = document.createElement('strudel-editor');
repl.setAttribute('code', `...`);
document.getElementById('strudel').append(repl);
console.log(repl.editor);
