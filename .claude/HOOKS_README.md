# Claude Code Hooks for AI Orchestration Dashboard

## Overview

This directory contains hooks that integrate Claude Code with the AI Orchestration Dashboard (AOD).
When configured, these hooks send real-time events to the dashboard for monitoring and analysis.

## Setup

### 1. Configure Claude Code Settings

Copy the settings to your Claude Code configuration:

**Option A: Project-level settings**
The `settings.local.json` file in this directory will be automatically loaded when Claude Code
is run from this project directory.

**Option B: User-level settings**
Copy the hooks configuration to your user settings file:
- Windows: `%APPDATA%\claude-code\settings.json`
- macOS/Linux: `~/.config/claude-code/settings.json`

### 2. Environment Variables

Set the API URL if using a non-default endpoint:

```bash
export AOD_API_URL=http://localhost:4000
```

### 3. Verify Connection

Test the hook manually:

```bash
echo '{"test": true}' | python .claude/hooks/send_event.py PreToolUse
```

Check the dashboard at http://localhost:3000 to see the test event.

## Hook Types

| Hook | Description | Event Type |
|------|-------------|------------|
| PreToolUse | Before a tool is executed | tool_execution_start |
| PostToolUse | After a tool completes | tool_execution_end |
| Notification | System notifications | notification |
| Stop | Session ends | session_end |

## Troubleshooting

### Events not appearing

1. Verify the API is running: `curl http://localhost:4000/health`
2. Check hook output: Run the hook manually with `--verbose`
3. Verify Python is available: `python --version`

### Connection refused

1. Ensure the backend server is running on port 4000
2. Check firewall settings
3. Verify `AOD_API_URL` environment variable

## Files

- `send_event.py` - Python hook script (recommended)
- `send_event.sh` - Shell script alternative
- `../settings.local.json` - Claude Code settings with hook configuration
