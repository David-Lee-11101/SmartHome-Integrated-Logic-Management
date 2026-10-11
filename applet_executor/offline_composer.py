"""Deterministic, network-free adapter for the suite RuleSpec v0 shape."""

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def _validate_steps(name: str, value: Any, minimum: int, maximum: int) -> List[Dict[str, str]]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise ValueError(f"{name} must contain between {minimum} and {maximum} item(s)")
    normalized = []
    for item in value:
        if not isinstance(item, dict) or set(item) != {"device", "state"}:
            raise ValueError(f"Each {name} item must contain only device and state")
        device = item.get("device")
        state = item.get("state")
        if not isinstance(device, str) or not device.strip() or not isinstance(state, str) or not state.strip():
            raise ValueError(f"Each {name} item requires non-empty device and state strings")
        normalized.append({"device": device.strip(), "state": state.strip()})
    return normalized


def compose_rule_spec(source: Path) -> Dict[str, Any]:
    """Compose one-trigger, optional-condition, one-action RuleSpec v0 fixture."""
    with Path(source).open(encoding="utf-8") as fixture:
        document = json.load(fixture)
    expected = {"id", "description", "triggers", "conditions", "actions"}
    if set(document) != expected:
        raise ValueError("RuleSpec v0 requires id, description, triggers, conditions, and actions")
    if not isinstance(document["id"], str) or not document["id"].strip():
        raise ValueError("id must be a non-empty string")
    if not isinstance(document["description"], str) or not document["description"].strip():
        raise ValueError("description must be a non-empty string")
    return {
        "schema": "rule-spec/v0",
        "id": document["id"].strip(),
        "description": document["description"].strip(),
        "triggers": _validate_steps("triggers", document["triggers"], 1, 1),
        "conditions": _validate_steps("conditions", document["conditions"], 0, 1),
        "actions": _validate_steps("actions", document["actions"], 1, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose an offline SmartRule RuleSpec fixture")
    parser.add_argument("fixture", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rendered = json.dumps(compose_rule_spec(args.fixture), indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
