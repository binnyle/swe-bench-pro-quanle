/**
 * Tests for the "disable node" feature.
 *
 * A disabled node must be excluded from the flow entirely: it is not
 * initialized, produces no output, and its upstream/downstream neighbors
 * are reconnected so the rest of the flow runs as a single connected whole.
 */

// Use dynamic require so the test file compiles even when removeDisabledNodes
// hasn't been added yet (base commit). Tests that call the function will fail
// with a clear "not a function" error rather than a compile-time import error.
const utils = require('./utils/index')
const removeDisabledNodes: (nodes: any[], edges: any[]) => { nodes: any[]; edges: any[] } =
    utils.removeDisabledNodes || (() => { throw new Error('removeDisabledNodes is not exported from utils/index') })

// Minimal stubs that satisfy the IReactFlowNode / IReactFlowEdge shape
function node(id: string, disabled = false): any {
    return {
        id,
        data: { id, disabled, name: `node-${id}`, label: `Node ${id}`, type: 'test', icon: '', version: 1, category: 'Test', baseClasses: [] },
        position: { x: 0, y: 0 },
        type: 'customNode',
        positionAbsolute: { x: 0, y: 0 },
        z: 0,
        handleBounds: { source: null, target: null },
        width: 100,
        height: 100,
        selected: false,
        dragging: false
    }
}

function edge(source: string, target: string): any {
    return {
        source,
        sourceHandle: `${source}-output-0`,
        target,
        targetHandle: `${target}-input-0`,
        type: 'buttonedge',
        id: `e-${source}-${target}`,
        data: { label: '' }
    }
}

describe('removeDisabledNodes - No disabled nodes', () => {
    test('returns nodes and edges unchanged when nothing is disabled', () => {
        const nodes = [node('A'), node('B'), node('C')]
        const edges = [edge('A', 'B'), edge('B', 'C')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(3)
        expect(result.edges).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['A', 'B', 'C'])
    })

    test('returns identical references when nothing is disabled', () => {
        const nodes = [node('A')]
        const edges: any[] = []

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toBe(nodes)
        expect(result.edges).toBe(edges)
    })
})

describe('removeDisabledNodes - Single disabled node', () => {
    test('removes a disabled middle node and reroutes edges', () => {
        // A → B(disabled) → C  becomes  A → C
        const nodes = [node('A'), node('B', true), node('C')]
        const edges = [edge('A', 'B'), edge('B', 'C')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['A', 'C'])
        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('A')
        expect(result.edges[0].target).toBe('C')
    })

    test('removes a disabled starting node', () => {
        // A(disabled) → B → C  becomes  B → C
        const nodes = [node('A', true), node('B'), node('C')]
        const edges = [edge('A', 'B'), edge('B', 'C')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['B', 'C'])
        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('B')
        expect(result.edges[0].target).toBe('C')
    })

    test('removes a disabled ending node', () => {
        // A → B → C(disabled)  becomes  A → B
        const nodes = [node('A'), node('B'), node('C', true)]
        const edges = [edge('A', 'B'), edge('B', 'C')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['A', 'B'])
        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('A')
        expect(result.edges[0].target).toBe('B')
    })
})

describe('removeDisabledNodes - Multiple disabled nodes', () => {
    test('chains through consecutive disabled nodes', () => {
        // A → B(disabled) → C(disabled) → D  becomes  A → D
        const nodes = [node('A'), node('B', true), node('C', true), node('D')]
        const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'D')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['A', 'D'])
        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('A')
        expect(result.edges[0].target).toBe('D')
    })

    test('handles multiple independent disabled nodes', () => {
        // A(disabled) → B → C(disabled) → D  becomes  B → D
        const nodes = [node('A', true), node('B'), node('C', true), node('D')]
        const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'D')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['B', 'D'])
        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('B')
        expect(result.edges[0].target).toBe('D')
    })
})

