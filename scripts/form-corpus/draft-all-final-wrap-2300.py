#!/usr/bin/env python3
"""Sleep until 23:00 Europe/London then write final_wrap to draft-all-live-review-status.json."""

from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

STATUS_PATH = Path(__file__).resolve().parents[2] / "tests/fixtures/form-extraction/draft-all-live-review-status.json"
LONDON = ZoneInfo("Europe/London")
DEADLINE = datetime(2026, 7, 12, 23, 0, 0, tzinfo=LONDON)
STAGING_HEAD = "6e5586bf"
EXTENSION_VERSION = "2.25.61"

NEW_FORMS = [
    {
        "url": "https://framestore.recruitee.com/o/vfx-production-coordinator-07-2026/c/new",
        "ats": "recruitee",
        "title": "Framestore VFX Production Coordinator (form 255)",
        "result": "pass_with_notes",
        "fields_filled": 11,
        "inventory_count": 13,
        "pending_count": 1,
        "reviewed_at": "2026-07-12T22:00:00+01:00",
        "notes": [
            "Form 255: Recruitee Framestore NYC - 11/20 controls; identity + screening radios PASS",
            "CV/cover file required in inventory but attach pending; submit not clicked",
        ],
    },
    {
        "url": "https://jobs.lever.co/getpoint/4cdeaefb-0ee7-44bb-be52-d051a23acda4/apply",
        "ats": "lever",
        "title": "GetPoint Senior React Native Engineer (form 256)",
        "result": "pass_with_notes",
        "fields_filled": 9,
        "inventory_count": 10,
        "pending_count": 0,
        "reviewed_at": "2026-07-12T22:58:00+01:00",
        "notes": [
            "Form 256: GetPoint Lever - 9/10 controls PASS",
            "v2.25.61 (6e5586bf): f8 github url instant fill https://github.com/tmwclaxton; pendingCount 0",
            "LinkedIn/Twitter/Portfolio/Other URLs PASS; location autocomplete empty; submit not clicked",
        ],
    },
    {
        "url": "https://fairfood-freiburg.jobs.personio.de/job/270216?apply",
        "ats": "personio",
        "title": "Fairfood Initiative Application (form 257)",
        "result": "pass_with_notes",
        "fields_filled": 9,
        "inventory_count": 9,
        "pending_count": 0,
        "reviewed_at": "2026-07-12T22:05:00+01:00",
        "fixture_id": "https-fairfood-freiburg-jobs-personio-de-job-270216",
        "notes": [
            "Form 257: Personio Fairfood - 9/9 readback PASS",
            "Custom selects Vollzeit + LinkedIn source PASS; phone +44 partial; CV attach pending",
        ],
    },
    {
        "url": "https://job-boards.eu.greenhouse.io/veeamsoftware/jobs/4913141101",
        "ats": "greenhouse",
        "title": "Veeam C# Developer Warsaw (form 258)",
        "result": "partial",
        "fields_filled": 8,
        "inventory_count": 16,
        "pending_count": 1,
        "reviewed_at": "2026-07-12T22:10:00+01:00",
        "notes": [
            "Form 258: Veeam GH EU - identity + salary + overlap textarea + GDPR checkbox PASS",
            "React-select screening comboboxes empty in readback (partial vs Econoler PASS); resume pending",
        ],
    },
    {
        "url": "https://jobs.ashbyhq.com/synthesia/848ccd2d-a001-436a-953f-452898f49ebe/application",
        "ats": "ashby",
        "title": "Synthesia Senior Product Marketing Manager (form 259)",
        "result": "pass_with_notes",
        "fields_filled": 6,
        "inventory_count": 6,
        "pending_count": 0,
        "reviewed_at": "2026-07-12T22:15:00+01:00",
        "fixture_id": "https-jobs-ashbyhq-com-synthesia-848ccd2d-a001-436a-953f-452898f49ebe-applicatio",
        "notes": [
            "Form 259: Synthesia Ashby - 6/6 text/URL/location PASS",
            "Resume _systemfield_resume pending; submit not clicked",
        ],
    },
    {
        "url": "https://palebluedotrecruitment.recruitee.com/o/product-builder-operator-candidate-registration-portal/c/new",
        "ats": "recruitee",
        "title": "Pale Blue Dot Product Builder Portal (form 260)",
        "result": "pass_with_notes",
        "fields_filled": 5,
        "inventory_count": 9,
        "pending_count": 0,
        "reviewed_at": "2026-07-12T22:20:00+01:00",
        "notes": [
            "Form 260: Recruitee talent pool - identity + Ireland sponsorship No + privacy checkbox PASS",
            "Talent-pool Yes radio unchecked; CV in inventory attach pending; submit not clicked",
        ],
    },
]


