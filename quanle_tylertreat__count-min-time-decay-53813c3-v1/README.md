# Count-Min Sketch Time-Decay — SWE-Bench Pro Task

## Description

Add time-decay support to the Count-Min Sketch implementation in the BoomFilters Go library. The existing CMS tracks cumulative event frequencies with no notion of time. This task requires implementing exponential decay (count * e^(-λt)) so that frequency estimates naturally decrease over time, enabling streaming use cases like trending topic detection and rate limiting. The agent must modify the existing `countmin.go` to add a new constructor, decay-aware Add/Count/Merge/Serialize methods, and an explicit Decay() method — all while maintaining full backward compatibility with the existing API.

A naive approach that only applies decay in Count() will fail the Add-after-decay test (new items must be counted at full value). The agent must correctly apply decay before incrementing counters, handle merge of sketches with different timestamps, and preserve decay state through serialization.

## Completion Rates

| Model | Pass Rate |
|-------|-----------|
| Oracle | 3/3 (100%) |
| GPT-5.5 (codex) | 5/5 (100%) |
| Avocado | 2/5 (40%) |
| Opus 4.6 | 0/5 (0%) |

## Model Analysis

### Oracle
3/3 passed. Reference solution is stable.

### GPT-5.5 (codex)
5/5 passed. Consistently matched the required API surface and decay semantics.

### Avocado
2/5 passed, 3/5 failed.

### Opus 4.6
0/5 passed.

### Dominant Failure Mode — API-surface mismatch (Go build failure)

Across every failing Opus trial and all 3 failing Avocado trials, the verifier reports
`Missing tests: [all]` — i.e. the Go **test package failed to compile**, so no test ran.
In Go, one undefined symbol referenced by the test file fails the whole package build.
The mismatch is in the new API surface the tests reference:

| Symbol the test needs | What failing models produced |
|-----------------------|------------------------------|
| `NewCountMinSketchWithDecay(...)` constructor | a differently-named constructor → `undefined: NewCountMinSketchWithDecay` |
| `Decay()` returning a value | `Decay()` written as a void mutator → signature mismatch |

This reflects a **specification-clarity gap, not a reasoning gap**: the instruction says
"add a new constructor" and "a new `Decay()` method" without pinning the exact constructor
name or the `Decay()` return signature. GPT-5.5 and the passing Avocado trials happened to
pick the idiomatic `New<Type>With<Option>` name; Opus consistently did not, and a single
name mismatch zeroes the whole suite. The remedy is to state the exact constructor name
(and `Decay()`'s return) in the spec — see the instruction's Requirements 1 and 5.

## Anti-Cheating Analysis

- **Hardcoded outputs**: Not possible — tests use time.Sleep with real clocks, so exact counts depend on actual elapsed time with tolerance ranges.
- **Overfitting to visible tests**: 18 fail_to_pass tests cover constructor, decay math, add-after-decay, merge, subtract/underflow clamping, per-cell CountDiff, serialization, and backward compatibility. 7 pass_to_pass tests verify existing CMS behavior is unchanged.
- **Modifying test files**: Tests are mounted read-only by the Harbor harness.
- **Bypassing the solution**: Tests exercise the actual CMS data structure operations (Add, Count, Merge, Serialize) — not file artifacts.
