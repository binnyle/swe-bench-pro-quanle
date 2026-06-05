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

- **Target file:** `packages/components/nodes/memory/BufferWindowMemory/BufferWindowMemory.ts`
- **Base commit:** `ba6a089d2bac19f5c07e8378e78bfd1af5d66019`
- **Tests:** `packages/components/nodes/memory/BufferWindowMemory/bufferWindowMemory.test.ts`
  - 3 `fail_to_pass` (bounded-query / constant-cost assertions)
  - 4 `pass_to_pass` (behavior-preserved regression guards)

## Completion Rates
<!-- TODO: Fill in after calibration runs -->

## Model Analysis
<!-- TODO: Fill in after calibration runs -->

## Anti-Cheating Analysis
<!-- TODO: Fill in after calibration runs -->
