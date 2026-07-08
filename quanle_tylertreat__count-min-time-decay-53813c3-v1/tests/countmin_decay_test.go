package boom

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

// TestNewCountMinSketchWithDecay ensures the decay constructor creates a working sketch.
func TestNewCountMinSketchWithDecay(t *testing.T) {
	halfLife := 10 * time.Second
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

	// Verify it works by adding and counting
	cms.Add([]byte("test"))
	if count := cms.Count([]byte("test")); count < 1 {
		t.Errorf("expected >= 1, got %d", count)
	}
}

// TestZeroDecayBehavior ensures that zero half-life produces identical behavior
// to the original constructor.
func TestZeroDecayBehavior(t *testing.T) {
	cms := NewCountMinSketchWithDecay(0.001, 0.99, 0)

	cms.Add([]byte("a"))
	cms.Add([]byte("a"))
	cms.Add([]byte("b"))

	if count := cms.Count([]byte("a")); count != 2 {
		t.Errorf("expected 2, got %d", count)
	}

	if count := cms.Count([]byte("b")); count != 1 {
		t.Errorf("expected 1, got %d", count)
	}

	if total := cms.TotalCount(); total != 3 {
		t.Errorf("expected 3, got %d", total)
	}
}

// TestDecayReducesCounts ensures counts halve after exactly one half-life.
// Uses an injected deterministic clock (no real sleep) so the result is exact.
func TestDecayReducesCounts(t *testing.T) {
	halfLife := 1 * time.Second
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	base := time.Unix(1000000, 0)
	now := base
	cms.timeFunc = func() time.Time { return now }
	cms.lastDecay = base

	cms.AddN([]byte("a"), 1000)
	if count := cms.Count([]byte("a")); count != 1000 {
		t.Errorf("expected 1000 before any elapsed time, got %d", count)
	}

	// Advance exactly one half-life: count must be exactly 1000 * 0.5 = 500.
	now = base.Add(halfLife)
	if count := cms.Count([]byte("a")); count != 500 {
		t.Errorf("expected exactly 500 after one half-life, got %d", count)
	}
}

// TestDecayAfterTwoHalfLives ensures counts quarter after two half-lives (exact,
// injected clock).
func TestDecayAfterTwoHalfLives(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	base := time.Unix(1000000, 0)
	now := base
	cms.timeFunc = func() time.Time { return now }
	cms.lastDecay = base

	cms.AddN([]byte("x"), 1000)

	// Advance two half-lives in one step: 1000 * exp(-2ln2) = 1000 * 0.25 = 250.
	now = base.Add(2 * halfLife)
	count := cms.Count([]byte("x"))
	if count != 250 {
		t.Errorf("expected exactly 250 after two half-lives, got %d", count)
	}
}

// TestAddAfterDecay ensures new items are counted at full value after decay
// (exact, injected clock): decay must be applied BEFORE the increment.
func TestAddAfterDecay(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	base := time.Unix(1000000, 0)
	now := base
	cms.timeFunc = func() time.Time { return now }
	cms.lastDecay = base

	cms.AddN([]byte("old"), 1000)

	// Advance one half-life, then add a new item. The AddN must decay "old"
	// (1000 -> 500) before adding "new" at full value (100).
	now = base.Add(halfLife)
	cms.AddN([]byte("new"), 100)

	if oldCount := cms.Count([]byte("old")); oldCount != 500 {
		t.Errorf("expected exactly 500 for old item, got %d", oldCount)
	}
	if newCount := cms.Count([]byte("new")); newCount != 100 {
		t.Errorf("expected exactly 100 for new item (added after decay), got %d", newCount)
	}
}

// TestDecayMethod ensures explicit Decay() works and returns self (exact,
// injected clock).
func TestDecayMethod(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	base := time.Unix(1000000, 0)
	now := base
	cms.timeFunc = func() time.Time { return now }
	cms.lastDecay = base

	cms.AddN([]byte("a"), 1000)

	now = base.Add(halfLife)
	result := cms.Decay()

	// Should return self for chaining
	if result != cms {
		t.Error("Decay should return the same instance")
	}

	count := cms.Count([]byte("a"))
	if count != 500 {
		t.Errorf("expected exactly 500 after explicit decay, got %d", count)
	}
}

// TestTotalCountDecays ensures TotalCount reflects decay (exact, injected clock).
func TestTotalCountDecays(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	base := time.Unix(1000000, 0)
	now := base
	cms.timeFunc = func() time.Time { return now }
	cms.lastDecay = base

	cms.AddN([]byte("a"), 1000)

	if total := cms.TotalCount(); total != 1000 {
		t.Errorf("expected 1000 before any elapsed time, got %d", total)
	}

	now = base.Add(halfLife)
	if total := cms.TotalCount(); total != 500 {
		t.Errorf("expected exactly 500 total after one half-life, got %d", total)
	}
}

