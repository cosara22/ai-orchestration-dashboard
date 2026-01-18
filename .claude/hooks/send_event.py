#!/usr/bin/env python3
"""
Claude Code Hook: Send events to AI Orchestration Dashboard

This hook is triggered by Claude Code events and sends them to the AOD API.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime

API_URL = os.environ.get("AOD_API_URL", "http://localhost:4000")


def send_event(event_type: str, payload: dict, session_id: str | None = None) -> bool:
    """Send an event to the AOD API."""
    url = f"{API_URL}/api/events"

    data = {
        "event_type": event_type,
        "payload": payload,
        "timestamp": datetime.now().isoformat(),
    }

    if session_id:
        data["session_id"] = session_id

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result.get("success", False)
    except urllib.error.URLError as e:
        print(f"Failed to send event: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return False


def handle_hook(hook_name: str) -> None:
    """Handle incoming hook data from stdin."""
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return

        hook_data = json.loads(input_data)
    except json.JSONDecodeError:
        print("Invalid JSON input", file=sys.stderr)
        return

    # Extract session ID if available
    session_id = os.environ.get("CLAUDE_SESSION_ID")

    # Map hook events to AOD event types
    event_type_map = {
        "PreToolUse": "tool_execution_start",
        "PostToolUse": "tool_execution_end",
        "Notification": "notification",
        "Stop": "session_end",
    }

    event_type = event_type_map.get(hook_name, hook_name.lower())

    # Build payload based on hook type
    payload = {
        "hook_name": hook_name,
        "raw_data": hook_data,
    }

    # Extract tool-specific info
    if hook_name in ["PreToolUse", "PostToolUse"]:
        payload["tool_name"] = hook_data.get("tool_name", "unknown")
        payload["tool_input"] = hook_data.get("tool_input", {})
        if hook_name == "PostToolUse":
            payload["tool_output"] = hook_data.get("tool_output")

    # Extract notification info
    if hook_name == "Notification":
        payload["notification_type"] = hook_data.get("type", "unknown")
        payload["message"] = hook_data.get("message", "")

    send_event(event_type, payload, session_id)


if __name__ == "__main__":
    # Hook name is passed as first argument
    hook_name = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    handle_hook(hook_name)