describe('removeDisabledNodes - Branching flows', () => {
    test('disabled node with multiple downstream targets fans out', () => {
        // A → B(disabled) → C
        //                  → D
        // becomes A → C, A → D
        const nodes = [node('A'), node('B', true), node('C'), node('D')]
        const edges = [edge('A', 'B'), edge('B', 'C'), edge('B', 'D')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(3)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['A', 'C', 'D'])
        expect(result.edges).toHaveLength(2)
        const targets = result.edges.map((e: any) => e.target).sort()
        expect(targets).toEqual(['C', 'D'])
        expect(result.edges.every((e: any) => e.source === 'A')).toBe(true)
    })

    test('disabled node with multiple upstream sources fans in', () => {
        // A → B(disabled) → D
        // C →
        // becomes A → D, C → D
        const nodes = [node('A'), node('B', true), node('C'), node('D')]
        const edges = [edge('A', 'B'), edge('C', 'B'), edge('B', 'D')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(3)
        expect(result.nodes.map((n: any) => n.id)).toEqual(['A', 'C', 'D'])
        expect(result.edges).toHaveLength(2)
        const sources = result.edges.map((e: any) => e.source).sort()
        expect(sources).toEqual(['A', 'C'])
        expect(result.edges.every((e: any) => e.target === 'D')).toBe(true)
    })
})

describe('removeDisabledNodes - Three-way fan-in disabled', () => {
    test('disabling a node with three upstream sources reroutes all to its downstream', () => {
        // A → B(disabled) → E
        // C → B(disabled) → E
        // D → B(disabled) → E
        // becomes A → E, C → E, D → E
        const nodes = [node('A'), node('B', true), node('C'), node('D'), node('E')]
        const edges = [edge('A', 'B'), edge('C', 'B'), edge('D', 'B'), edge('B', 'E')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(4)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['A', 'C', 'D', 'E'])
        expect(result.edges).toHaveLength(3)
        const sources = result.edges.map((e: any) => e.source).sort()
        expect(sources).toEqual(['A', 'C', 'D'])
        expect(result.edges.every((e: any) => e.target === 'E')).toBe(true)
    })
})

describe('removeDisabledNodes - Starting node fan-out', () => {
    test('disabling a starting node with multiple outputs makes all targets new starting nodes', () => {
        // A(disabled) → B, → C, → D
        // becomes B, C, D as independent starting nodes with no edges
        const nodes = [node('A', true), node('B'), node('C'), node('D')]
        const edges = [edge('A', 'B'), edge('A', 'C'), edge('A', 'D')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(3)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['B', 'C', 'D'])
        expect(result.edges).toHaveLength(0)
    })

    test('disabling a starting node with fan-out preserves downstream edges', () => {
        // A(disabled) → B → E
        //             → C → F
        //             → D
        const nodes = [node('A', true), node('B'), node('C'), node('D'), node('E'), node('F')]
        const edges = [edge('A', 'B'), edge('A', 'C'), edge('A', 'D'), edge('B', 'E'), edge('C', 'F')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(5)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['B', 'C', 'D', 'E', 'F'])
        expect(result.edges).toHaveLength(2)
        const edgePairs = result.edges.map((e: any) => `${e.source}->${e.target}`).sort()
        expect(edgePairs).toEqual(['B->E', 'C->F'])
    })
})

describe('removeDisabledNodes - Partial fan-out disabled', () => {
    test('disabling some fan-out targets keeps only enabled targets connected', () => {
        // A → B(disabled)
        // A → C(disabled)
        // A → D
        // becomes A → D only
        const nodes = [node('A'), node('B', true), node('C', true), node('D')]
        const edges = [edge('A', 'B'), edge('A', 'C'), edge('A', 'D')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['A', 'D'])
        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('A')
        expect(result.edges[0].target).toBe('D')
    })

    test('disabling fan-out targets with downstream reroutes through them', () => {
        // A → B(disabled) → E
        // A → C(disabled) → F
        // A → D
        // becomes A → D, A → E (rerouted through B), A → F (rerouted through C)
        const nodes = [node('A'), node('B', true), node('C', true), node('D'), node('E'), node('F')]
        const edges = [edge('A', 'B'), edge('A', 'C'), edge('A', 'D'), edge('B', 'E'), edge('C', 'F')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(4)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['A', 'D', 'E', 'F'])
        expect(result.edges).toHaveLength(3)
        const hasAtoD = result.edges.some((e: any) => e.source === 'A' && e.target === 'D')
        const hasAtoE = result.edges.some((e: any) => e.source === 'A' && e.target === 'E')
        const hasAtoF = result.edges.some((e: any) => e.source === 'A' && e.target === 'F')
        expect(hasAtoD).toBe(true)
        expect(hasAtoE).toBe(true)
        expect(hasAtoF).toBe(true)
    })
})

describe('removeDisabledNodes - Diamond pattern', () => {
    test('disabling one branch of a diamond preserves the other', () => {
        // A → B(disabled) → D
        // A → C            → D
        const nodes = [node('A'), node('B', true), node('C'), node('D')]
        const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(3)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['A', 'C', 'D'])
        const hasAtoD = result.edges.some((e: any) => e.source === 'A' && e.target === 'D')
        const hasCtoD = result.edges.some((e: any) => e.source === 'C' && e.target === 'D')
        expect(hasAtoD).toBe(true)
        expect(hasCtoD).toBe(true)
    })

    test('disabling the merge node in a diamond reroutes both branches', () => {
        // A → B → D(disabled) → E
        // A → C → D(disabled) → E
        const nodes = [node('A'), node('B'), node('C'), node('D', true), node('E')]
        const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D'), edge('D', 'E')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(4)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['A', 'B', 'C', 'E'])
        const bToE = result.edges.some((e: any) => e.source === 'B' && e.target === 'E')
        const cToE = result.edges.some((e: any) => e.source === 'C' && e.target === 'E')
        expect(bToE).toBe(true)
        expect(cToE).toBe(true)
    })
})

