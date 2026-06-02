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

2. `Add()` and `AddN()` must account for elapsed time, applying appropriate decay
   to existing counts before incrementing.

3. `Count()` must return the time-adjusted frequency estimate, not the raw
   accumulated count.

4. `Merge()` must correctly combine two decayed sketches, even when they have
   different "last updated" times. Merging two sketches with different decay rates
   must return an error.

5. A new `Decay()` method must allow explicit manual decay application (useful for
   batch processing).

6. Serialization (`WriteDataTo`/`ReadDataFrom`) must preserve decay state so that a
   deserialized sketch produces the same counts as the original.

7. `TotalCount()` must reflect decayed counts.

8. A new `Subtract(other *CountMinSketch) error` method must compute the per-cell
difference between this sketch and another. Cells that would underflow to negative
values must be clamped to zero. The sketches must have matching dimensions and
decay rates (return an error otherwise). After subtraction, `TotalCount()` must be
recomputed from the matrix, not from the stored count field.

9. A new `CountDiff(data []byte, other *CountMinSketch) int64` method must return the
signed frequency difference for a specific element between this sketch and another.
The difference must be computed per-cell (subtract corresponding cells) then take
the minimum across rows — NOT by subtracting the two Count() results.

## Constraints

- Decay must use an exponential model with the half-life parameter determining how
   quickly counts diminish.
- When decay rate is 0 (or half-life is 0), behavior must be identical to the
   existing implementation.
