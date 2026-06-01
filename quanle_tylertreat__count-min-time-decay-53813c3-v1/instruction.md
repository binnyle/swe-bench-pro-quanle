# Add Time-Decay Support to Count-Min Sketch

## Problem

The Count-Min Sketch currently tracks cumulative event frequencies with no notion of
time. For streaming applications where recent events are more relevant than old ones
(e.g., trending topic detection, rate limiting), we need frequency estimates that
naturally decay over time.

## Requirements

1. Add a new constructor that accepts a decay rate parameter (a `time.Duration`
   half-life). The existing `NewCountMinSketch` constructor must continue to work
   unchanged (no decay = legacy behavior).

2. `Add()` and `AddN()` must account for elapsed time since the last operation on
   the sketch, applying appropriate decay to existing counts before incrementing.
   New items added after decay should reflect their full count, not a decayed value.

3. `Count()` must return the time-adjusted frequency estimate, not the raw
   accumulated count.

4. `Merge()` must correctly combine two decayed sketches, even when they have
   different "last updated" times. Merging two sketches with different decay rates
   must return an error.

5. A new `Decay()` method must allow explicit manual decay application (useful for
   batch processing). It must return the sketch to allow method chaining.

6. Serialization (`WriteDataTo`/`ReadDataFrom`) must preserve decay state so that a
   deserialized sketch produces the same counts as the original.

7. `TotalCount()` must reflect decayed counts.

## Constraints

- Memory overhead for decay tracking should be O(1) additional space (not per-cell).
- Decay must use an exponential model: `count * e^(-λt)` where `λ = ln(2)/half_life`.
- When converting decayed float values back to uint64 counters, use rounding (not
   truncation) to avoid losing counts from tiny time deltas.
- When decay rate is 0 (or half-life is 0), behavior must be identical to the
   existing implementation.
