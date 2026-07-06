# Support disabling individual nodes

## Problem

Implement a function in the server to exclude a node from execution without
deleting the node itself. A node can be marked as *disabled*. When the flow runs,
that node must be treated as if it were not part of the flow, while the rest of
the flow continues to run as a single connected whole.

## Goal

The filtering runs before the flow's graph is constructed, so the rest of the
execution pipeline sees only enabled nodes.

Add and **export** a function named exactly `removeDisabledNodes` that removes the
disabled nodes and returns the resulting `{ nodes, edges }`. The transformation
must satisfy one invariant:

Removing the disabled nodes must leave a flow that executes identically for
every enabled node. A disabled node behaves as if it were transparent: every
enabled node must end up receiving exactly the inputs it would have received had
the disabled nodes been replaced by direct connections between their enabled
neighbours — whether those inputs arrive through **edges** or through
**references to other nodes' output inside a node's own input fields**. After the
transformation, a disabled node must appear nowhere: not among the executed
nodes, not in any edge, and not in the resolved inputs of any surviving node. Any
connection that would become invalid as a result (pointing at a removed node,
type-incompatible, or duplicated) must be resolved so the flow still runs.

## Constraints

- Add the disable behaviour above; do not change unrelated behaviour.
- Flows that contain no disabled nodes must produce exactly the same output as
before this change.
- Introduce no new dependencies. The project must type-check, build, and lint
cleanly with no regressions.