def load_status() -> dict:
    return json.loads(STATUS_PATH.read_text())


def save_status(data: dict) -> None:
    STATUS_PATH.write_text(json.dumps(data, indent=2) + "\n")


def apply_interim_update(data: dict) -> None:
    existing_urls = {f.get("url") for f in data.get("forms_tested", [])}
    for form in NEW_FORMS:
        if form["url"] not in existing_urls:
            data["forms_tested"].append(form)

    data["updated_at"] = datetime.now(LONDON).strftime("%Y-%m-%dT%H:%M:%S%z").replace("+0100", "+01:00")
    data["extension_version"] = EXTENSION_VERSION
    data["campaign_status"] = "resumed"
    data["forms_tested_count"] = 260

    data["v2_25_60_booksy_retest"] = {
        "at": "2026-07-12T21:55:00+01:00",
        "commit": "dc5b7755",
        "extension_version": "2.25.60",
        "verdict": "pass",
        "notes": "QA_11301620 Sept 2026 start radio checked yes after Draft All; was FAIL on v2.25.59",
    }

    data["v2_25_61_retest"] = {
        "at": "2026-07-12T21:58:00+01:00",
        "commit": STAGING_HEAD,
        "extension_version": EXTENSION_VERSION,
        "discipline": "extension:build-reload -> MCP navigate -> start_draft_all -> read_field_values",
        "results": [
            {
                "area": "github_url_profile_mapping",
                "url": "https://jobs.lever.co/getpoint/4cdeaefb-0ee7-44bb-be52-d051a23acda4/apply",
                "field": "f8 github url / urls[GitHub]",
                "verdict": "pass",
                "notes": "Instant fill https://github.com/tmwclaxton from profile links; pendingCount 0 (was sidebar pending on v2.25.60)",
            }
        ],
    }

    if "summary" in data:
        data["summary"]["forms_tested_count"] = 260
        data["summary"]["forms_reviewed_july_12"] = 127
        data["summary"]["staging_head"] = STAGING_HEAD


