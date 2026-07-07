# Support disabling individual nodes

## Problem

Implement a function to exclude a node from the flow. A node can be marked as disabled. When the flow runs,
that node must be treated as if it were not part of the flow, while the rest of the flow continues to run as a single connected whole.

## Goal

Add and export a function named removeDisabledNodes that removes the
disabled nodes and returns the resulting nodes and edges.

- The enabled nodes should work the same way. If remove the disabled nodes, every remaining node should still get the same inputs and produce the same outputs as before, the flow must not change.

- Disabled nodes are ignore and data can pass through. data that was flowing into it should now flow directly to wherever it was going out of it. If there are nodes before and after it, the before should be connected to the after.

- After cleanup, there should be zero trace of any disabled node ensure there are no leftover edges pointing at them, no references to their outputs inside other nodes' inputs. If removing them would leave a broken connection for example a dangling link, a type mismatch, or a duplicate wire, fix it so the flow still works.

- If the disabled node is between two node that are not the same type, drop them. Only re-connect nodes that are the same type

- If there are node that used the disabled node output, use the output from the previous node that are the same type. If the disabled node had nothing feeding it, remove the reference entirely.

- Two connections count as the same only if they share the start node, the end node, and both ports. If two connections go
to the same node but through different ports, keep both

## Constraints

- Add the disable behaviour above; do not change unrelated behaviour.
- Flows that contain no disabled nodes must produce exactly the same output as
before this change.
- Introduce no new dependencies. The project must work properly like before
- Add and export a function named removeDisabledNodes that removes the disabled nodes and returns the resulting nodes and edges.
