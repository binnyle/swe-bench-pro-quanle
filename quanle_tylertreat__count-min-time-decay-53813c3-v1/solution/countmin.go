package boom

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"hash"
	"io"
	"math"
	"time"
)

// CountMinSketch implements a Count-Min Sketch as described by Cormode and
// Muthukrishnan in An Improved Data Stream Summary: The Count-Min Sketch and
// its Applications:
//
// http://dimacs.rutgers.edu/~graham/pubs/papers/cm-full.pdf
//
// A Count-Min Sketch (CMS) is a probabilistic data structure which
// approximates the frequency of events in a data stream. Unlike a hash map, a
// CMS uses sub-linear space at the expense of a configurable error factor.
// Similar to Counting Bloom filters, items are hashed to a series of buckets,
// which increment a counter. The frequency of an item is estimated by taking
// the minimum of each of the item's respective counter values.
//
// Count-Min Sketches are useful for counting the frequency of events in
// massive data sets or unbounded streams online. In these situations, storing
// the entire data set or allocating counters for every event in memory is
// impractical. It may be possible for offline processing, but real-time
// processing requires fast, space-efficient solutions like the CMS. For
// approximating set cardinality, refer to the HyperLogLog.
type CountMinSketch struct {
	matrix  [][]uint64  // count matrix
	width   uint        // matrix width
	depth   uint        // matrix depth
	count   uint64      // number of items added
	epsilon float64     // relative-accuracy factor
	delta   float64     // relative-accuracy probability
	hash    hash.Hash64 // hash function (kernel for all depth functions)

	// Time-decay fields
	decayRate float64        // lambda = ln(2)/halfLife; 0 means no decay
	lastDecay time.Time      // last time decay was applied
	timeFunc  func() time.Time // injectable clock for testing
}

// NewCountMinSketch creates a new Count-Min Sketch whose relative accuracy is
// within a factor of epsilon with probability delta. Both of these parameters
// affect the space and time complexity.
func NewCountMinSketch(epsilon, delta float64) *CountMinSketch {
	var (
		width  = uint(math.Ceil(math.E / epsilon))
		depth  = uint(math.Ceil(math.Log(1 / delta)))
		matrix = make([][]uint64, depth)
	)

	for i := uint(0); i < depth; i++ {
		matrix[i] = make([]uint64, width)
	}

	return &CountMinSketch{
		matrix:  matrix,
		width:   width,
		depth:   depth,
		epsilon: epsilon,
		delta:   delta,
	}
}

// NewCountMinSketchWithDecay creates a new Count-Min Sketch with time-based
// exponential decay. The halfLife parameter specifies the duration after which
// counts are halved. When halfLife is 0, behavior is identical to
// NewCountMinSketch.
func NewCountMinSketchWithDecay(epsilon, delta float64, halfLife time.Duration) *CountMinSketch {
	cms := NewCountMinSketch(epsilon, delta)
	if halfLife > 0 {
		cms.decayRate = math.Log(2) / halfLife.Seconds()
		cms.lastDecay = time.Now()
		cms.timeFunc = time.Now
	}
	return cms
}

// applyDecay applies exponential decay to all counts based on elapsed time.
func (c *CountMinSketch) applyDecay() {
	if c.decayRate == 0 {
		return
	}
	now := c.timeFunc()
	elapsed := now.Sub(c.lastDecay).Seconds()
	if elapsed <= 0 {
		return
	}
	factor := math.Exp(-c.decayRate * elapsed)
	for i := uint(0); i < c.depth; i++ {
		for j := uint(0); j < c.width; j++ {
			c.matrix[i][j] = uint64(math.Round(float64(c.matrix[i][j]) * factor))
		}
	}
	c.count = uint64(math.Round(float64(c.count) * factor))
	c.lastDecay = now
}

// Decay manually applies time decay to all counts. This is useful for batch
// processing where you want to explicitly trigger decay at specific points.
// Returns the CountMinSketch to allow for chaining.
func (c *CountMinSketch) Decay() *CountMinSketch {
	c.applyDecay()
	return c
}

// Epsilon returns the relative-accuracy factor, epsilon.
func (c *CountMinSketch) Epsilon() float64 {
	return c.epsilon
}

// Delta returns the relative-accuracy probability, delta.
func (c *CountMinSketch) Delta() float64 {
	return c.delta
}

// TotalCount returns the number of items added to the sketch.
func (c *CountMinSketch) TotalCount() uint64 {
	c.applyDecay()
	return c.count
}

// Add will add the data to the set. Returns the CountMinSketch to allow for
// chaining.
func (c *CountMinSketch) Add(data []byte) *CountMinSketch {
	c.applyDecay()
	return c.addN(data, 1)
}

// AddN will add the data to the set n times. Returns the CountMinSketch to allow for
// chaining.
func (c *CountMinSketch) AddN(data []byte, n uint64) *CountMinSketch {
	c.applyDecay()
	return c.addN(data, n)
}

// addN is the internal implementation that does not apply decay (to avoid double-decay).
func (c *CountMinSketch) addN(data []byte, n uint64) *CountMinSketch {
	lower, upper := hashKernel(data, c.hash)

	// Increment count in each row by n.
	for i := uint(0); i < c.depth; i++ {
		c.matrix[i][(uint(lower)+uint(upper)*i)%c.width] += n
	}

	c.count += n
	return c
}

// Count returns the approximate count for the specified item, correct within
// epsilon * total count with a probability of delta.
func (c *CountMinSketch) Count(data []byte) uint64 {
	c.applyDecay()
	var (
		lower, upper = hashKernel(data, c.hash)
		count        = uint64(math.MaxUint64)
	)

	for i := uint(0); i < c.depth; i++ {
		count = uint64(math.Min(float64(count),
			float64(c.matrix[i][(uint(lower)+uint(upper)*i)%c.width])))
	}

	return count
}

