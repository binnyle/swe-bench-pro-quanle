# quanle_FlowiseAI__disable-node-ba6a089d-v1

## Description
SWE-Bench Pro task for FlowiseAI/Flowise — TypeScript

## Completion Rates

| Model | Pass Rate |
|-------|-----------|
| Oracle | 3/3 (100%) |
| Opus 4.6 | 5/5 (100%) |
| GPT-5.5 (codex) | 5/5 (100%) |
| Avocado | 4/5 (80%) |

## Model Analysis

### Oracle
3/3 passed. Reference solution is stable and reproduces the expected 25 `fail_to_pass` tests.

### Opus 4.6
5/5 passed. Correctly handled all rerouting cases including handle preservation.

### GPT-5.5 (codex)
5/5 passed.

### Avocado
4/5 passed, 1/5 failed.

Failure details:
- **Trial Qyk8RFS**: `Handle preservation > rerouted edges preserve sourceHandle from upstream and targetHandle from downstream` — when rerouting an edge through a removed node (A → [disabled B] → C), the agent produced an edge with `sourceHandle=""` instead of preserving the upstream node's original handle `"A-output-model-BaseChatModel"`. All 24 other cases (basic rerouting, fan-in/fan-out, diamond, chained disabled nodes) passed; only the handle-carry-over subtlety was missed.

### Dominant Failure Modes

| Failure Mode | Models Affected | Count | % of All Failures |
|-------------|-----------------|-------|--------------------|
| Handle preservation on rerouted edges (dropped `sourceHandle`/`targetHandle`) | Avocado | 1 | 100% |

This failure reflects a reasoning gap, not a task-setup issue:
- **Handle preservation.** When a disabled node is removed and its edges rerouted, the new edge must inherit the `sourceHandle` from the *upstream* edge and the `targetHandle` from the *downstream* edge — not blank them or copy the disabled node's own handles. Models that reconstruct the connection but reset the handles to `""` produce a graph that renders/wires incorrectly in Flowise. Reproducing the exact handle strings requires reasoning about which endpoint each handle belongs to across the removed hop, which is the core difficulty of the task and the single point where the strongest metacode agent still fails.

## Anti-Cheating Analysis

- **Hardcoded outputs**: The 25 `fail_to_pass` tests use many distinct graph topologies (single/multiple disabled nodes, branching fan-in/fan-out, three-way fan-in, diamond, multi-input Tools+LLM+Memory, disconnected subgraphs) with per-case expected node/edge sets, so a lookup keyed to test names cannot pass without implementing the real rerouting algorithm.
- **Overfitting to visible tests**: Assertions check the resulting `nodes` and `edges` arrays — including exact `source`/`target` and `sourceHandle`/`targetHandle` strings — so passing requires correct graph reconstruction rather than pattern-matching test names.
- **Modifying test files**: The test suite (`packages/server/src/disableNode.test.ts`) is applied by the Codimango harness as the `test_patch` at grading time and is not part of the agent's writable workspace, so the agent cannot alter assertions.
- **Bypassing intended solution path**: Tests verify the full transformed graph (which nodes are removed and how every edge is rerouted with handles preserved), so short-circuiting the traversal or dropping handle metadata is detected.
- **Git-history leakage**: `environment/Dockerfile` strips `/app/.git` after build, so the agent cannot inspect commits past the pinned base `ba6a089d…` to recover a reference implementation.
- **Public-issue overlap**: The concept overlaps FlowiseAI issue #3635 (a "disable node" feature request), but no upstream implementation of the `removeDisabledNodes` function or this test suite exists; the solution is original and custom-authored, so the overlap is conceptual only.
