import * as d3 from "d3"

const SAMPLE_ATOMS = ["ocarina_small_stacc", "guiro", "psaltery_pluck", "sleighbells", "folkharp", "didgeridoo", "insect", "insect:2", "wind", "crow", "east", "~"]
const NOTE_ATOMS = ["c2", "eb2", "g2", "bb2", "c3", "eb3", "g3", "bb3", "c", "eb", "g", "bb"]
const UNARY_FUNCS = ["degrade", "brak", "rev"]
const VARIADIC_FUNCS = ["stack", "chooseCycles", "seq", "cat"]

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

const NUM_TREES = 8
const sources = [...new Array(NUM_TREES)].map(() => "silence")

function choice(array: any[]) {
    return array[Math.floor(Math.random() * array.length)]
}

function genAtom() {
    return choice(Math.random() < 0.3 ? NOTE_ATOMS : SAMPLE_ATOMS)
}

interface Point {
    x: number
    y: number
}

interface Node {
    name: string
    fill: string
}

interface Tree extends Node {
    children?: Tree[]
}

interface PointNode extends Node {
    x0: number
    y0: number
}

function setupTree() {
    const treeData: Tree = {
        name: " ",
        fill: "white",
        children: [{
            name: "~",
            fill: "white"
        }],
    }

    // Lots of code here to try to correctly animate tree growth and decay, originally based on some d3 example code.
    // Unfortunately it is a) gross and b) kind of broken. On the other hand, I got something working in time for the gig. :-)

    // https://stackoverflow.com/questions/69975911/rotate-tree-diagram-on-d3-js-v5-from-horizental-to-vertical
    // Set the dimensions and margins of the diagram
    const margin = {top: 20, right: 90, bottom: 30, left: 90},
        width = 1920 - margin.left - margin.right,
        height = 800 - margin.top - margin.bottom
    const _svg = d3.select("#planter").append("svg")
        .attr("width", width + margin.right + margin.left)
        .attr("height", height + margin.top + margin.bottom)

    for (let treeIndex = 0; treeIndex < NUM_TREES; treeIndex++) {

        function clickTree(e: any) {
            console.log("clickTree", e)
        }

        function clickLink(e: Event, d: d3.HierarchyPointNode<PointNode>) {
            console.log("clickLink", e, d)
            const parent = d.parent!
            const index = parent.children!.indexOf(d)
            console.log("index", index)
            const newNode = Object.assign(new Node, {
                parent,
                depth: parent.depth + 1,
                data: {
                    name: genAtom(),
                    fill: "white",
                    x0: parent.x,
                    y0: parent.y,
                }
            })
            parent.children![index] = newNode
            update(parent)  // Use parent as source so removed subtree collapses to it
            e.stopPropagation()
            playTree(root, treeIndex)

        }

        function clickNode(e: Event, d: d3.HierarchyPointNode<PointNode>) {
            console.log("clickNode", e, d)
            // Prevent watering the root node
            if (d.data.name === " ") {
                return
            }
            if (UNARY_FUNCS.includes(d.data.name)) {
                console.log("can't grow this")
            } else if (VARIADIC_FUNCS.includes(d.data.name)) {
                d.children!.push(Object.assign(new Node, {
                    parent: d,
                    depth: d.depth + 1,
                    data: {
                        name: genAtom(),
                        fill: "white",
                        x0: d.x,
                        y0: d.y,
                    }
                }))
            } else {
                // Atom; transform in place
                const type = Math.random() < 0.25 ? "unary" : "variadic"
                const oldName = d.data.name
                // Update the node's name in place
                d.data.name = type === "unary" ? choice(UNARY_FUNCS) : choice(VARIADIC_FUNCS)
                // Create children for this node
                d.children = [Object.assign(new Node, {
                    parent: d,
                    depth: d.depth + 1,
                    data: {
                        name: oldName,
                        fill: "white",
                        x0: d.x,
                        y0: d.y,
                    }
                })]
                if (type === "variadic") {
                    d.children.push(Object.assign(new Node, {
                        parent: d,
                        depth: d.depth + 1,
                        data: {
                            name: genAtom(),
                            fill: "white",
                            x0: d.x,
                            y0: d.y,
                        }
                    }))
                    if (Math.random() < 0.5) {
                        const tmp = d.children[0]
                        d.children[0] = d.children[1]
                        d.children[1] = tmp
                    }
                }
            }
            update(d)  // Use clicked node as source so new children enter from it
            e.stopPropagation()
            playTree(root, treeIndex)
        }
        
        // append the svg object to the body of the page
        // appends a 'group' element to 'svg'
        // moves the 'group' element to the top left margin
        const svg = _svg
            .append("g")
            .on("click", clickTree)
            .attr("transform", "translate(" + (margin.left + treeIndex * (width / NUM_TREES)) + "," + (height - margin.top) + ")")

        let i = 0, duration = 2000
        
        // declares a tree layout and assigns the size
        let treemap = d3.tree().size([width / NUM_TREES, height])
        
        // Assigns parent, children, height, depth
        const root = d3.hierarchy<PointNode>(JSON.parse(JSON.stringify(treeData)) as PointNode, d => (d as Tree).children as PointNode[])
        root.data.x0 = height / 2
        root.data.y0 = 0
        
        update(root)

        const Node = d3.hierarchy.prototype.constructor
        
        function update(source: d3.HierarchyNode<PointNode>) {
            // Assigns the x and y position for the nodes
            // Always calculate layout with root for correctness
            const treeLayout: d3.HierarchyPointNode<PointNode> = treemap(root as any) as any

            // Compute the new tree layout.
            var nodes = treeLayout.descendants(),
            links = treeLayout.descendants().slice(1)

            // Normalize for fixed-depth.
            nodes.forEach(d => { d.y = d.depth * 50 })

            // Find the node in the new layout that corresponds to source (for animations)
            // This is needed because treemap creates new node objects
            // Fall back to treeLayout (new layout root) if source node not found
            const sourceNode = nodes.find(node => node.data === source.data) || treeLayout 
            
            // Update the nodes...
            const node = svg.selectAll('g.node')
                .data(nodes, (d: any) => (d.id || (d.id = ++i)))
            
            // Enter any new nodes at the parent's previous position.
            const nodeEnter = node.enter().append('g')
                .attr('class', 'node')
                .attr("transform", (d: d3.HierarchyPointNode<PointNode>) => {
                    const parent = d.parent;
                    if (parent && parent.data.x0 !== undefined) {
                        return "translate(" + parent.data.x0 + "," + -parent.data.y0 + ")";
                    }
                    return "translate(" + sourceNode.data.x0 + "," + -sourceNode.data.y0 + ")";
                })
                .on('click', clickNode)
            
            // var rectHeight = 60, rectWidth = 120
            const rectHeight = 20, rectWidth = 20
            
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
                .attr("dy", ".35em")
                .attr("x", rectWidth / 2)
                .attr("text-anchor", "middle")
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
                .data(links, (d: any) => d.id)
            
            // Enter any new links at the parent's previous position.
            const linkEnter = link.enter().insert('path', "g")
                .attr("class", "link")
                .on("click", clickLink)
                .attr("stroke", "black")
                .attr("stroke-width", 3)
                .attr('d', (d: d3.HierarchyPointNode<PointNode>) => {
                    const parent = d.parent!;
                    const o = { x: parent.data.x0, y: parent.data.y0 }
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

function convertTreeToExpression(tree: d3.HierarchyNode<PointNode>): string {
    if (tree.data.name === " ") { // HACK: Special case for root
        return convertTreeToExpression(tree.children![0])
    } else if (SAMPLE_ATOMS.includes(tree.data.name)) {
        return `s("${tree.data.name}")`
    } else if (NOTE_ATOMS.includes(tree.data.name)) {
        return `note("${tree.data.name}").s("piano")`
    } else {
        const args = tree.children!.map(convertTreeToExpression).join(",")
        return `${tree.data.name}(${args})`
    }
}

function playTree(tree: d3.HierarchyNode<PointNode>, treeIndex: number) {
    sources[treeIndex] = convertTreeToExpression(tree)
    const panned = sources.map((s, i) => `${s}.pan(${i / (NUM_TREES - 1)})`)
    const program = `// salut wac :-)\nstack(${panned.join(",")})`
    repl.editor.setCode(program)
    repl.editor.evaluate()
}

setupTree()

// Filter out silence marker
const samplesToLoad = SAMPLE_ATOMS.filter(s => s !== "~")
console.log(`Preloading ${samplesToLoad.length + 1} samples...`)

// Build a Strudel pattern that includes all samples we want to preload
// Using gain(0) to trigger loading without playing audio
const samplePatterns = samplesToLoad.map(sample => `s("${sample}")`)
// Add piano sample
const allPatterns = [...samplePatterns, `note("c").s("piano")`]
const preloadCode = `// evaluate me first!\nstack(${allPatterns.join(',')}).gain(0)`

console.log('Preload code:', preloadCode)

const repl = document.createElement('strudel-editor') as any
repl.setAttribute('code', preloadCode)
document.getElementById('strudel')!.append(repl)

console.log(repl.editor)
