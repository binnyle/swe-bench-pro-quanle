# Build a Verifier/Gate Node for Flowise

## What to build

A new Flowise **AgentFlow** node called **Verifier** that takes an upstream output, runs a verification check, and routes the flow to **one of three branches** — **Pass**, **Abstain**, or **Fail** — based on the result.

The node must support **three verification modes**, selectable via a `mode` input. **All three are required** — a submission that implements only some of them is incomplete:

- **`schema`** — validate the output against a provided JSON schema. No model call.
- **`groundedness`** — check that the output's claims are supported by a supplied context, using a deterministic check. No model call.
- **`llm_judge`** — call a configurable judge model that returns a `0–1` score for faithfulness/relevance. (Default mode.)

How each check is implemented internally is up to you — what matters is the observable behavior and output contract below.

## Why

Flowise lets users build LLM workflows visually, but there's no primitive to verify the quality of an upstream output before the flow continues. Bad outputs pass through unchecked — costly where wrong answers matter. This node adds the ability to accept, reject, or abstain on an output before it propagates.

## Inputs

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| `mode` | enum: `schema`, `groundedness`, `llm_judge` | `llm_judge` | |
| `inputToCheck` | string/variable | — | Upstream output to evaluate |
| `context` | string/variable | — | Reference context (used by `groundedness`) |
| `schema` | JSON | — | Shown only when `mode = schema` |
| `judgeModel` | chat model connection | — | Shown only when `mode = llm_judge` |
| `passThreshold` | number 0–1 | 0.7 | |
| `abstainThreshold` | number 0–1 | 0.4 | |
| `onError` | enum: `fail`, `abstain` | `abstain` | How to route if the check itself errors |

## Routing

Each mode produces a numeric `score` in `[0, 1]`, routed to exactly one branch:


score >= passThreshold → PASS (output accepted, continue) abstainThreshold <= score < passThreshold → ABSTAIN (confidence too low, escalate) score < abstainThreshold → FAIL (output rejected, retry/fallback)


## Per-mode behavior

### `schema`
- `inputToCheck` is parsed as JSON and validated against the `schema` JSON. Validation checks **both** required fields **and** declared property types (e.g. a field typed `number` must be a number).
- Valid → `score 1.0` (Pass). Invalid → `score 0.0` (Fail).
- `reason` must name the cause of failure so it is actionable: include the **missing/mismatched field name** when a field is missing or has the wrong type, and the phrase **`not valid JSON`** when `inputToCheck` cannot be parsed as JSON.
- If no `schema` is provided → `fail`, `score 0`.

### `groundedness`
- Deterministically compare `inputToCheck` against `context`. Output well-supported by the context → high score (Pass band); unsupported or contradicted → low score (Fail/Abstain band).
- If no `context` is provided, or `inputToCheck` is empty → `fail`, `score 0`.

### `llm_judge`
- Call the configured `judgeModel`; parse a numeric `score` in `[0, 1]` and a `reason` from its response. The returned score is routed through the normal threshold logic.
- Implement the judge-model call in a **separate async method named `checkLLMJudge()`** that returns `{ score, reason }`, so the network path can be tested in isolation.
- If no `judgeModel` is configured (or the call fails), treat it as an error (see Error handling).

## Expected output (return contract)

`run(...)` must resolve to an object `{ id, name, input, output, state }`:

- `name` equals the node's `name` (`verifierAgentflow`).
- `output` is `{ conditions, decision, score, reason }`:
  - `decision` ∈ `pass | abstain | fail`
  - `score` ∈ `[0, 1]`
  - `reason` — human-readable string explaining the decision
  - `conditions` — an array of **exactly three** entries, one per branch, each `{ type: 'pass' | 'abstain' | 'fail', isFulfilled: boolean }`. **Exactly one** has `isFulfilled: true`, matching `decision`. (Mirrors the existing Condition / ConditionAgentflow nodes.)
- `state` — the updated flow state: write `verifier_decision`, `verifier_score`, and `verifier_reason`, **preserving all pre-existing keys**.

## Error handling

If the selected mode throws (including `llm_judge` with no model configured), set `score = 0`, set `reason` to a message containing the word `"error"`, and route according to `onError` (default `abstain`).

## Node identity & registration

| Property | Value |
|----------|-------|
| `name` | `verifierAgentflow` |
| `category` | `Agent Flows` |
| `type` | `Verifier` |
| Output labels | `Pass`, `Abstain`, `Fail` (in that order) |

Export the node class as **`nodeClass`** from the node module (NodesPool convention).

## Constraints

- TypeScript, matching existing AgentFlow node conventions (input metadata for UI generation, `loadMethods`, `updateFlowState`).
- No frontend changes — UI is generated from node input metadata.
- New file must type-check and build cleanly; no new heavy dependencies.
- Must pass lint and build with no regressions.
