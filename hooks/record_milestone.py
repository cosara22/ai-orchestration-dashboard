#!/usr/bin/env python3
"""
Claude Code Hooks からマイルストーンを自動記録するスクリプト

使用方法 (SessionEnd時):
  echo '{"session_id":"xxx","summary":"..."}' | python record_milestone.py session_end

使用方法 (コミット時):
  echo '{"session_id":"xxx","commit_hash":"abc123","message":"..."}' | python record_milestone.py commit

環境変数:
  AOD_URL      - ダッシュボードURL (default: http://localhost:4000)
  AOD_PROJECT  - プロジェクトID
"""

import sys
import json
import os
import subprocess
from datetime import datetime, timezone

# HTTP リクエスト用（send_event.pyと同じ）
try:
    import httpx
    def post_json(url, data):
        response = httpx.post(url, json=data, timeout=10.0)
        response.raise_for_status()
        return response.json()
except ImportError:
    try:
        import requests
        def post_json(url, data):
            response = requests.post(url, json=data, timeout=10.0)
            response.raise_for_status()
            return response.json()
    except ImportError:
        import urllib.request
        import urllib.error
        def post_json(url, data):
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                return json.loads(resp.read().decode('utf-8'))

# 設定
DASHBOARD_URL = os.environ.get("AOD_URL", "http://localhost:4000")


def get_project_id():
    """プロジェクトIDを取得"""
    # 環境変数から
    if os.environ.get("AOD_PROJECT_ID"):
        return os.environ["AOD_PROJECT_ID"]

    # ディレクトリ名からプロジェクト名を推測し、APIで検索
    project_name = os.environ.get("AOD_PROJECT", os.path.basename(os.getcwd()))

    try:
        import urllib.request
        with urllib.request.urlopen(
            f"{DASHBOARD_URL}/api/ccpm/projects?name={project_name}",
            timeout=5.0
        ) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get("projects") and len(data["projects"]) > 0:
                return data["projects"][0]["project_id"]
    except Exception:
        pass

    return None


def get_git_info():
    """現在のgit情報を取得"""
    info = {
        "branch": None,
        "recent_commits": [],
        "changed_files": [],
    }

    try:
        # ブランチ名
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info["branch"] = result.stdout.strip()

        # 最近のコミット（最大5件）
        result = subprocess.run(
            ["git", "log", "--oneline", "-5"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info["recent_commits"] = result.stdout.strip().split("\n")

        # 変更されたファイル
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info["changed_files"] = [f for f in result.stdout.strip().split("\n") if f]
    except Exception:
        pass

    return info


def record_session_end(payload: dict, project_id: str):
    """セッション終了時のマイルストーン記録"""
    session_id = payload.get("session_id", "unknown")

    # セッション情報を取得
    session_info = {}
    try:
        import urllib.request
        with urllib.request.urlopen(
            f"{DASHBOARD_URL}/api/sessions/{session_id}",
            timeout=5.0
        ) as resp:
            session_info = json.loads(resp.read().decode('utf-8'))
    except Exception:
        pass

    # Git情報を取得
    git_info = get_git_info()

    # タイトルを生成
    summary = payload.get("summary", "")
    if summary:
        title = summary[:100]
    else:
        title = f"Session completed: {session_id[:12]}"

    # マイルストーンデータを構築
    milestone_data = {
        "session_id": session_id,
        "project_id": project_id,
        "event_type": "session_end",
        "title": title,
        "description": payload.get("description", ""),
        "summary": summary,
        "files_changed": git_info.get("changed_files", []),
        "commits": git_info.get("recent_commits", []),
        "tools_used": payload.get("tools_used", []),
        "duration_minutes": payload.get("duration_minutes"),
        "outcome": payload.get("outcome", "success"),
        "next_steps": payload.get("next_steps", []),
        "lessons_learned": payload.get("lessons_learned", ""),
        "tags": ["session", git_info.get("branch", "main")],
    }

    return post_json(f"{DASHBOARD_URL}/api/milestones/agent/record", milestone_data)


def record_commit(payload: dict, project_id: str):
    """コミット時のマイルストーン記録"""
    commit_hash = payload.get("commit_hash", "")
    message = payload.get("message", "Commit recorded")

    # Git情報を取得
    git_info = get_git_info()

    # マイルストーンデータを構築
    milestone_data = {
        "session_id": payload.get("session_id"),
        "project_id": project_id,
        "event_type": "commit",
        "title": f"Commit: {message[:80]}",
        "description": message,
        "summary": payload.get("summary", ""),
        "files_changed": git_info.get("changed_files", []),
        "commits": [f"{commit_hash[:7]} {message}"] if commit_hash else [],
        "outcome": "success",
        "tags": ["commit", git_info.get("branch", "main")],
    }

    return post_json(f"{DASHBOARD_URL}/api/milestones/agent/record", milestone_data)


def record_task_complete(payload: dict, project_id: str):
    """タスク完了時のマイルストーン記録"""
    task_title = payload.get("task_title", "Task completed")

    milestone_data = {
        "session_id": payload.get("session_id"),
        "project_id": project_id,
        "event_type": "task_complete",
        "title": task_title,
        "description": payload.get("description", ""),
        "summary": payload.get("summary", ""),
        "files_changed": payload.get("files_changed", []),
        "tools_used": payload.get("tools_used", []),
        "outcome": payload.get("outcome", "success"),
        "next_steps": payload.get("next_steps", []),
        "lessons_learned": payload.get("lessons_learned", ""),
        "wbs_id": payload.get("wbs_id"),
        "tags": ["task"] + payload.get("tags", []),
    }

    return post_json(f"{DASHBOARD_URL}/api/milestones/agent/record", milestone_data)


def record_progress(payload: dict, project_id: str):
    """進捗更新の記録"""
    progress_data = {
        "session_id": payload.get("session_id"),
        "project_id": project_id,
        "wbs_id": payload.get("wbs_id"),
        "progress_type": payload.get("progress_type", "task_progress"),
        "task_title": payload.get("task_title", "Progress update"),
        "details": payload.get("details", ""),
        "percent_complete": payload.get("percent_complete"),
        "blockers": payload.get("blockers", []),
        "tools_used": payload.get("tools_used", []),
    }

    return post_json(f"{DASHBOARD_URL}/api/milestones/agent/progress", progress_data)


def main():
    if len(sys.argv) < 2:
        print("Usage: record_milestone.py <event_type>", file=sys.stderr)
        print("Event types: session_end, commit, task_complete, progress", file=sys.stderr)
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

    # プロジェクトID取得
    project_id = get_project_id()
    if not project_id:
        print("Error: Could not determine project_id. Set AOD_PROJECT_ID env var.", file=sys.stderr)
        sys.exit(1)

    # イベントタイプに応じて処理
    try:
        if event_type == "session_end":
            result = record_session_end(payload, project_id)
        elif event_type == "commit":
            result = record_commit(payload, project_id)
        elif event_type == "task_complete":
            result = record_task_complete(payload, project_id)
        elif event_type == "progress":
            result = record_progress(payload, project_id)
        else:
            print(f"Unknown event type: {event_type}", file=sys.stderr)
            sys.exit(1)

        # 成功時はマイルストーンIDを出力
        if result.get("milestone_id"):
            print(f"Milestone recorded: {result['milestone_id']}")
        elif result.get("record_id"):
            print(f"Progress recorded: {result['record_id']}")

    except Exception as e:
        print(f"Error recording milestone: {e}", file=sys.stderr)
        # Hooksでエラーになってもエージェントは止めない
        sys.exit(0)


if __name__ == "__main__":
    main()
