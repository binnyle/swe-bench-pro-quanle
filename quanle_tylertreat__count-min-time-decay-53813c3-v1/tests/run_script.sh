#!/bin/bash
set -e

cd /app

# Re-init go module if missing (git reset removes it)
if [ ! -f go.mod ]; then
    go mod init github.com/tylertreat/BoomFilters
    go mod tidy
fi

# Copy the decay test file into the Go package
cp /tests/countmin_decay_test.go /app/countmin_decay_test.go

echo "Running all tests..."
go test -v -count=1 ./... 2>&1 || true
