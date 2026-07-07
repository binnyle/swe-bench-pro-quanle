# quanle_FlowiseAI__disable-node-ba6a089d-v1

## Description
SWE-Bench Pro task for FlowiseAI/Flowise — TypeScript. Implement `removeDisabledNodes`:
remove disabled nodes from a flow and reconnect the graph (rerouting edges with
handle preservation, type-compatible connections only, de-duplication) plus rewire
cross-node `{{ }}` references. Current suite: **33 `fail_to_pass` tests**.

## Completion Rates

Measured on the current hardened 33-test suite:

| Model | Pass Rate | Suite |
|-------|-----------|-------|
| Oracle | 33/33 (100%) | 33-test (current) |
| Avocado | 0/5 (0%) | 33-test (current) |
| Opus 4.6 | 5/5 (100%) | 25-test (pre-hardening) — not re-measured |
| GPT-5.5 (codex) | 5/5 (100%) | 25-test (pre-hardening) — not re-measured |

> **Note:** The suite was hardened from the original **25 → 33** `fail_to_pass` tests,
> adding convergent-reroute deduplication (by full edge identity), multi-hop handle
> preservation, type-compatible rerouting, and cross-node reference rewiring. Oracle
> and Avocado were re-measured on the 33-test suite; the Opus/GPT rates above predate
> hardening and are not yet re-measured on the current suite.
>
> The Avocado 0/5 was confirmed against the **clarified, fully-specified** instruction
> (type-compatibility, reference-rewiring, and dedup-identity rules all stated, plus the
> required export location). Every trial exports the function and passes the structural
> cases; failures are genuine logic gaps, not setup or location-guessing artifacts. The
> task is therefore both spec-fair (AI assessment: Accept) and hard for Avocado.

## Model Analysis

### Oracle
33/33 passed. Reference solution is stable.

### Avocado
0/5 passed on the 33-test suite. Avocado writes a correct general graph-rewrite
(all structural cases — chains, fan-in/out, diamonds, disconnected components — pass
in every trial) but consistently fails the semantic dimensions added during hardening.

### Dominant Failure Modes (Avocado, current suite)

| Failure Mode | Trials Affected | Note |
|-------------|-----------------|------|
| Type-compatible rerouting (drops incompatible / only type-matching pairs) | 5/5 | Connects mismatched types despite the spec stating the rule — doesn't derive types from handles |
| Cross-node reference rewiring (drop `{{id.data.instance}}` when no upstream) | 2/5 | Handles the repoint case but not the empty-when-no-upstream case |
| Broader rerouting bug (core reroute/chain cases) | 1/5 | One trial's solution mishandled basic middle/chain/fan rerouting |

These reflect reasoning gaps, not setup issues:
- **Type compatibility.** Reconnecting neighbours across a removed node must respect
  endpoint types (encoded in the handle); a naive solution emits every source→target
  pair, including type-invalid ones. This is the dominant, repeated failure.
- **Reference rewiring.** A surviving node's input may reference a disabled node's
  output by name; a pure edge/graph transform never inspects input fields, so the
  dead reference survives.
- **Dedup identity.** Two connections are the same only when source, target, and
  *both* handles match; collapsing on source/target alone drops legitimately distinct
  parallel edges.

## Anti-Cheating Analysis

- **Hardcoded outputs**: The 33 `fail_to_pass` tests use many distinct graph topologies (single/multiple disabled nodes, branching fan-in/fan-out, three-way fan-in, diamond, multi-input Tools+LLM+Memory, disconnected subgraphs, type-mixed hubs, reference chains) with per-case expected node/edge sets, so a lookup keyed to test names cannot pass without implementing the real transformation.
- **Overfitting to visible tests**: Assertions check the resulting `nodes` and `edges` arrays — including exact `source`/`target`, `sourceHandle`/`targetHandle`, and rewritten input references — so passing requires correct graph reconstruction rather than pattern-matching test names.
- **Modifying test files**: The test suite (`packages/server/src/disableNode.test.ts`) is applied by the Codimango harness as the `test_patch` at grading time and is not part of the agent's writable workspace, so the agent cannot alter assertions.
- **Bypassing intended solution path**: Tests verify the full transformed graph (which nodes are removed, how every edge is rerouted with handles preserved and types respected, and how references are rewired), so short-circuiting the traversal or dropping handle/reference metadata is detected.
- **Git-history leakage**: `environment/Dockerfile` strips `/app/.git` after build, so the agent cannot inspect commits past the pinned base `ba6a089d…` to recover a reference implementation.
- **Public-issue overlap**: The concept overlaps FlowiseAI issue #3635 (a "disable node" feature request), but no upstream implementation of the `removeDisabledNodes` function or this test suite exists; the solution is original and custom-authored, so the overlap is conceptual only.
