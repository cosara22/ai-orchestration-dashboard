#!/usr/bin/env python3
"""
Claude Code Hooks から AOD にイベントを送信するスクリプト

使用方法:
  echo '{"session_id":"xxx","tool_name":"Read"}' | python send_event.py PostToolUse

環境変数:
  AOD_URL        - ダッシュボードURL (default: http://localhost:4000)
  AOD_PROJECT    - プロジェクト名 (default: カレントディレクトリ名)
  AOD_PROJECT_ID - プロジェクトID (optional)
  AOD_AGENT_ID   - エージェントID (optional, for multi-agent)
  AOD_AGENT_NAME - エージェント名 (optional, for multi-agent)
"""

import sys
import json
import os
from datetime import datetime, timezone

# httpx/requests が無い場合は標準ライブラリにフォールバック
try:
    import httpx
    def post_event(url, data):
        response = httpx.post(url, json=data, timeout=5.0)
        response.raise_for_status()
        return response.json()
except ImportError:
    try:
        import requests
        def post_event(url, data):
            response = requests.post(url, json=data, timeout=5.0)
            response.raise_for_status()
            return response.json()
    except ImportError:
        import urllib.request
        import urllib.error
        def post_event(url, data):
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            try:
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    return json.loads(resp.read().decode('utf-8'))
            except urllib.error.URLError as e:
                raise Exception(f"URL Error: {e}")

# 設定
DASHBOARD_URL = os.environ.get("AOD_URL", "http://localhost:4000")
SOURCE_PROJECT = os.environ.get("AOD_PROJECT", os.path.basename(os.getcwd()))
PROJECT_ID = os.environ.get("AOD_PROJECT_ID", "")
AGENT_ID = os.environ.get("AOD_AGENT_ID", "")
AGENT_NAME = os.environ.get("AOD_AGENT_NAME", "")

def main():
    if len(sys.argv) < 2:
        print("Usage: send_event.py <event_type>", file=sys.stderr)
        print("Event types: SessionStart, SessionEnd, PreToolUse, PostToolUse, Notification, Stop", file=sys.stderr)
        sys.exit(1)

    event_type = sys.argv[1]

    # 標準入力からペイロード読み取り
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            payload = json.loads(input_data)
        else:
            payload = {}
    except (json.JSONDecodeError, EOFError):
        payload = {}

    # セッションIDの取得（複数の場所から試行）
    session_id = (
        payload.get("session_id") or
        os.environ.get("CLAUDE_SESSION_ID") or
        "unknown"
    )

    # イベント構築
    event = {
        "event_type": event_type,
        "session_id": session_id,
        "payload": payload,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # マルチエージェント情報を追加
    if AGENT_ID:
        event["agent_id"] = AGENT_ID
    if AGENT_NAME:
        event["agent_name"] = AGENT_NAME
    if PROJECT_ID:
        event["project_id"] = PROJECT_ID

    # 送信
    try:
        result = post_event(f"{DASHBOARD_URL}/api/events", event)
        # デバッグ用: 成功時の出力
        # print(f"Event sent: {result}", file=sys.stderr)

        # エージェントハートビート送信（マルチエージェントモード時）
        if AGENT_ID and event_type in ["PostToolUse", "Notification"]:
            send_heartbeat()
    except Exception as e:
        # エラーは無視（Hooks失敗でエージェントを止めない）
        # デバッグ時はコメントアウトを外す
        # print(f"Event send failed: {e}", file=sys.stderr)
        pass


def send_heartbeat():
    """エージェントハートビートを送信"""
    if not AGENT_ID:
        return

    try:
        heartbeat_data = {
            "message": "active"
        }
        post_event(f"{DASHBOARD_URL}/api/agents/{AGENT_ID}/heartbeat", heartbeat_data)
    except Exception:
        pass  # ハートビート失敗は無視

if __name__ == "__main__":
    main()
