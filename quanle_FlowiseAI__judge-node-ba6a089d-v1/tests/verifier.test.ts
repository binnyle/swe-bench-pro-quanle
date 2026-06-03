/**
 * Tests for the Verifier (Gate) AgentFlow v2 node.
 *
 * Validates: schema mode, groundedness mode, routing logic,
 * error handling, flow state writes, and node conventions.
 */

// We load the node class dynamically the way NodesPool does
const nodeModule = require('./Verifier')
const VerifierClass = nodeModule.nodeClass

// Discover the node's actual input names so tests work regardless of naming convention
// (e.g., 'mode' vs 'verifierMode', 'inputToCheck' vs 'verifierInputToCheck')
const _nodeInstance = new VerifierClass()
const _inputDefs = _nodeInstance.inputs || []

function findInputName(suffix: string): string {
    const exact = _inputDefs.find((i: any) => i.name === suffix)
    if (exact) return exact.name
    const prefixed = _inputDefs.find((i: any) =>
        i.name.toLowerCase().endsWith(suffix.toLowerCase())
    )
    if (prefixed) return prefixed.name
    return suffix
}

const INPUT_NAMES = {
    mode: findInputName('mode'),
    inputToCheck: findInputName('inputToCheck'),
    context: findInputName('context'),
    schema: findInputName('schema'),
    judgeModel: findInputName('judgeModel'),
    passThreshold: findInputName('passThreshold'),
    abstainThreshold: findInputName('abstainThreshold'),
    onError: findInputName('onError'),
}

function makeNodeData(semanticInputs: Record<string, any>, id = 'test-node-1'): any {
    // Map semantic names to the node's actual input names
    const inputs: Record<string, any> = {}
    for (const [key, value] of Object.entries(semanticInputs)) {
        const actualName = (INPUT_NAMES as any)[key] || key
        inputs[actualName] = value
    }
    return {
        id,
        label: 'Verifier',
        name: _nodeInstance.name,
        type: _nodeInstance.type,
        category: _nodeInstance.category,
        baseClasses: _nodeInstance.baseClasses,
        inputs,
        version: _nodeInstance.version || 1.0,
        icon: '',
        description: ''
    }
}

function makeOptions(state: Record<string, any> = {}): any {
    return {
        agentflowRuntime: { state }
    }
}

describe('Verifier Node - Constructor', () => {
    let node: any

    beforeAll(() => {
        node = new VerifierClass()
    })

    test('has correct name convention', () => {
        expect(node.name.toLowerCase()).toContain('verifier')
        expect(node.name).toMatch(/[Aa]gentflow/)
    })

    test('has correct category', () => {
        expect(node.category).toBe('Agent Flows')
    })

    test('has correct type', () => {
        expect(node.type).toBe('Verifier')
    })

    test('has three output branches', () => {
        expect(node.outputs).toHaveLength(3)
        const labels = node.outputs.map((o: any) => o.label)
        expect(labels).toContain('Pass')
        expect(labels).toContain('Abstain')
        expect(labels).toContain('Fail')
    })

    test('has mode input with three options', () => {
        const modeInput = node.inputs.find((i: any) => i.name.toLowerCase().endsWith('mode'))
        expect(modeInput).toBeDefined()
        const optionNames = modeInput.options.map((o: any) => o.name)
        expect(optionNames).toContain('schema')
        expect(optionNames).toContain('groundedness')
        expect(optionNames).toContain('llm_judge')
    })

    test('has threshold inputs with correct defaults', () => {
        const passThreshold = node.inputs.find((i: any) => i.name.toLowerCase().includes('passthreshold'))
        const abstainThreshold = node.inputs.find((i: any) => i.name.toLowerCase().includes('abstainthreshold'))
        expect(passThreshold).toBeDefined()
        expect(passThreshold.default).toBe(0.7)
        expect(abstainThreshold).toBeDefined()
        expect(abstainThreshold.default).toBe(0.4)
    })

    test('has onError input defaulting to abstain', () => {
        const onError = node.inputs.find((i: any) => i.name.toLowerCase().includes('onerror'))
        expect(onError).toBeDefined()
        expect(onError.default).toBe('abstain')
    })

    test('exports nodeClass correctly', () => {
        expect(nodeModule.nodeClass).toBeDefined()
        const instance = new nodeModule.nodeClass()
        expect(instance.run).toBeDefined()
        expect(typeof instance.run).toBe('function')
    })
})

