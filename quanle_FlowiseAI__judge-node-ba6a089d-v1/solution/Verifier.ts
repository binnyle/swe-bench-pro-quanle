import { ICommonObject, INode, INodeData, INodeOutputsValue, INodeParams } from '../../../src/Interface'
import { IFlowState } from '../Interface.Agentflow'
import { updateFlowState } from '../utils'

class Verifier_Agentflow implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    color: string
    baseClasses: string[]
    inputs: INodeParams[]
    outputs: INodeOutputsValue[]

    constructor() {
        this.label = 'Verifier'
        this.name = 'verifierAgentflow'
        this.version = 1.0
        this.type = 'Verifier'
        this.category = 'Agent Flows'
        this.description = 'Verify upstream output quality and route to pass, fail, or abstain'
        this.color = '#FF6F61'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Mode',
                name: 'mode',
                type: 'options',
                options: [
                    { label: 'Schema', name: 'schema' },
                    { label: 'Groundedness', name: 'groundedness' },
                    { label: 'LLM Judge', name: 'llm_judge' }
                ],
                default: 'llm_judge',
                description: 'Verification mode'
            },
            {
                label: 'Input to Check',
                name: 'inputToCheck',
                type: 'string',
                acceptVariable: true,
                description: 'The upstream output to verify'
            },
            {
                label: 'Context',
                name: 'context',
                type: 'string',
                optional: true,
                acceptVariable: true,
                description: 'Reference context for groundedness checks',
                show: { mode: 'groundedness' }
            },
            {
                label: 'JSON Schema',
                name: 'schema',
                type: 'string',
                optional: true,
                rows: 4,
                description: 'JSON schema to validate against',
                show: { mode: 'schema' }
            },
            {
                label: 'Judge Model',
                name: 'judgeModel',
                type: 'asyncOptions',
                loadMethod: 'listModels',
                loadConfig: true,
                optional: true,
                description: 'Chat model to use as judge',
                show: { mode: 'llm_judge' }
            },
            {
                label: 'Pass Threshold',
                name: 'passThreshold',
                type: 'number',
                default: 0.7,
                description: 'Score >= this value routes to pass (0-1)'
            },
            {
                label: 'Abstain Threshold',
                name: 'abstainThreshold',
                type: 'number',
                default: 0.4,
                description: 'Score below this value routes to fail; between this and pass threshold routes to abstain (0-1)'
            },
            {
                label: 'On Error',
                name: 'onError',
                type: 'options',
                options: [
                    { label: 'Abstain', name: 'abstain' },
                    { label: 'Fail', name: 'fail' }
                ],
                default: 'abstain',
                description: 'How to route if the verification check itself errors'
            },
            {
                label: 'Update Flow State',
                name: 'verifierUpdateState',
                type: 'array',
                optional: true,
                acceptVariable: true,
                array: [
                    {
                        label: 'Key',
                        name: 'key',
                        type: 'asyncOptions',
                        loadMethod: 'listRuntimeStateKeys'
                    },
                    {
                        label: 'Value',
                        name: 'value',
                        type: 'string',
                        acceptVariable: true,
                        acceptNodeOutputAsVariable: true
                    }
                ]
            }
        ]
        this.outputs = [
            { label: 'Pass', name: '0', description: 'Output accepted' },
            { label: 'Abstain', name: '1', description: 'Confidence too low' },
            { label: 'Fail', name: '2', description: 'Output rejected' }
        ]
    }

    loadMethods = {
        async listRuntimeStateKeys(_: INodeData, options?: ICommonObject): Promise<Array<{ label: string; name: string }>> {
            const previousNodes = options?.previousNodes as ICommonObject[]
            const startAgentflowNode = previousNodes?.find((node: ICommonObject) => node.name === 'startAgentflow')
            const state = startAgentflowNode?.inputs?.startState as ICommonObject[]
            if (!state) return []
            return state.map((item: ICommonObject) => ({ label: item.key as string, name: item.key as string }))
        }
    }

    async run(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const state = options.agentflowRuntime?.state as ICommonObject

        const mode = (nodeData.inputs?.mode as string) || 'llm_judge'
        const inputToCheck = (nodeData.inputs?.inputToCheck as string) || ''
        const passThreshold = parseFloat(nodeData.inputs?.passThreshold as string) || 0.7
        const abstainThreshold = parseFloat(nodeData.inputs?.abstainThreshold as string) || 0.4
        const onError = (nodeData.inputs?.onError as string) || 'abstain'

        let score = 0
        let reason = ''
        let decision: 'pass' | 'abstain' | 'fail'

        try {
            switch (mode) {
                case 'schema': {
                    const result = this.checkSchema(inputToCheck, nodeData.inputs?.schema as string)
                    score = result.score
                    reason = result.reason
                    break
                }
                case 'groundedness': {
                    const context = (nodeData.inputs?.context as string) || ''
                    const result = this.checkGroundedness(inputToCheck, context)
                    score = result.score
                    reason = result.reason
                    break
                }
                case 'llm_judge': {
                    const result = await this.checkLLMJudge(inputToCheck, nodeData, options)
                    score = result.score
                    reason = result.reason
                    break
                }
                default:
                    throw new Error(`Unknown verification mode: ${mode}`)
            }

            decision = this.routeDecision(score, passThreshold, abstainThreshold)
        } catch (error: any) {
            score = 0
            reason = `Verification error: ${error.message}`
            decision = onError as 'fail' | 'abstain'
        }

        // Build conditions array: [pass, abstain, fail]
        const conditions = [
            { type: 'pass', isFulfilled: decision === 'pass' },
            { type: 'abstain', isFulfilled: decision === 'abstain' },
            { type: 'fail', isFulfilled: decision === 'fail' }
        ]

        // Update flow state with verification results
        let newState = { ...state }
        const autoStateUpdate: IFlowState[] = [
            { key: 'verifier_decision', value: decision },
            { key: 'verifier_score', value: String(score) },
            { key: 'verifier_reason', value: reason }
        ]
        newState = updateFlowState(newState, autoStateUpdate)

        // Apply user-configured state updates
        const _verifierUpdateState = nodeData.inputs?.verifierUpdateState
        if (_verifierUpdateState && Array.isArray(_verifierUpdateState) && _verifierUpdateState.length > 0) {
            newState = updateFlowState(newState, _verifierUpdateState as IFlowState[])
        }

        return {
            id: nodeData.id,
            name: this.name,
            input: { inputToCheck, mode },
            output: { conditions, decision, score, reason },
            state: newState
        }
    }

    private routeDecision(score: number, passThreshold: number, abstainThreshold: number): 'pass' | 'abstain' | 'fail' {
        // FUTURE: conformal mode could override this logic
        if (score >= passThreshold) return 'pass'
        if (score >= abstainThreshold) return 'abstain'
        return 'fail'
    }

    private checkSchema(input: string, schemaStr: string | undefined): { score: number; reason: string } {
        if (!schemaStr) {
            return { score: 0, reason: 'No schema provided' }
        }

        try {
            const schema = JSON.parse(schemaStr)
            let parsed: any
            try {
                parsed = JSON.parse(input)
            } catch {
                return { score: 0, reason: 'Input is not valid JSON' }
            }

            const errors: string[] = []

            // Check required fields
            if (schema.required && Array.isArray(schema.required)) {
                for (const field of schema.required) {
                    if (!(field in parsed)) {
                        errors.push(`Missing required field: ${field}`)
                    }
                }
            }

            // Check property types if properties defined
            if (schema.properties) {
                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    if (key in parsed) {
                        const expectedType = (propSchema as any).type
                        const actualType = Array.isArray(parsed[key]) ? 'array' : typeof parsed[key]
                        if (expectedType && actualType !== expectedType) {
                            errors.push(`Field "${key}" expected type "${expectedType}" but got "${actualType}"`)
                        }
                    }
                }
            }

            if (errors.length === 0) {
                return { score: 1.0, reason: 'Schema validation passed' }
            } else {
                return { score: 0, reason: errors.join('; ') }
            }
        } catch (e: any) {
            return { score: 0, reason: `Invalid schema: ${e.message}` }
        }
    }

    private checkGroundedness(input: string, context: string): { score: number; reason: string } {
        if (!context) {
            return { score: 0, reason: 'No context provided for groundedness check' }
        }

        if (!input) {
            return { score: 0, reason: 'No input to check' }
        }

        const contextLower = context.toLowerCase()

        // Split input into sentences for granular checking
        const sentences = input
            .split(/[.!?]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 10)

        if (sentences.length === 0) {
            return { score: 1.0, reason: 'Input too short to contain claims' }
        }

        let supportedCount = 0
        const unsupported: string[] = []

        for (const sentence of sentences) {
            // Extract key phrases (words longer than 3 chars)
            const keyPhrases = sentence
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 3)

            if (keyPhrases.length === 0) {
                supportedCount++
                continue
            }

            // Check overlap: what fraction of key phrases appear in context
            const matchCount = keyPhrases.filter((phrase) => contextLower.includes(phrase)).length
            const overlapRatio = matchCount / keyPhrases.length

            if (overlapRatio >= 0.5) {
                supportedCount++
            } else {
                unsupported.push(sentence.substring(0, 60))
            }
        }

        const score = supportedCount / sentences.length

        if (score >= 1.0) {
            return { score: 1.0, reason: 'All claims supported by context' }
        } else if (score === 0) {
            return { score: 0, reason: `No claims supported. Unsupported: ${unsupported.join('; ')}` }
        } else {
            return {
                score: Math.round(score * 100) / 100,
                reason: `${supportedCount}/${sentences.length} claims supported. Unsupported: ${unsupported.join('; ')}`
            }
        }
    }

    private async checkLLMJudge(
        input: string,
        nodeData: INodeData,
        options: ICommonObject
    ): Promise<{ score: number; reason: string }> {
        const modelConfig = nodeData.inputs?.judgeModel
        if (!modelConfig) {
            throw new Error('No judge model configured')
        }

        // Resolve the model from the configuration
        const { getModelConfigByModelName, MODEL_TYPE } = await import('../../../src/modelLoader')

        let model: any
        try {
            const config = typeof modelConfig === 'string' ? JSON.parse(modelConfig) : modelConfig
            const modelName = config.modelName || config.model || config
            const provider = config.provider || undefined
            const modelConfigData = await getModelConfigByModelName(MODEL_TYPE.CHAT, provider, modelName)

            if (!modelConfigData) {
                throw new Error(`Model not found: ${modelName}`)
            }

            const nodeInstanceFilePath = modelConfigData.filePath
            if (!nodeInstanceFilePath) {
                throw new Error(`No file path for model: ${modelName}`)
            }

            const nodeModule = await import(nodeInstanceFilePath)
            const nodeInstance = new nodeModule.nodeClass()

            const modelNodeData = {
                ...nodeData,
                inputs: { ...config },
                credential: config.credential || nodeData.credential
            } as INodeData

            model = await nodeInstance.init(modelNodeData, '', options)
        } catch (e: any) {
            throw new Error(`Failed to initialize judge model: ${e.message}`)
        }

        const prompt = `You are a strict judge evaluating the quality and faithfulness of an AI-generated response.

Evaluate the following output and return a JSON object with exactly two fields:
- "score": a number between 0 and 1 (0 = completely wrong/unfaithful, 1 = perfect)
- "reason": a brief explanation of your scoring

Output to evaluate:
${input}

Respond with ONLY a valid JSON object, no other text.`

        try {
            const response = await model.invoke(prompt)
            const responseText = typeof response === 'string' ? response : response.content?.toString() || ''

            // Extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*?\}/)
            if (!jsonMatch) {
                throw new Error('Judge model did not return valid JSON')
            }

            const parsed = JSON.parse(jsonMatch[0])
            const score = Math.max(0, Math.min(1, parseFloat(parsed.score) || 0))
            const reason = parsed.reason || 'No reason provided'

            return { score, reason }
        } catch (e: any) {
            throw new Error(`LLM judge failed: ${e.message}`)
        }
    }
}

module.exports = { nodeClass: Verifier_Agentflow }
