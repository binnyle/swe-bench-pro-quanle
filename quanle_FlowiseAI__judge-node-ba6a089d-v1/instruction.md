# Build a Verifier/Gate Node for Flowise

## Problem

Flowise lets users build LLM workflows visually, but there's no way to verify the quality of an upstream output before the flow continues. Bad outputs pass through unchecked — a problem in deployments where wrong answers are costly. There's no primitive for evaluating correctness, groundedness, or safety, and no way to abstain when confidence is too low.

## Feature: Verifier (Gate) Node

A new node that evaluates upstream output and routes to one of three branches based on the result.

### Verification Modes

| Mode | What it does | Model call? |
|------|-------------|-------------|
| `schema` | Validates output against a JSON schema / required-fields rule | No |
| `groundedness` | Checks that claims in the output are supported by supplied context (deterministic containment/overlap) | No |
| `llm_judge` | Calls a configurable judge model that returns a 0–1 score for faithfulness/relevance | Yes |

### Routing Logic

The node compares the verification score against two thresholds and routes to exactly one branch:

```
score >= passThreshold       → PASS    (output accepted, continue)
abstainThreshold <= score < passThreshold → ABSTAIN (confidence too low, escalate)
score < abstainThreshold     → FAIL    (output rejected, retry/fallback)
```

For `schema` and `groundedness` modes (binary results), map: valid → score 1.0, invalid → score 0.0.

### Node Inputs

| Input | Type | Default | Notes |
|-------|------|---------|-------|
| `mode` | enum: `schema`, `groundedness`, `llm_judge` | `llm_judge` | |
| `inputToCheck` | string/variable | — | Upstream field to evaluate |
| `context` | string/variable | — | Reference context (used by `groundedness`) |
| `schema` | JSON | — | Shown only when `mode = schema` |
| `judgeModel` | chat model connection | — | Shown only when `mode = llm_judge` |
| `passThreshold` | number 0–1 | 0.7 | |
| `abstainThreshold` | number 0–1 | 0.4 | |
| `onError` | enum: `fail`, `abstain` | `abstain` | How to route if the check itself errors |

### Output

- Routes to one of three output branches: **pass**, **fail**, **abstain**
- Writes decision, score, and reason to flow state for downstream nodes

## Constraints

- TypeScript, matching existing node conventions
- No frontend changes — UI generated from node input metadata
- No new heavy dependencies
- Must pass lint and build with no regressions

## Definition of Done

1. All three modes route correctly to pass/fail/abstain on test inputs
2. Decision, score, and reason are readable by downstream nodes
3. Lint and build pass cleanly

## Future (Out of Scope)

- `conformal` calibration mode (threshold derived from a held-out calibration set) — design should accommodate this without restructuring
