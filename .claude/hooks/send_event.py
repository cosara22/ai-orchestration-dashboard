#!/usr/bin/env python3
"""
Claude Code Hook: Send events to AI Orchestration Dashboard

This hook is triggered by Claude Code events and sends them to the AOD API.
Supports multi-agent orchestration with heartbeat functionality.

Environment Variables:
  AOD_API_URL    - Dashboard URL (default: http://localhost:4000)
  AOD_PROJECT_ID - Project ID for multi-agent context
  AOD_AGENT_ID   - Agent ID for multi-agent mode
  AOD_AGENT_NAME - Agent name for display
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

API_URL = os.environ.get("AOD_API_URL", "http://localhost:4000")
PROJECT_ID = os.environ.get("AOD_PROJECT_ID", "")
AGENT_ID = os.environ.get("AOD_AGENT_ID", "")
AGENT_NAME = os.environ.get("AOD_AGENT_NAME", "")


def send_event(event_type: str, payload: dict, session_id: str | None = None) -> bool:
    """Send an event to the AOD API."""
    url = f"{API_URL}/api/events"

    data = {
        "event_type": event_type,
        "payload": payload,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if session_id:
        data["session_id"] = session_id

    # Add multi-agent context
    if AGENT_ID:
        data["agent_id"] = AGENT_ID
    if AGENT_NAME:
        data["agent_name"] = AGENT_NAME
    if PROJECT_ID:
        data["project_id"] = PROJECT_ID

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
    except urllib.error.URLError:
        return False
    except Exception:
        return False


def send_heartbeat() -> None:
    """Send agent heartbeat to maintain active status."""
    if not AGENT_ID:
        return

    url = f"{API_URL}/api/agents/{AGENT_ID}/heartbeat"
    data = {"message": "active"}

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=3) as _:
            pass
    except Exception:
        pass  # Heartbeat failures are non-critical


def handle_hook(hook_name: str) -> None:
    """Handle incoming hook data from stdin."""
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return

        hook_data = json.loads(input_data)
    except json.JSONDecodeError:
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

    # Send heartbeat for active hooks (multi-agent mode)
    if AGENT_ID and hook_name in ["PostToolUse", "Notification"]:
        send_heartbeat()


if __name__ == "__main__":
    # Hook name is passed as first argument
    hook_name = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    handle_hook(hook_name)
