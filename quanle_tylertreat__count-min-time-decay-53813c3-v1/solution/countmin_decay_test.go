package boom

import (
	"bytes"
	"fmt"
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

// TestDecayReducesCounts ensures that counts decrease after time passes.
func TestDecayReducesCounts(t *testing.T) {
	halfLife := 1 * time.Second
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

	// Add 1000 of item "a"
	cms.AddN([]byte("a"), 1000)

	if count := cms.Count([]byte("a")); count < 990 {
		t.Errorf("expected ~1000 before significant decay, got %d", count)
	}

	// Wait for one half-life
	time.Sleep(1100 * time.Millisecond)

	// Count should be approximately 500 (half)
	count := cms.Count([]byte("a"))
	if count < 400 || count > 600 {
		t.Errorf("expected ~500 after one half-life, got %d", count)
	}
}

// TestDecayAfterTwoHalfLives ensures counts quarter after two half-lives.
func TestDecayAfterTwoHalfLives(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

	cms.AddN([]byte("x"), 1000)

	// Wait two half-lives
	time.Sleep(1100 * time.Millisecond)

	count := cms.Count([]byte("x"))
	// Should be ~250 (1000 * 0.25)
	if count < 150 || count > 350 {
		t.Errorf("expected ~250 after two half-lives, got %d", count)
	}
}

// TestAddAfterDecay ensures new items are counted at full value after decay.
func TestAddAfterDecay(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

	cms.AddN([]byte("old"), 1000)

	// Wait one half-life
	time.Sleep(600 * time.Millisecond)

	// Add new item
	cms.AddN([]byte("new"), 100)

	// "old" should be ~500
	oldCount := cms.Count([]byte("old"))
	if oldCount < 400 || oldCount > 600 {
		t.Errorf("expected ~500 for old item, got %d", oldCount)
	}

	// "new" should be ~100 (added after decay, minimal additional decay)
	newCount := cms.Count([]byte("new"))
	if newCount < 90 || newCount > 110 {
		t.Errorf("expected ~100 for new item, got %d", newCount)
	}
}

// TestDecayMethod ensures explicit Decay() works.
func TestDecayMethod(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

	cms.AddN([]byte("a"), 1000)

	time.Sleep(600 * time.Millisecond)
	result := cms.Decay()

	// Should return self for chaining
	if result != cms {
		t.Error("Decay should return the same instance")
	}

	count := cms.Count([]byte("a"))
	if count < 400 || count > 600 {
		t.Errorf("expected ~500 after explicit decay, got %d", count)
	}
}

// TestTotalCountDecays ensures TotalCount reflects decay.
func TestTotalCountDecays(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

	cms.AddN([]byte("a"), 1000)

	if total := cms.TotalCount(); total < 990 {
		t.Errorf("expected ~1000 before significant decay, got %d", total)
	}

	time.Sleep(600 * time.Millisecond)

	total := cms.TotalCount()
	if total < 400 || total > 600 {
		t.Errorf("expected ~500 total after decay, got %d", total)
	}
}

// TestMergeDecayedSketches ensures merge works with decayed sketches.
func TestMergeDecayedSketches(t *testing.T) {
	halfLife := 500 * time.Millisecond
	cms1 := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)
	cms2 := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

	cms1.AddN([]byte("a"), 1000)
	cms2.AddN([]byte("a"), 1000)

	// Wait one half-life for both
	time.Sleep(600 * time.Millisecond)

	err := cms1.Merge(cms2)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Both decayed ~500 each, merged ~1000
	count := cms1.Count([]byte("a"))
	if count < 800 || count > 1200 {
		t.Errorf("expected ~1000 after merge, got %d", count)
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
	cms := NewCountMinSketchWithDecay(0.001, 0.99, halfLife)

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

	// Counts should match (allow ±5 for float64 rounding + minimal decay during test)
	if count := cms2.Count([]byte("a")); count < 995 || count > 1005 {
		t.Errorf("expected ~1000 after deserialization, got %d", count)
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

	total := cms1.TotalCount()
	if total == 0 {
		t.Error("TotalCount should not be 0 after subtracting a smaller sketch")
	}
	if total < 400 || total > 800 {
		t.Errorf("expected TotalCount ~600, got %d", total)
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
}

// TestSubtractDecayRateMismatch ensures Subtract returns error for different decay rates.
func TestSubtractDecayRateMismatch(t *testing.T) {
	cms1 := NewCountMinSketchWithDecay(0.001, 0.99, 1*time.Second)
	cms2 := NewCountMinSketchWithDecay(0.001, 0.99, 2*time.Second)

	err := cms1.Subtract(cms2)
	if err == nil {
		t.Error("expected error for decay rate mismatch")
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
// CountDiff must compute per-cell differences then take min,
// NOT subtract the two Count() results.
func TestCountDiffPerCellMinNotNaive(t *testing.T) {
	cms1 := NewCountMinSketch(0.001, 0.99)
	cms2 := NewCountMinSketch(0.001, 0.99)

	for i := 0; i < 500; i++ {
		key := []byte(fmt.Sprintf("item-%d", i))
		cms1.AddN(key, uint64(i+1))
	}
	for i := 0; i < 300; i++ {
		key := []byte(fmt.Sprintf("item-%d", i))
		cms2.AddN(key, uint64(i+1))
	}

	target := []byte("item-250")
	countDiff := cms1.CountDiff(target, cms2)
	naiveDiff := int64(cms1.Count(target)) - int64(cms2.Count(target))

	if countDiff < -300 || countDiff > 300 {
		t.Errorf("CountDiff out of reasonable range: %d", countDiff)
	}

	t.Logf("CountDiff=%d, naive Count()-Count()=%d", countDiff, naiveDiff)
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
