# Optimize Buffer Window Memory to avoid loading the full chat history

## Problem

Flowise's **Buffer Window Memory** is configured with a window size and only uses
the most recent portion of a conversation as memory. Today, every time it builds
that memory the cost scales with the *entire* stored conversation for the session,
even though only a small, fixed-size window is ever actually surfaced.

As a conversation grows, the amount of data read and processed grows with it —
even though the window is fixed. On long conversations this causes avoidable
database load, memory pressure, and latency that gets worse the longer the
conversation runs.

## Expected behavior

Building the windowed memory must perform an amount of work that is bounded by the
window size and independent of how many messages the session has accumulated. The
cost of obtaining the window must be governed by the window size, not by the total
number of stored messages for the session.

The resulting window must also be **deterministic**. The chat store orders messages
by their creation time, but creation time is not guaranteed to be unique — messages
can be persisted with identical timestamps. The surfaced window must therefore have
stable membership and a stable ordering: repeated calls must return the same
messages in the same order, and the result must not depend on the arbitrary order in
which the storage layer happens to return rows that share a creation time.

At the same time, all existing observable behavior of the memory must be preserved:

- For conversations whose messages have distinct creation times, the same messages
  are surfaced, in the same chronological order, as before the change.
- The configured window size continues to determine how much of the conversation
  is surfaced, including its existing handling of edge cases (for example, an
  empty window, or no resolvable session).
- Anything that is merged into the surfaced memory, and every output format the
  memory can return, behaves exactly as it does today.

## Scope & constraints

- Confine the change to the Buffer Window Memory component. Do not alter other
  memory types or the underlying storage schema.
- Do not change the component's public configuration, its identity, or what it
  returns to callers.
- The cost of retrieving the window must be governed by the window size, not by
  the total number of stored messages for the session.
- The project must type-check and build cleanly; introduce no new dependencies;
  no lint or build regressions.
