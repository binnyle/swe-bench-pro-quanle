# Agent Task: Build a Verifier/Gate node for Flowise AgentFlow v2

## Role
You are implementing a new feature in the Flowise codebase (https://github.com/FlowiseAI/Flowise), a monorepo for visually building LLM agent workflows. You will add one new AgentFlow v2 node. Work like a careful contributor: match existing conventions, keep the change small and reviewable, and verify against the real code rather than assumptions.

## Step 0 — Ground yourself before writing anything
Do NOT write code first. Explore the repo and confirm the actual interfaces:
1. Read `packages/components/src/Interface.ts` to get the real `INode` / `INodeData` / `INodeParams` / `ICommonObject` definitions and the exact method signatures expected at runtime.
2. Read `packages/server/src/NodesPool.ts` to confirm how nodes under `packages/components/nodes/` are discovered and registered.
3. Find and read the existing **AgentFlow v2 Condition node** (the node that branches the flow on an expression) and at least one other AgentFlow v2 node that calls an LLM. Treat these as your template for: folder location, class shape, the `inputs` metadata array, how multiple output branches ("output anchors") are declared and returned, how the LLM/credential is resolved (`getCredentialParam`, `getBaseClasses`), and how state is read from and written back to the flow.
4. Only after you understand these, summarize in 3–5 sentences what the correct node shape and branching mechanism actually are. If anything below conflicts with the real code, the real code wins — note the conflict and adapt.

## Problem being solved
Flowise can build agent flows visually but has no node that judges whether an upstream output is good enough before the flow continues. The Condition node only branches on deterministic expressions. There is no primitive that evaluates an LLM/agent output for correctness, groundedness, or safety, and no way to make the flow abstain when the output is too uncertain. In deployments where a wrong answer is costly, bad outputs pass through unchecked.

## Feature to build (v1 scope)
A new AgentFlow v2 node, the **Verifier (Gate)** node, that:
1. Takes as input the upstream output plus context available in flow state (e.g. the original user question, retrieved documents/RAG chunks, or a target schema).
2. Runs a configurable verification check selected by a `mode` input:
   - `schema` — validate the output against a provided JSON schema / required-fields rule (no extra model call).
   - `groundedness` — check that claims/citations in the output are supported by the supplied context (no extra model call where feasible; deterministic containment/overlap check).
   - `llm_judge` — call a configurable judge model that returns a numeric score (0–1) for faithfulness/relevance, parsed from a strict JSON response.
3. Compares the result against a configurable `threshold` and routes the flow to ONE of three output branches:
   - **pass** — output accepted, continue.
   - **fail** — output rejected (downstream node can retry / use fallback).
   - **abstain** — confidence too low or check inconclusive (downstream node can escalate to human / safe-default).
4. Writes its decision and the score/reason back into flow state so downstream nodes and the trace can read them.

### Node `inputs` (config panel — render via metadata, no custom frontend)
- `mode`: options `schema | groundedness | llm_judge` (default `llm_judge`).
- `inputToCheck`: which upstream field/variable to evaluate.
- `context`: optional reference field/variable used by `groundedness`.
- `schema`: JSON, shown only when `mode = schema`.
- `judgeModel`: a connectable chat-model input, shown only when `mode = llm_judge`.
- `passThreshold`: number 0–1 (default 0.7).
- `abstainThreshold`: number 0–1 (default 0.4); score between abstain and pass thresholds → `abstain`, below `abstainThreshold` → `fail`. For `schema`/`groundedness` map the deterministic result onto the same three branches sensibly and document the mapping in code comments.
- `onError`: how to route if the check itself errors (`fail` | `abstain`), default `abstain`.

## Out of scope for v1 (design a hook, do NOT implement)
A `conformal` calibration mode where `passThreshold` is derived from a held-out calibration set to give a statistical guarantee on the pass branch's error rate. Do not build calibration or its persistence now. Just make sure `mode` is an enum and the threshold logic is isolated enough that a `conformal` mode could be added later without restructuring. Leave a short `// FUTURE: conformal mode` comment at the decision point.

## Constraints
- One new node folder under `packages/components/nodes/` in the appropriate category, matching the existing AgentFlow v2 nodes' location and file/naming conventions. Add an SVG icon consistent with the others.
- Implement in TypeScript as an `INode` class. Reuse existing helpers (`getBaseClasses`, `getCredentialParam`, etc.) — do not reinvent them.
- The node must be auto-discovered by `NodesPool` with no manual registration beyond what existing nodes require.
- Do NOT modify unrelated nodes, the execution engine, or persistence. Do NOT add new heavy dependencies; prefer what's already in the workspace.
- Match lint/prettier config; the change must pass `pnpm lint` and `pnpm build` (or the repo's equivalent) with no new errors.
- No `<form>` tags or frontend changes — the UI is generated from the node's `inputs` metadata.

## Definition of done
1. The Verifier (Gate) node appears in the AgentFlow v2 node list and can be placed and connected in the editor.
2. All three modes work end to end: a schema check, a groundedness check, and an llm_judge check each route correctly to pass/fail/abstain on hand-made inputs.
3. The decision, score, and a short reason are written to flow state and visible to downstream nodes.
4. `lint` and `build` pass; no regressions in other nodes.
5. A short PR description: the problem, the three modes, the branch/threshold logic, the future conformal hook, and exactly how you tested each mode (with the sample flow or inputs you used).

## Deliverables
- The new node file(s) + icon.
- The 3–5 sentence grounding summary from Step 0.
- The PR description from item 5 above.
- A list of any assumptions you made and anywhere the real code differed from this spec.