describe('Verifier Node - Schema Mode', () => {
    let node: any

    beforeAll(() => {
        node = new VerifierClass()
    })

    test('passes valid JSON matching schema', async () => {
        const schema = JSON.stringify({
            required: ['name', 'age'],
            properties: {
                name: { type: 'string' },
                age: { type: 'number' }
            }
        })
        const input = JSON.stringify({ name: 'Alice', age: 30 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('pass')
        expect(result.output.score).toBe(1.0)
        const passCond = result.output.conditions.find((c: any) => c.type === 'pass')
        expect(passCond).toBeDefined()
        expect(passCond.isFulfilled).toBe(true)
        const othersFulfilled = result.output.conditions.filter((c: any) => c.type !== 'pass' && c.isFulfilled)
        expect(othersFulfilled).toHaveLength(0)
    })

    test('fails when required fields are missing', async () => {
        const schema = JSON.stringify({
            required: ['name', 'email'],
            properties: {
                name: { type: 'string' },
                email: { type: 'string' }
            }
        })
        const input = JSON.stringify({ name: 'Alice' })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.score).toBe(0)
        expect(result.output.reason).toContain('email')
    })

    test('fails when input is not valid JSON', async () => {
        const schema = JSON.stringify({ required: ['name'] })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: 'not json at all', schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.score).toBe(0)
        expect(result.output.reason).toContain('not valid JSON')
    })

    test('fails when type mismatch in properties', async () => {
        const schema = JSON.stringify({
            properties: {
                count: { type: 'number' }
            }
        })
        const input = JSON.stringify({ count: 'not-a-number' })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.score).toBe(0)
        expect(result.output.reason).toContain('count')
    })

    test('fails when no schema provided', async () => {
        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: '{"a":1}', passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.score).toBe(0)
    })
})