// TestMergeDecayedSketches ensures merge decays both sketches first (exact,
// injected clock): 500 + 500 = 1000.
func TestMergeDecayedSketches(t *testing.T) {
	halfLife := 500 * time.Millisecond
	base := time.Unix(1000000, 0)
	now := base
	clock := func() time.Time { return now }

	cms1 := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	cms1.timeFunc = clock
	cms1.lastDecay = base
	cms2 := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	cms2.timeFunc = clock
	cms2.lastDecay = base

	cms1.AddN([]byte("a"), 1000)
	cms2.AddN([]byte("a"), 1000)

	// Advance one half-life: Merge decays each (1000 -> 500) then sums -> 1000.
	now = base.Add(halfLife)
	if err := cms1.Merge(cms2); err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	count := cms1.Count([]byte("a"))
	if count != 1000 {
		t.Errorf("expected exactly 1000 after merging two decayed sketches, got %d", count)
	}
}

// TestMergeDecayRateMismatch ensures merge fails when decay rates differ.
func TestMergeDecayRateMismatch(t *testing.T) {
	cms1 := NewCountMinSketchWithDecay(0.001, 0.99, 1*time.Second)
	cms2 := NewCountMinSketchWithDecay(0.001, 0.99, 2*time.Second)

	err := cms1.Merge(cms2)
	if err == nil {
		t.Error("expected error when merging sketches with different decay rates")
	}
}

// TestSerializationWithDecay ensures decay state survives serialization.
func TestSerializationWithDecay(t *testing.T) {
	halfLife := 10 * time.Second
	base := time.Unix(1000000, 0)

	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	cms.timeFunc = func() time.Time { return base }
	cms.lastDecay = base
	cms.AddN([]byte("a"), 1000)

	// Serialize
	buf := new(bytes.Buffer)
	_, err := cms.WriteDataTo(buf)
	if err != nil {
		t.Fatalf("WriteDataTo error: %v", err)
	}

	// Deserialize into new sketch
	cms2 := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	_, err = cms2.ReadDataFrom(buf)
	if err != nil {
		t.Fatalf("ReadDataFrom error: %v", err)
	}

	// Freeze the deserialized sketch's clock at the restored last-decay time so no
	// time elapses: the count must match the original exactly (state preserved).
	cms2.timeFunc = func() time.Time { return base }
	if count := cms2.Count([]byte("a")); count != 1000 {
		t.Errorf("expected exactly 1000 after deserialization, got %d", count)
	}
}