describe('removeDisabledNodes - Multi-input (Tools+LLM+Memory pattern)', () => {
    test('disabling one of several fan-in sources preserves others', () => {
        // Tool1 → Agent
        // Tool2(disabled) → Agent
        // LLM → Agent
        const nodes = [node('Tool1'), node('Tool2', true), node('LLM'), node('Agent')]
        const edges = [edge('Tool1', 'Agent'), edge('Tool2', 'Agent'), edge('LLM', 'Agent')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(3)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['Agent', 'LLM', 'Tool1'])
        expect(result.edges).toHaveLength(2)
        const sources = result.edges.map((e: any) => e.source).sort()
        expect(sources).toEqual(['LLM', 'Tool1'])
        expect(result.edges.every((e: any) => e.target === 'Agent')).toBe(true)
    })
})

describe('removeDisabledNodes - Disconnected subgraphs', () => {
    test('disabling a node does not affect disconnected components', () => {
        // Subgraph 1: A → B(disabled) → C
        // Subgraph 2: X → Y (independent)
        const nodes = [node('A'), node('B', true), node('C'), node('X'), node('Y')]
        const edges = [edge('A', 'B'), edge('B', 'C'), edge('X', 'Y')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(4)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['A', 'C', 'X', 'Y'])
        expect(result.edges).toHaveLength(2)
        const hasAtoC = result.edges.some((e: any) => e.source === 'A' && e.target === 'C')
        const hasXtoY = result.edges.some((e: any) => e.source === 'X' && e.target === 'Y')
        expect(hasAtoC).toBe(true)
        expect(hasXtoY).toBe(true)
    })

    test('standalone disconnected node unaffected when others are disabled', () => {
        // A → B(disabled), C is standalone
        const nodes = [node('A'), node('B', true), node('C')]
        const edges = [edge('A', 'B')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map((n: any) => n.id).sort()).toEqual(['A', 'C'])
        expect(result.edges).toHaveLength(0)
    })
})

describe('removeDisabledNodes - Edge cases', () => {
    test('all nodes disabled results in empty flow', () => {
        const nodes = [node('A', true), node('B', true)]
        const edges = [edge('A', 'B')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(0)
        expect(result.edges).toHaveLength(0)
    })

    test('single node disabled with no edges', () => {
        const nodes = [node('A', true)]
        const edges: any[] = []

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(0)
        expect(result.edges).toHaveLength(0)
    })

    test('single enabled node remains unchanged', () => {
        const nodes = [node('A')]
        const edges: any[] = []

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(1)
        expect(result.nodes[0].id).toBe('A')
    })

    test('disabled field absent treated as enabled', () => {
        const n = node('A')
        delete n.data.disabled
        const nodes = [n, node('B')]
        const edges = [edge('A', 'B')]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.nodes).toHaveLength(2)
        expect(result.edges).toHaveLength(1)
    })
})

describe('removeDisabledNodes - Handle preservation', () => {
    test('rerouted edges preserve sourceHandle from upstream and targetHandle from downstream', () => {
        const nodes = [node('A'), node('B', true), node('C')]
        const edges = [{
            source: 'A', sourceHandle: 'A-output-model-BaseChatModel',
            target: 'B', targetHandle: 'B-input-model-BaseChatModel',
            type: 'buttonedge', id: 'e-A-B', data: { label: '' }
        }, {
            source: 'B', sourceHandle: 'B-output-data-Output',
            target: 'C', targetHandle: 'C-input-data-Input',
            type: 'buttonedge', id: 'e-B-C', data: { label: '' }
        }]

        const result = removeDisabledNodes(nodes, edges)

        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('A')
        expect(result.edges[0].target).toBe('C')
        expect(result.edges[0].sourceHandle).toBe('A-output-model-BaseChatModel')
        expect(result.edges[0].targetHandle).toBe('C-input-data-Input')
    })
})

describe('removeDisabledNodes - Graph integration', () => {
    test('rerouted edges work with constructGraphs', () => {
        const { constructGraphs } = require('./utils/index')

        const nodes = [node('A'), node('B', true), node('C')]
        const edges = [edge('A', 'B'), edge('B', 'C')]

        const filtered = removeDisabledNodes(nodes, edges)
        const { graph, nodeDependencies } = constructGraphs(filtered.nodes, filtered.edges)

        expect(nodeDependencies['A']).toBe(0)
        expect(nodeDependencies['C']).toBe(1)
        expect(graph['A']).toContain('C')
        expect(nodeDependencies['B']).toBeUndefined()
    })
})