describe('Verifier Node - Groundedness Mode', () => {
    let node: any

    beforeAll(() => {
        node = new VerifierClass()
    })

    test('passes when all claims are supported by context', async () => {
        const context = 'The Eiffel Tower is located in Paris, France. It was built in 1889 for the World Fair.'
        const input = 'The Eiffel Tower was built in Paris in 1889.'

        const result = await node.run(
            makeNodeData({ mode: 'groundedness', inputToCheck: input, context, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.score).toBeGreaterThanOrEqual(0.7)
        expect(result.output.decision).toBe('pass')
    })

    test('fails when claims are not supported by context', async () => {
        const context = 'The Eiffel Tower is located in Paris, France.'
        const input = 'The Great Wall of China stretches across northern Mongolia for thousands of kilometers.'

        const result = await node.run(
            makeNodeData({ mode: 'groundedness', inputToCheck: input, context, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.score).toBeLessThan(0.7)
        expect(['fail', 'abstain']).toContain(result.output.decision)
    })

    test('fails when no context provided', async () => {
        const result = await node.run(
            makeNodeData({ mode: 'groundedness', inputToCheck: 'some text', passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.score).toBe(0)
    })

    test('fails when no input provided', async () => {
        const result = await node.run(
            makeNodeData({
                mode: 'groundedness',
                inputToCheck: '',
                context: 'some context',
                passThreshold: 0.7,
                abstainThreshold: 0.4
            }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.score).toBe(0)
    })
})

describe('Verifier Node - Routing Logic', () => {
    let node: any

    beforeAll(() => {
        node = new VerifierClass()
    })

    test('routes to pass when score >= passThreshold', async () => {
        // Schema valid = score 1.0, passThreshold 0.7 => pass
        const schema = JSON.stringify({ required: ['x'], properties: { x: { type: 'number' } } })
        const input = JSON.stringify({ x: 42 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('pass')
        const passCond = result.output.conditions.find((c: any) => c.type === 'pass')
        expect(passCond).toBeDefined()
        expect(passCond.isFulfilled).toBe(true)
    })

    test('routes to fail when score < abstainThreshold', async () => {
        // Schema invalid = score 0.0, abstainThreshold 0.4 => fail
        const schema = JSON.stringify({ required: ['x'] })
        const input = JSON.stringify({ y: 1 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        const failCond = result.output.conditions.find((c: any) => c.type === 'fail')
        expect(failCond).toBeDefined()
        expect(failCond.isFulfilled).toBe(true)
    })

    test('exactly one condition is fulfilled per run', async () => {
        const schema = JSON.stringify({ required: ['x'] })
        const input = JSON.stringify({ x: 1 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        const fulfilledCount = result.output.conditions.filter((c: any) => c.isFulfilled).length
        expect(fulfilledCount).toBe(1)
    })

    test('conditions array has exactly three entries', async () => {
        const schema = JSON.stringify({ required: ['x'] })
        const input = JSON.stringify({ x: 1 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.conditions).toHaveLength(3)
    })
})

describe('Verifier Node - LLM Judge Mode', () => {
    let node: any

    beforeAll(() => {
        node = new VerifierClass()
    })

    test('extracts score and reason from judge model response', async () => {
        // Monkey-patch checkLLMJudge to simulate a successful model response
        const originalCheck = (node as any).checkLLMJudge.bind(node)
        ;(node as any).checkLLMJudge = async () => ({
            score: 0.85,
            reason: 'Output is faithful and well-structured'
        })

        const result = await node.run(
            makeNodeData({ mode: 'llm_judge', inputToCheck: 'The capital of France is Paris.', passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('pass')
        expect(result.output.score).toBe(0.85)
        expect(result.output.reason).toBe('Output is faithful and well-structured')

        // Restore
        ;(node as any).checkLLMJudge = originalCheck
    })

    test('routes to abstain when judge score is between thresholds', async () => {
        ;(node as any).checkLLMJudge = async () => ({
            score: 0.5,
            reason: 'Partially supported claims'
        })

        const result = await node.run(
            makeNodeData({ mode: 'llm_judge', inputToCheck: 'Some claim.', passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('abstain')
        expect(result.output.score).toBe(0.5)

        // Restore
        ;(node as any).checkLLMJudge = async () => { throw new Error('not configured') }
    })

    test('routes to fail when judge score is below abstain threshold', async () => {
        ;(node as any).checkLLMJudge = async () => ({
            score: 0.2,
            reason: 'Output contains unsupported claims'
        })

        const result = await node.run(
            makeNodeData({ mode: 'llm_judge', inputToCheck: 'Wrong claim.', passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.score).toBe(0.2)

        // Restore
        ;(node as any).checkLLMJudge = async () => { throw new Error('not configured') }
    })
})

describe('Verifier Node - Error Handling', () => {
    let node: any

    beforeAll(() => {
        node = new VerifierClass()
    })

    test('routes to abstain on error when onError=abstain', async () => {
        // llm_judge mode without a model configured will error
        const result = await node.run(
            makeNodeData({ mode: 'llm_judge', inputToCheck: 'test', passThreshold: 0.7, abstainThreshold: 0.4, onError: 'abstain' }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('abstain')
        expect(result.output.reason).toContain('error')
    })

    test('routes to fail on error when onError=fail', async () => {
        const result = await node.run(
            makeNodeData({ mode: 'llm_judge', inputToCheck: 'test', passThreshold: 0.7, abstainThreshold: 0.4, onError: 'fail' }),
            '',
            makeOptions()
        )

        expect(result.output.decision).toBe('fail')
        expect(result.output.reason).toContain('error')
    })
})

describe('Verifier Node - Flow State', () => {
    let node: any

    beforeAll(() => {
        node = new VerifierClass()
    })

    test('writes decision, score, and reason to flow state', async () => {
        const schema = JSON.stringify({ required: ['x'] })
        const input = JSON.stringify({ x: 1 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions({ existingKey: 'existingValue' })
        )

        // State should contain decision, score, and reason in some form
        const stateValues = Object.values(result.state)
        expect(stateValues).toContain('pass')
        expect(stateValues.some((v: any) => String(v).includes('1') || v === 1)).toBe(true)
        // Existing state preserved
        expect(result.state.existingKey).toBe('existingValue')
    })

    test('preserves existing state when updating', async () => {
        const schema = JSON.stringify({ required: ['x'] })
        const input = JSON.stringify({ x: 1 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions({ myKey: 'myValue', anotherKey: 'anotherValue' })
        )

        expect(result.state.myKey).toBe('myValue')
        expect(result.state.anotherKey).toBe('anotherValue')
        // New state keys were added (more keys than what we started with)
        expect(Object.keys(result.state).length).toBeGreaterThan(2)
    })

    test('return object has correct shape', async () => {
        const schema = JSON.stringify({ required: ['x'] })
        const input = JSON.stringify({ x: 1 })

        const result = await node.run(
            makeNodeData({ mode: 'schema', inputToCheck: input, schema, passThreshold: 0.7, abstainThreshold: 0.4 }),
            '',
            makeOptions()
        )

        expect(result).toHaveProperty('id')
        expect(result).toHaveProperty('name')
        expect(result.name.toLowerCase()).toContain('verifier')
        expect(result).toHaveProperty('input')
        expect(result).toHaveProperty('output')
        expect(result).toHaveProperty('state')
        expect(result.output).toHaveProperty('conditions')
        expect(result.output).toHaveProperty('decision')
        expect(result.output).toHaveProperty('score')
        expect(result.output).toHaveProperty('reason')
    })
})
