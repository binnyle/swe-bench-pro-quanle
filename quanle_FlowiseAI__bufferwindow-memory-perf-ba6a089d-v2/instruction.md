# Optimize Buffer Window Memory to avoid loading the full chat history

## Problem

Flowise's **Buffer Window Memory** is configured with a window size and only uses
the most recent portion of a conversation as memory. Today, every time it builds
that memory it reads the entire stored conversation for the session and then
discards everything that falls outside the window.

As a conversation grows, the amount of data read and processed grows with it —
even though only a small, fixed-size window is ever actually used. On long
conversations this causes avoidable database load, memory pressure, and latency
that gets worse the longer the conversation runs.

## Expected behavior

Building the windowed memory must perform an amount of work that is bounded by the
window size and independent of how many messages the session has accumulated.
Only the messages that fall inside the window should be fetched from storage; the
history outside the window must not be loaded merely to be thrown away.

At the same time, all existing observable behavior of the memory must be preserved
unchanged:

- The same messages are surfaced, in the same order, as before the change.
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
