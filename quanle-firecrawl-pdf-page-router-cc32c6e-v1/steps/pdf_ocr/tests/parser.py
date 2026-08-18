#!/usr/bin/env python3
"""Parse normalized Vitest result lines into the SWE-Bench verifier contract."""

import dataclasses
import json
import re
import sys
from enum import Enum
from pathlib import Path
from typing import List


class TestStatus(Enum):
    PASSED = 1
    FAILED = 2
    SKIPPED = 3
    ERROR = 4


@dataclasses.dataclass
class TestResult:
    name: str
    status: TestStatus


def parse_test_output(stdout_content: str, stderr_content: str) -> List[TestResult]:
    combined = stdout_content + "\n" + stderr_content
    results = []
    pattern = re.compile(
        r"^VITEST_RESULT\t(.+?)\t(PASSED|FAILED|SKIPPED|ERROR)$",
        re.MULTILINE,
    )
    for match in pattern.finditer(combined):
        results.append(
            TestResult(name=match.group(1), status=TestStatus[match.group(2)])
        )
    return results


def export_to_json(results: List[TestResult], output_path: Path) -> None:
    unique = {result.name: result for result in results}.values()
    payload = {
        "tests": [
            {"name": result.name, "status": result.status.name}
            for result in unique
        ]
    }
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main(stdout_path: Path, stderr_path: Path, output_path: Path) -> None:
    stdout_content = stdout_path.read_text(encoding="utf-8", errors="replace")
    stderr_content = stderr_path.read_text(encoding="utf-8", errors="replace")
    export_to_json(parse_test_output(stdout_content, stderr_content), output_path)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: parser.py <stdout> <stderr> <output-json>")
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
