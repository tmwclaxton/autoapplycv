#!/usr/bin/env python3
"""Sleep until 07:00 Europe/London then write final_wrap to auto-apply-live-review-status.json."""

from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

STATUS_PATH = Path(__file__).resolve().parents[2] / "tests/fixtures/auto-apply/auto-apply-live-review-status.json"
QUEUE_PATH = Path(__file__).resolve().parents[2] / "tests/fixtures/auto-apply/auto-apply-live-review-queue.json"
LONDON = ZoneInfo("Europe/London")
DEADLINE = datetime(2026, 7, 13, 7, 0, 0, tzinfo=LONDON)


def load_status() -> dict:
    return json.loads(STATUS_PATH.read_text())


def load_queue() -> dict:
    return json.loads(QUEUE_PATH.read_text())


def save_status(data: dict) -> None:
    STATUS_PATH.write_text(json.dumps(data, indent=2) + "\n")


def is_defensible_pass(scenario: dict) -> bool:
    """Count only offline verification or live submit - not routing-only host checks."""
    if scenario.get("result") != "pass":
        return False
    if scenario.get("platform") == "offline":
        return True
    return int(scenario.get("jobs_submitted") or 0) > 0


def summarize_platforms(status: dict) -> dict:
    summary: dict[str, dict[str, int]] = {}
    for scenario in status.get("scenarios_tested", []):
        platform = scenario.get("platform") or "orchestrator"
        bucket = summary.setdefault(platform, {"pass": 0, "fail": 0, "blocked": 0})
        result = scenario.get("result") or "fail"
        if result in bucket:
            bucket[result] += 1
    return summary


def p0_scenarios(status: dict) -> list[dict]:
    return [
        s
        for s in status.get("scenarios_tested", [])
        if str(s.get("scenario_id", "")).startswith("p0-")
        and not str(s.get("scenario_id", "")).endswith("-retest")
    ]


def build_open_gaps(status: dict, queue: dict) -> list[str]:
    gaps = list(status.get("open_gaps") or [])
    pending = int(queue.get("pending_count") or 0)
    total = int(queue.get("total_entries") or 0)
    untested = f"{pending} of {total} queue scenarios untested"
    if not any(untested in gap for gap in gaps):
        gaps.append(untested)
    return gaps


def apply_final_wrap(data: dict, queue: dict) -> None:
    now = datetime.now(LONDON)
    data["campaign_status"] = "final_wrap"
    data["updated_at"] = now.strftime("%Y-%m-%dT%H:%M:%S%z").replace("+0100", "+01:00")
    data["platform_summary"] = summarize_platforms(data)

    p0_rows = p0_scenarios(data)
    p0_defensible_pass = sum(1 for s in p0_rows if is_defensible_pass(s))
    p0_total = 12
    scenarios_tested = len(data.get("scenarios_tested") or [])
    queue_total = int(queue.get("total_entries") or 0)
    jobs_submitted = int(data.get("jobs_submitted_count") or 0)
    open_gaps = build_open_gaps(data, queue)
    data["open_gaps"] = open_gaps

    data["final_wrap"] = {
        "status": "complete",
        "completed_at": now.strftime("%Y-%m-%dT%H:%M:%S%z").replace("+0100", "+01:00"),
        "scenarios_tested_count": scenarios_tested,
        "queue_total": queue_total,
        "queue_pending": int(queue.get("pending_count") or 0),
        "jobs_submitted_count": jobs_submitted,
        "p0_defensible_pass_count": p0_defensible_pass,
        "p0_total": p0_total,
        "p0_pass_ids": [s["scenario_id"] for s in p0_rows if is_defensible_pass(s)],
        "fixes_shipped_overnight": data.get("fixes_shipped_overnight", []),
        "open_gaps": open_gaps,
        "platform_summary": data["platform_summary"],
        "verdict": (
            f"Campaign final wrap at 07:00 London. {scenarios_tested}/{queue_total} queue scenarios tested; "
            f"defensible P0 {p0_defensible_pass}/{p0_total} pass (p0-10 offline, p0-11 live submit); "
            f"{jobs_submitted} job submitted. Routing-only runs do not count as pass."
        ),
    }


def main() -> None:
    print(f"Waiting until 07:00 London ({DEADLINE.isoformat()}) before final_wrap")

    while True:
        now = datetime.now(LONDON)
        if now >= DEADLINE:
            break
        remaining = (DEADLINE - now).total_seconds()
        sleep_for = min(remaining, 30)
        print(f"Waiting {sleep_for:.0f}s ({remaining/60:.1f} min left)")
        time.sleep(sleep_for)

    data = load_status()
    queue = load_queue()
    apply_final_wrap(data, queue)
    save_status(data)
    print(f"final_wrap written at {datetime.now(LONDON).isoformat()}")


if __name__ == "__main__":
    main()