// Merge combines this CountMinSketch with another. Returns an error if the
// matrix width and depth are not equal.
func (c *CountMinSketch) Merge(other *CountMinSketch) error {
	if c.depth != other.depth {
		return errors.New("matrix depth must match")
	}

	if c.width != other.width {
		return errors.New("matrix width must match")
	}

	// Apply decay to both sketches before merging
	c.applyDecay()
	other.applyDecay()

	if c.decayRate != other.decayRate {
		return errors.New("decay rate must match")
	}

	for i := uint(0); i < c.depth; i++ {
		for j := uint(0); j < c.width; j++ {
			c.matrix[i][j] += other.matrix[i][j]
		}
	}

	c.count += other.count
	return nil
}

// Reset restores the CountMinSketch to its original state. It returns itself
// to allow for chaining.
func (c *CountMinSketch) Reset() *CountMinSketch {
	for i := 0; i < len(c.matrix); i++ {
		for j := 0; j < len(c.matrix[i]); j++ {
			c.matrix[i][j] = 0
		}
	}

	c.count = 0
	if c.decayRate > 0 {
		c.lastDecay = c.timeFunc()
	}
	return c
}

// SetHash sets the hashing function used.
func (c *CountMinSketch) SetHash(h hash.Hash64) {
	c.hash = h
}

// WriteDataTo writes a binary representation of the CMS data to
// an io stream. It returns the number of bytes written and error
func (c *CountMinSketch) WriteDataTo(stream io.Writer) (int, error) {
	buf := new(bytes.Buffer)
	// serialize epsilon and delta as cms configuration check
	err := binary.Write(buf, binary.LittleEndian, c.epsilon)
	if err != nil {
		return 0, err
	}
	err = binary.Write(buf, binary.LittleEndian, c.delta)
	if err != nil {
		return 0, err
	}
	err = binary.Write(buf, binary.LittleEndian, c.count)
	if err != nil {
		return 0, err
	}
	err = binary.Write(buf, binary.LittleEndian, c.decayRate)
	if err != nil {
		return 0, err
	}
	err = binary.Write(buf, binary.LittleEndian, c.lastDecay.UnixNano())
	if err != nil {
		return 0, err
	}
	// encode matrix
	for i := range c.matrix {
		err = binary.Write(buf, binary.LittleEndian, c.matrix[i])
		if err != nil {
			return 0, err
		}
	}

	return stream.Write(buf.Bytes())
}

// ReadDataFrom reads a binary representation of the CMS data written
// by WriteDataTo() from io stream. It returns the number of bytes read
// and error
// If serialized CMS configuration is different it returns error with expected params
func (c *CountMinSketch) ReadDataFrom(stream io.Reader) (int, error) {
	var (
		count                    uint64
		epsilon, delta, decayRate float64
		lastDecayNano            int64
	)

	err := binary.Read(stream, binary.LittleEndian, &epsilon)
	if err != nil {
		return 0, err
	}
	err = binary.Read(stream, binary.LittleEndian, &delta)
	if err != nil {
		return 0, err
	}

	// check if serialized and target cms configurations are same
	if c.epsilon != epsilon || c.delta != delta {
		return 0, fmt.Errorf("expected cms values for epsilon %f and delta %f", epsilon, delta)
	}

	err = binary.Read(stream, binary.LittleEndian, &count)
	if err != nil {
		return 0, err
	}

	err = binary.Read(stream, binary.LittleEndian, &decayRate)
	if err != nil {
		return 0, err
	}
	err = binary.Read(stream, binary.LittleEndian, &lastDecayNano)
	if err != nil {
		return 0, err
	}
	c.decayRate = decayRate
	c.lastDecay = time.Unix(0, lastDecayNano)
	if c.decayRate > 0 {
		c.timeFunc = time.Now
	}

	for i := uint(0); i < c.depth; i++ {
		err = binary.Read(stream, binary.LittleEndian, c.matrix[i])
	}
	// count size of matrix and count + decay fields
	size := int(c.depth*c.width)*binary.Size(uint64(0)) + binary.Size(count) + 2*binary.Size(float64(0)) + binary.Size(float64(0)) + binary.Size(int64(0))

	c.count = count

	return size, err
}

// TestAndRemove attemps to remove n counts of data from the CMS. If
// n is greater than the data count, TestAndRemove is a no-op and
// returns false. Else, return true and decrement count by n.
func (c *CountMinSketch) TestAndRemove(data []byte, n uint64) bool {
	h, count := c.traverseDepth(data)

	if n > count {
		return false
	}

	for i := uint(0); i < c.depth; i++ {
		*h[i] -= n
	}

	return true
}

// TestAndRemoveAll counts data frequency, performs TestAndRemove(data, count),
// and returns true if count is positive. If count is 0, TestAndRemoveAll is a
// no-op and returns false.
func (c *CountMinSketch) TestAndRemoveAll(data []byte) bool {
	h, count := c.traverseDepth(data)

	if count == 0 {
		return false
	}

	for i := uint(0); i < c.depth; i++ {
		*h[i] -= count
	}

	return true
}

func (c *CountMinSketch) traverseDepth(data []byte) ([]*uint64, uint64) {
	var (
		lower, upper = hashKernel(data, c.hash)
		count        = uint64(math.MaxUint64)
		h            = make([]*uint64, c.depth)
	)

	for i := uint(0); i < c.depth; i++ {
		h[i] = &c.matrix[i][(uint(lower)+uint(upper)*i)%c.width]
		count = uint64(math.Min(float64(count), float64(*h[i])))
	}

	return h, count
}