// TestSubtractBasic ensures Subtract computes per-cell differences with clamping.
func TestSubtractBasic(t *testing.T) {
	cms1 := NewCountMinSketch(0.001, 0.99)
	cms2 := NewCountMinSketch(0.001, 0.99)

	cms1.AddN([]byte("a"), 100)
	cms1.AddN([]byte("b"), 50)
	cms2.AddN([]byte("a"), 30)
	cms2.AddN([]byte("b"), 80)

	err := cms1.Subtract(cms2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	countA := cms1.Count([]byte("a"))
	if countA < 60 || countA > 80 {
		t.Errorf("expected ~70 for 'a' after subtract, got %d", countA)
	}

	countB := cms1.Count([]byte("b"))
	if countB > 5 {
		t.Errorf("expected ~0 for 'b' after subtract (clamped), got %d", countB)
	}
}

// TestSubtractRecomputesCount ensures TotalCount is recomputed from matrix after Subtract.
func TestSubtractRecomputesCount(t *testing.T) {
	cms1 := NewCountMinSketch(0.001, 0.99)
	cms2 := NewCountMinSketch(0.001, 0.99)

	cms1.AddN([]byte("x"), 1000)
	cms2.AddN([]byte("x"), 400)

	err := cms1.Subtract(cms2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Only "x" was added (1000 - 400), so every row's single non-zero cell holds
	// 600 and each row sum is exactly 600 -> min row sum = 600. TotalCount must be
	// recomputed from the matrix, so this is exact, not a wide range.
	total := cms1.TotalCount()
	if total != 600 {
		t.Errorf("expected TotalCount exactly 600 (recomputed from matrix), got %d", total)
	}
}

// TestSubtractDimensionMismatch ensures Subtract returns error for mismatched dimensions.
func TestSubtractDimensionMismatch(t *testing.T) {
	cms1 := NewCountMinSketch(0.001, 0.99)
	cms2 := NewCountMinSketch(0.01, 0.99)

	err := cms1.Subtract(cms2)
	if err == nil {
		t.Error("expected error for dimension mismatch")
	}
	if err != nil && !strings.Contains(err.Error(), "width") && !strings.Contains(err.Error(), "depth") && !strings.Contains(err.Error(), "match") && !strings.Contains(err.Error(), "dimension") {
		t.Errorf("error should mention dimension mismatch, got: %v", err)
	}
}

// TestSubtractDecayRateMismatch ensures Subtract returns error for different decay rates.
func TestSubtractDecayRateMismatch(t *testing.T) {
	cms1 := NewCountMinSketchWithDecay(0.001, 0.99, 1*time.Second)
	cms2 := NewCountMinSketchWithDecay(0.001, 0.99, 2*time.Second)

	err := cms1.Subtract(cms2)
	if err == nil {
		t.Error("expected error for decay rate mismatch")
	}
	if err != nil && !strings.Contains(err.Error(), "decay") && !strings.Contains(err.Error(), "rate") && !strings.Contains(err.Error(), "match") {
		t.Errorf("error should mention decay rate mismatch, got: %v", err)
	}
}

// TestCountDiffBasic ensures CountDiff returns correct signed per-cell differences.
func TestCountDiffBasic(t *testing.T) {
	cms1 := NewCountMinSketch(0.001, 0.99)
	cms2 := NewCountMinSketch(0.001, 0.99)

	cms1.AddN([]byte("a"), 100)
	cms2.AddN([]byte("a"), 30)

	diff := cms1.CountDiff([]byte("a"), cms2)
	if diff < 60 || diff > 80 {
		t.Errorf("expected ~70 diff, got %d", diff)
	}
}

// TestCountDiffNegative ensures CountDiff returns negative when other has more.
func TestCountDiffNegative(t *testing.T) {
	cms1 := NewCountMinSketch(0.001, 0.99)
	cms2 := NewCountMinSketch(0.001, 0.99)

	cms1.AddN([]byte("a"), 30)
	cms2.AddN([]byte("a"), 100)

	diff := cms1.CountDiff([]byte("a"), cms2)
	if diff > -60 || diff < -80 {
		t.Errorf("expected ~-70 diff, got %d", diff)
	}
}

// TestCountDiffPerCellMinNotNaive tests the key invariant:
// CountDiff must compute per-cell differences then take the min,
// NOT subtract the two Count() results.
func TestCountDiffPerCellMinNotNaive(t *testing.T) {
	// delta=0.2 => depth=ceil(ln(1/0.2))=2. Depth >= 2 is required for
	// per-cell-min to differ from the naive Count()-Count(): with a single row
	// the two are always identical, so the previous depth=1 config (delta=0.99)
	// could not test this behavior at all.
	cms1 := NewCountMinSketch(0.001, 0.2)
	cms2 := NewCountMinSketch(0.001, 0.2)
	if cms1.depth != 2 {
		t.Fatalf("test requires depth==2 to distinguish per-cell-min from naive, got %d", cms1.depth)
	}

	// White-box: craft the target's per-row cells so the row that minimizes
	// cms1 differs from the row that minimizes cms2 — the exact case where
	// per-cell-min and diff-of-mins diverge. Both sketches share identical hash
	// construction, so the target maps to the same cell indices in each.
	target := []byte("item-250")
	lower, upper := hashKernel(target, cms1.hash)
	i0 := (uint(lower) + uint(upper)*0) % cms1.width
	i1 := (uint(lower) + uint(upper)*1) % cms1.width

	// cms1 target cells: row0=10, row1=20 -> Count1 = min = 10 (row0)
	// cms2 target cells: row0=5,  row1=1  -> Count2 = min = 1  (row1)
	cms1.matrix[0][i0] = 10
	cms1.matrix[1][i1] = 20
	cms2.matrix[0][i0] = 5
	cms2.matrix[1][i1] = 1

	countDiff := cms1.CountDiff(target, cms2)
	naiveDiff := int64(cms1.Count(target)) - int64(cms2.Count(target))

	// per-cell diffs: [10-5, 20-1] = [5, 19] -> min = 5
	if countDiff != 5 {
		t.Errorf("CountDiff (per-cell min) = %d, want 5", countDiff)
	}
	// diff-of-mins: 10 - 1 = 9; a naive implementation would return this.
	if naiveDiff != 9 {
		t.Fatalf("sanity check failed: naive Count()-Count() = %d, want 9", naiveDiff)
	}
	if countDiff == naiveDiff {
		t.Errorf("CountDiff must compute per-cell min (5), not naive Count()-Count() (%d)", naiveDiff)
	}
}

// TestLegacyConstructorUnchanged ensures NewCountMinSketch still works identically.
func TestLegacyConstructorUnchanged(t *testing.T) {
	cms := NewCountMinSketch(0.001, 0.99)

	cms.Add([]byte("a"))
	cms.Add([]byte("a"))
	cms.Add([]byte("b"))

	if count := cms.Count([]byte("a")); count != 2 {
		t.Errorf("expected 2, got %d", count)
	}

	if count := cms.Count([]byte("b")); count != 1 {
		t.Errorf("expected 1, got %d", count)
	}

	if total := cms.TotalCount(); total != 3 {
		t.Errorf("expected 3, got %d", total)
	}
}
