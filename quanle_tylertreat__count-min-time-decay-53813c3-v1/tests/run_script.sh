#!/bin/bash
set -e

cd /app

# Re-init go module if missing (git reset removes it)
if [ ! -f go.mod ]; then
    go mod init github.com/tylertreat/BoomFilters
    go mod tidy
fi

echo "Running all tests..."
go test -v -count=1 ./... 2>&1 || true
