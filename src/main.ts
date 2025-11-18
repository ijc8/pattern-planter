import * as d3 from "d3"

const SAMPLE_ATOMS = ["ocarina_small_stacc", "guiro", "psaltery_pluck", "sleighbells", "folkharp", "didgeridoo", "insect", "insect:2", "wind", "crow", "east", "~"]
const NOTE_ATOMS = ["c2", "eb2", "g2", "bb2", "c3", "eb3", "g3", "bb3", "c", "eb", "g", "bb"]
const UNARY_FUNCS = ["degrade", "brak", "rev"]
const VARIADIC_FUNCS = ["stack", "chooseCycles", "seq", "cat"]

const NUM_TREES = 8
const sources = [...new Array(NUM_TREES)].map(() => "silence")

// Watering constants
const WATER_THRESHOLD = 100  // Amount of water needed to grow a node
const DROPLET_SPAWN_RATE = 3  // Droplets per frame when holding mouse
const DROPLET_GRAVITY = 0.5  // Downward acceleration
const DROPLET_SIZE = 3  // Radius of water droplets

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

interface WaterDroplet {
    x: number
    y: number
    vx: number  // Velocity x
    vy: number  // Velocity y
    id: number
}

interface Node {
    name: string
    fill: string
    water?: number  // Accumulated water level (0 to WATER_THRESHOLD)
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
        water: 0,
        children: [{
            name: "~",
            fill: "white",
            water: 0
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
            parent.children![index] = Object.assign(new Node, {
                parent,
                depth: parent.depth + 1,
                data: {
                    name: genAtom(),
                    fill: "white",
                    water: 0,
                }
            })
            update(d)
            e.stopPropagation()
            playTree(root, treeIndex)

        }

        // Growth logic triggered by watering
        function growNode(d: d3.HierarchyPointNode<PointNode>) {
            if (UNARY_FUNCS.includes(d.data.name)) {
                console.log("can't grow this")
                return
            } else if (VARIADIC_FUNCS.includes(d.data.name)) {
                d.children!.push(Object.assign(new Node, {
                    parent: d,
                    depth: d.depth + 1,
                    data: {
                        name: genAtom(),
                        fill: "white",
                        water: 0,
                    }
                }))
            } else {
                // Atom; replace
                const parent = d.parent!
                const index = parent.children!.indexOf(d)
                const type = Math.random() < 0.25 ? "unary" : "variadic"
                const replacement = Object.assign(new Node, {
                    parent,
                    depth: d.depth,
                    data: {
                        name: type === "unary" ? choice(UNARY_FUNCS) : choice(VARIADIC_FUNCS),
                        fill: "white",
                        water: 0,
                    }
                })
                replacement.children = [Object.assign(new Node, {
                    parent: replacement,
                    depth: replacement.depth + 1,
                    data: {
                        name: d.data.name,
                        fill: "white",
                        water: 0,
                    }
                })]
                if (type === "variadic") {
                    replacement.children.push(Object.assign(new Node, {
                        parent: replacement,
                        depth: replacement.depth + 1,
                        data: {
                            name: genAtom(),
                            fill: "white",
                            water: 0,
                        }
                    }))
                    if (Math.random() < 0.5) {
                        const tmp = replacement.children[0]
                        replacement.children[0] = replacement.children[1]
                        replacement.children[1] = tmp
                    }
                }
                parent.children![index] = replacement
            }
            // Reset water level after growing
            d.data.water = 0
            update(d)
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
        const root = d3.hierarchy<PointNode>(treeData as PointNode, d => (d as Tree).children as PointNode[])
        root.data.x0 = height / 2
        root.data.y0 = 0

        const Node = d3.hierarchy.prototype.constructor

        function update(source: d3.HierarchyNode<PointNode>) {           
            // Assigns the x and y position for the nodes
            const treeLayout: d3.HierarchyPointNode<PointNode> = treemap(source as any) as any

            // Compute the new tree layout.
            var nodes = treeLayout.descendants(),
            links = treeLayout.descendants().slice(1)
            
            // Normalize for fixed-depth.
            nodes.forEach(d => { d.y = d.depth * 50 }) 
            
            // Update the nodes...
            const node = svg.selectAll('g.node')
                .data(nodes, (d: any) => (d.id || (d.id = ++i)))
            
            // Enter any new nodes at the parent's previous position.
            const nodeEnter = node.enter().append('g')
                .attr('class', 'node')
                .attr("transform", "translate(" + source.data.x0 + "," + -source.data.y0 + ")")
            
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
                .text((d: d3.HierarchyPointNode<any>) => d.data.name)
            
            // UPDATE
            const nodeUpdate = nodeEnter.merge(node as any)
            
            // Transition to the proper position for the node
            nodeUpdate.transition()
                .duration(duration)
                .attr("transform", d => "translate(" + d.x + "," + -d.y + ")")
            
            // Update the node attributes and style
            nodeUpdate.select('circle.node')
                .attr('r', 10)
                .style("fill", d => d.children ? "lightsteelblue" : "#fff")
                .attr('cursor', 'pointer')
            
            
            // Remove any exiting nodes
            const nodeExit = node.exit().transition()
                .duration(duration)
                .attr("transform", "translate(" + source.x + "," + -source.y! + ")")
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
                .attr('d', () => {
                    const o = { x: source.data.x0, y: source.data.y0 }
                    return diagonal(o, o)
                })
            
            // UPDATE
            const linkUpdate = linkEnter.merge(link as any)
            
            // Transition back to the parent element position
            linkUpdate.transition()
                .duration(duration)
                .attr('d', function(d){ return diagonal(d, d.parent!) })
            
            // Remove any exiting links
            link.exit().transition()
                .duration(duration)
                .attr('d', () => {
                    const o = { x: source.x!, y: source.y! }
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

        // Initialize tree and store references for watering system
        update(root)
        allTrees.push({
            root,
            treeIndex,
            svg,
            growNode,
            update,
            playTree: (r, idx) => playTree(r, idx)
        })
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
    const program = `// greetings from atlanta (data dancers)\nstack(${panned.join(",")})`
    repl.editor.setCode(program)
    repl.editor.evaluate()
}

// Store all tree data for watering system
const allTrees: Array<{root: d3.HierarchyNode<PointNode>, treeIndex: number, svg: any, growNode: (d: any) => void, update: (d: any) => void, playTree: (root: any, index: number) => void}> = []

setupTree()

// Watering system
let droplets: WaterDroplet[] = []
let nextDropletId = 0
let isWatering = false
let mouseX = 0
let mouseY = 0

// Get the main SVG element
const mainSvg = d3.select("#planter svg")

// Create a group for water droplets
const dropletsGroup = mainSvg.append("g").attr("class", "droplets")

// Mouse event handlers
mainSvg.on("mousedown", (event: MouseEvent) => {
    if (event.button === 0) {  // Left mouse button
        isWatering = true
    }
})

mainSvg.on("mousemove", (event: MouseEvent) => {
    const rect = (mainSvg.node() as SVGSVGElement).getBoundingClientRect()
    mouseX = event.clientX - rect.left
    mouseY = event.clientY - rect.top
})

d3.select(document).on("mouseup", (event: MouseEvent) => {
    if (event.button === 0) {
        isWatering = false
    }
})

// Function to spawn water droplets
function spawnDroplets() {
    if (!isWatering) return

    for (let i = 0; i < DROPLET_SPAWN_RATE; i++) {
        droplets.push({
            x: mouseX + (Math.random() - 0.5) * 10,
            y: mouseY,
            vx: (Math.random() - 0.5) * 2,
            vy: Math.random() * 2,
            id: nextDropletId++
        })
    }
}

// Function to check collision between droplet and node
function checkCollision(droplet: WaterDroplet, nodeElement: any): boolean {
    try {
        // Get the rect element inside the node group
        const rectElement = nodeElement.querySelector("rect")
        if (!rectElement) return false

        // Get the actual screen position of the rect
        const rectBBox = rectElement.getBoundingClientRect()
        const svgBBox = (mainSvg.node() as SVGSVGElement).getBoundingClientRect()

        // Convert rect position to SVG coordinates
        const nodeX = rectBBox.left - svgBBox.left
        const nodeY = rectBBox.top - svgBBox.top
        const nodeWidth = rectBBox.width
        const nodeHeight = rectBBox.height

        // Check if droplet is within node bounds
        return droplet.x >= nodeX &&
               droplet.x <= nodeX + nodeWidth &&
               droplet.y >= nodeY &&
               droplet.y <= nodeY + nodeHeight
    } catch (e) {
        return false
    }
}

// Function to get water level color
function getWaterColor(water: number): string {
    const ratio = water / WATER_THRESHOLD
    if (ratio < 0.33) {
        return `rgb(${255}, ${255}, ${255})` // White
    } else if (ratio < 0.66) {
        return `rgb(${200}, ${230}, ${255})` // Light blue
    } else {
        return `rgb(${100}, ${200}, ${255})` // Blue
    }
}

// Animation loop
function animate() {
    // Spawn new droplets
    spawnDroplets()

    // Update droplet positions
    droplets.forEach(droplet => {
        droplet.vy += DROPLET_GRAVITY
        droplet.x += droplet.vx
        droplet.y += droplet.vy
    })

    // Check collisions with all nodes
    const allNodeElements = mainSvg.selectAll("g.node").nodes()
    const toRemove: number[] = []

    droplets.forEach((droplet, idx) => {
        for (let i = 0; i < allNodeElements.length; i++) {
            const nodeElement = allNodeElements[i]
            if (checkCollision(droplet, nodeElement)) {
                // Get the node data
                const nodeData = d3.select(nodeElement).datum() as d3.HierarchyPointNode<PointNode>

                // Add water
                if (nodeData.data.water === undefined) {
                    nodeData.data.water = 0
                }
                nodeData.data.water += 1

                // Update visual feedback
                d3.select(nodeElement).select("rect")
                    .style("fill", getWaterColor(nodeData.data.water))

                // Check if ready to grow
                if (nodeData.data.water >= WATER_THRESHOLD) {
                    // Find which tree this node belongs to and trigger growth
                    // We need to find the tree by checking the node's root
                    let currentNode: any = nodeData
                    while (currentNode.parent) {
                        currentNode = currentNode.parent
                    }

                    // Find matching tree in allTrees
                    for (const treeData of allTrees) {
                        if (treeData.root === currentNode) {
                            treeData.growNode(nodeData)
                            break
                        }
                    }
                }

                toRemove.push(idx)
                break
            }
        }
    })

    // Remove droplets that are off screen or hit something
    droplets = droplets.filter((_, idx) => {
        if (toRemove.includes(idx)) return false
        return droplets[idx].y < 1000 && droplets[idx].y > -100
    })

    // Render droplets
    const dropletSelection = dropletsGroup.selectAll("circle.droplet")
        .data(droplets, (d: any) => d.id)

    dropletSelection.enter()
        .append("circle")
        .attr("class", "droplet")
        .attr("r", DROPLET_SIZE)
        .attr("fill", "#4444ff")
        .attr("opacity", 0.6)

    dropletsGroup.selectAll("circle.droplet")
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y)

    dropletSelection.exit().remove()

    requestAnimationFrame(animate)
}

// Start animation loop
animate()

const repl = document.createElement('strudel-editor') as any
repl.setAttribute('code', `...`)
document.getElementById('strudel')!.append(repl)
console.log(repl.editor)
