# quanle_FlowiseAI__bufferwindow-memory-perf-ba6a089d-v2

## Description
SWE-Bench Pro task for FlowiseAI/Flowise — TypeScript.

**Category:** Performance Optimization

The Buffer Window Memory node loads the entire conversation history from the
database on every call and then slices it down to the last `k * 2` messages in
application memory, so its cost grows linearly with conversation length. The task
is to make retrieval bounded by the window size `k` (fetch only the messages
actually needed) while preserving the exact observable behavior of
`getChatMessages(...)`.

The window must also be **deterministic**: `createdDate` is not unique (messages
can be persisted with identical timestamps), so ordering by it alone is not a
total order. A naive `ORDER BY createdDate DESC LIMIT k*2` lets the store pick
rows arbitrarily among equal timestamps, so the correct fix must impose a stable
total order (createdDate paired with the primary key) before the limit is applied.

- **Target file:** `packages/components/nodes/memory/BufferWindowMemory/BufferWindowMemory.ts`
- **Base commit:** `ba6a089d2bac19f5c07e8378e78bfd1af5d66019`
- **Tests:** `packages/components/nodes/memory/BufferWindowMemory/bufferWindowMemory.test.ts`
  - 4 `fail_to_pass` (3 bounded-query / constant-cost assertions + 1 deterministic-window assertion under tied timestamps)
  - 5 `pass_to_pass` (behavior-preserved regression guards)

## Recall-hardening note
The naive "fetch last N rows" pattern (`order DESC` + `take: k*2` + `reverse`) is a
canonical, training-recallable idiom. To raise novelty, the spec adds a second,
non-obvious requirement: because `id` is a random UUID and `createdDate` is the only
time column, `createdDate` alone is **not a total order**, so the window must add a
deterministic tiebreak (`order: { createdDate: 'DESC', id: 'DESC' }`). The
`produces a deterministic window when messages share a createdDate` test seeds a
tied-timestamp group straddling the window boundary (stored out of id order), so the
naive `createdDate`-only query is caught on **membership**, not just intra-group order
— it cannot be salvaged by re-sorting in application memory. This composition
(bounded query + stable total order) downgrades recall risk from HIGH toward MEDIUM.

## Completion Rates
<!-- TODO: Fill in after calibration runs -->

## Model Analysis
<!-- TODO: Fill in after calibration runs -->

## Anti-Cheating Analysis
<!-- TODO: Fill in after calibration runs -->
