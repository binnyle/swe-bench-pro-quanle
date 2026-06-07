# Support disabling individual nodes

## Problem

Implement a function in the server to exclude a node from execution without deleting the node itself. A node can be marked as *disabled*. When the flow runs, that node should be treated as if it were not part of the flow, while the rest of the flow continues to run as a single connected whole.

## Expected behavior

The filtering should happen before the flow's graph is constructed, so the rest of the execution pipeline sees only enabled nodes. You should add a marker to the node's data.

Implement an extension to **disable** a node. A node is enabled by default; being disabled is an opt-in marker on the node. When a flow is executed:

1. A disabled node must be excluded from execution entirely — it is not initialized, it produces no output, and it never appears in the set of nodes that execute.

2. Removing a disabled node must not break the chain. Each node that fed into a disabled node should be re-routed to all the nodes that the disabled node fed into.

3. If a disabled node feeds into another disabled node, the rerouting continues through them.

4. If a disabled node was a starting point of the flow (nothing fed into it), the node(s) it fed into become a starting point.

5. If the disabled node was the flow's final node, the final node is now the upstream node(s).

6. When nothing is disabled, the flow should work as expected.

## Constraints

- Add the disable behavior above; do not change unrelated behavior.
- Flows that contain no disabled nodes must produce exactly the same output as before this change.
- Introduce no new dependencies. The project must type-check, build, and lint cleanly with no regressions.
- Add and **export** a function named exactly `removeDisabledNodes` from
`packages/server/src/utils/index.ts`.
