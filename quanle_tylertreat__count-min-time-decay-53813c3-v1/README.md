# Count-Min Sketch Time-Decay — SWE-Bench Pro Task

## Description

Add time-decay support to the Count-Min Sketch implementation in the BoomFilters Go library. The existing CMS tracks cumulative event frequencies with no notion of time. This task requires implementing exponential decay (count * e^(-λt)) so that frequency estimates naturally decrease over time, enabling streaming use cases like trending topic detection and rate limiting. The agent must modify the existing `countmin.go` to add a new constructor, decay-aware Add/Count/Merge/Serialize methods, and an explicit Decay() method — all while maintaining full backward compatibility with the existing API.

A naive approach that only applies decay in Count() will fail the Add-after-decay test (new items must be counted at full value). The agent must correctly apply decay before incrementing counters, handle merge of sketches with different timestamps, and preserve decay state through serialization.

## Completion Rates

| Model | Pass Rate |
|-------|-----------|
| Oracle | 1/1 |
| Avocado | TBD |
| Opus 4.6 | TBD |
| Sonnet 4.6 | TBD |

## Model Analysis

TBD — awaiting model run results.

## Anti-Cheating Analysis

- **Hardcoded outputs**: Not possible — tests use time.Sleep with real clocks, so exact counts depend on actual elapsed time with tolerance ranges.
- **Overfitting to visible tests**: 11 fail_to_pass tests cover constructor, decay math, add-after-decay, merge, serialization, and backward compatibility. 7 pass_to_pass tests verify existing CMS behavior is unchanged.
- **Modifying test files**: Tests are mounted read-only by the Harbor harness.
- **Bypassing the solution**: Tests exercise the actual CMS data structure operations (Add, Count, Merge, Serialize) — not file artifacts.