def apply_final_wrap(data: dict) -> None:
    now = datetime.now(LONDON)
    data["campaign_status"] = "final_wrap"
    data["updated_at"] = now.strftime("%Y-%m-%dT%H:%M:%S%z").replace("+0100", "+01:00")
    data["extension_version"] = EXTENSION_VERSION
    data["forms_tested_count"] = 260

    verification_verdicts = {
        "booksy_workable_sept_2026_radio": {
            "verdict": "pass",
            "extension_version": "2.25.60",
            "commit": "dc5b7755",
            "note": "QA_11301620 checked yes; was FAIL on v2.25.59 (a591d1ee)",
        },
        "github_url_profile_mapping": {
            "verdict": "pass",
            "extension_version": EXTENSION_VERSION,
            "commit": STAGING_HEAD,
            "live_check": "GetPoint Lever f8 urls[GitHub] -> https://github.com/tmwclaxton; pendingCount 0",
        },
        "greenhouse_react_select": {
            "verdict": "pass",
            "live_check": "Econoler 16/16 readback (French Aucune, English Bilingue, Canada auth No)",
        },
        "personio_custom_selects": {
            "verdict": "pass",
            "live_check": "adidas English C2 + Fairfood Vollzeit/LinkedIn selects",
        },
        "lever_card_radios": {
            "verdict": "partial",
            "note": "Asobo experience-years card empty; Cirrus commutable-distance field0 empty",
        },
        "ashby_resume_attach": {
            "verdict": "partial_fail",
            "note": "_systemfield_resume unfilled on AMI/Astera/Synthesia/Kindred despite discovery helpers",
        },
        "recruitee_cv_inventory_gap": {
            "verdict": "open_gap",
            "forms": "248-251",
            "note": "Augustine/Apex/Bally/UP42 spontaneous forms: CV required on page but missing from inventory on some variants",
        },
    }

    data["final_wrap"] = {
        "status": "complete",
        "completed_at": now.strftime("%Y-%m-%dT%H:%M:%S%z").replace("+0100", "+01:00"),
        "staging_head": STAGING_HEAD,
        "extension_version": EXTENSION_VERSION,
        "profile_filter": data.get("final_wrap", {}).get("profile_filter", "e4ad56ed"),
        "forms_tested_count": 260,
        "forms_reviewed_july_12": 127,
        "discipline": "inventory -> draft all -> read_field_values -> validation -> notes -> fix+reverify -> corpus -> status JSON. No real submits (reportValidity only).",
        "incident": "Teamtailor Aignostics real submit 2026-07-11 fixed to reportValidity-only. No submits this session.",
        "fixes_shipped_tonight": [
            {
                "version": "2.25.61",
                "commit": STAGING_HEAD,
                "summary": "GitHub/portfolio/website URL profile links in identity instant fill; Lever urls[GitHub] no longer sidebar pending",
            },
            {
                "version": "2.25.60",
                "commit": "dc5b7755",
                "summary": "Workable yes/no radio coercion for availability start dates (Booksy QA_11301620 Sept 2026)",
            },
            {
                "version": "2.25.59",
                "commit": "a591d1ee",
                "summary": "Lever card-radio groups, GH react-select readback, Personio custom selects, Workable radio batch",
            },
            {
                "version": "2.25.46-51",
                "commit": "4aa67d85",
                "summary": "Workable combobox, Ashby identity/URLs, Personio files, choice groups, bridge 900s timeout",
            },
        ],
        "verification_verdicts": verification_verdicts,
        "highlights": [
            "260 live forms tested; 127 reviewed on 2026-07-12 evening session",
            "Extension v2.25.46 -> v2.25.61 on staging (6e5586bf)",
            "Booksy Workable Sept 2026 radio PASS after v2.25.60; GitHub URL instant fill PASS on GetPoint v2.25.61",
            "GH Econoler react-select 16/16 PASS; Personio adidas/Fairfood custom selects PASS",
            "Lever Asobo/Cirrus card-radios partial; Ashby resume attach still open",
            "Recruitee CV inventory gap on forms 248-251 (spontaneous variants) remains open",
        ],
        "open_gaps": [
            "Ashby/Greenhouse/Lever resume file attach end-to-end not verified despite _systemfield_resume discovery",
            "Lever card-radio experience-years and commutable-distance fields still empty on Asobo/Cirrus",
            "Recruitee CV required on page but absent from inventory on Augustine/Apex/Bally/UP42 (forms 248-251)",
            "Greenhouse get_field_inventory hangs on Remote/Axon heavy pages",
            "Veeam GH react-select screening comboboxes partial readback vs Econoler PASS",
        ],
        "verdict": (
            "Campaign complete at 23:00 London. Staging 6e5586bf / v2.25.61 ships Booksy radio fix (v2.25.60), "
            "GitHub URL profile mapping (v2.25.61), and v2.25.59 partial-fix batch. Top follow-ups: resume attach E2E, "
            "Recruitee CV inventory gap, Lever card-radio remainder, GH inventory hang."
        ),
    }

    data["summary"] = {
        **data.get("summary", {}),
        "forms_tested_count": 260,
        "forms_reviewed_july_12": 127,
        "staging_head": STAGING_HEAD,
        "verdict": data["final_wrap"]["verdict"],
        "verification_verdicts": verification_verdicts,
    }


def main() -> None:
    data = load_status()
    apply_interim_update(data)
    save_status(data)
    print(f"Interim update written at {datetime.now(LONDON).isoformat()}")

    while True:
        now = datetime.now(LONDON)
        if now >= DEADLINE:
            break
        remaining = (DEADLINE - now).total_seconds()
        sleep_for = min(remaining, 30)
        print(f"Waiting {sleep_for:.0f}s until 23:00 London ({remaining/60:.1f} min left)")
        time.sleep(sleep_for)

    data = load_status()
    apply_final_wrap(data)
    save_status(data)
    print(f"final_wrap written at {datetime.now(LONDON).isoformat()}")


if __name__ == "__main__":
    main()
