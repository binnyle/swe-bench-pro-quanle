#!/bin/bash
set -euo pipefail

cd /app 2>/dev/null || cd /testbed
git apply --verbose /solution/oracle.patch
