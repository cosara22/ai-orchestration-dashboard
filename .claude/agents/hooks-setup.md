---
name: hooks-setup
description: |
  Claude Code Hooks設定のセットアップ。以下の場合に使用:
  (1) send_event.pyスクリプトの配置
  (2) settings.jsonの設定例作成
  (3) Hooks動作テスト
model: sonnet
---

# Hooks Setup Agent

Claude Code Hooksとの統合設定を実行します。

## Hooks概要

Claude Code Hooksは、エージェントの活動をリアルタイムで外部に通知する仕組みです。
AODはこのHooksを受信して、ダッシュボードに表示します。

## 対応イベントタイプ

| イベント | タイミング | 用途 |
|---------|----------|------|
| PreToolUse | ツール実行前 | 予定アクションの表示 |
| PostToolUse | ツール実行後 | 結果の表示 |
| SessionStart | セッション開始 | エージェント起動検知 |
| SessionEnd | セッション終了 | エージェント停止検知 |
| Notification | 通知発生 | アラート表示 |
| Stop | 停止 | 異常停止検知 |

## セットアップ手順

### Step 1: ディレクトリ作成

```bash
mkdir -p hooks
```

### Step 2: send_event.py作成

```python
#!/usr/bin/env python3
# hooks/send_event.py
"""
Claude Code Hooks から AOD にイベントを送信するスクリプト
"""

import sys
import json
import os
from datetime import datetime, timezone

# httpx が無い場合は requests にフォールバック
try:
    import httpx
    def post_event(url, data):
        response = httpx.post(url, json=data, timeout=5.0)
        response.raise_for_status()
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
            urllib.request.urlopen(req, timeout=5.0)
        except urllib.error.URLError:
            pass

# 設定
DASHBOARD_URL = os.environ.get("AOD_URL", "http://localhost:4000")
SOURCE_APP = os.environ.get("AOD_PROJECT", os.path.basename(os.getcwd()))

def main():
    if len(sys.argv) < 2:
        print("Usage: send_event.py <event_type>", file=sys.stderr)
        sys.exit(1)

    event_type = sys.argv[1]

    # 標準入力からペイロード読み取り
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        payload = {}

    # イベント構築
    event = {
        "source_app": SOURCE_APP,
        "session_id": payload.get("session_id", "unknown"),
        "hook_event_type": event_type,
        "payload": payload,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # 送信
    try:
        post_event(f"{DASHBOARD_URL}/api/events", event)
    except Exception as e:
        # エラーは無視（Hooks失敗でエージェントを止めない）
        # デバッグ時はコメントアウトを外す
        # print(f"Event send failed: {e}", file=sys.stderr)
        pass

if __name__ == "__main__":
    main()
```

### Step 3: 実行権限付与

```bash
chmod +x hooks/send_event.py
```

### Step 4: settings.json.example作成

各プロジェクトの `.claude/settings.json` に設定する例:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool_name": "*" },
        "commands": [
          "python ${CLAUDE_PROJECT_DIR}/hooks/send_event.py PreToolUse"
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": { "tool_name": "*" },
        "commands": [
          "python ${CLAUDE_PROJECT_DIR}/hooks/send_event.py PostToolUse"
        ]
      }
    ],
    "SessionStart": [
      {
        "commands": [
          "python ${CLAUDE_PROJECT_DIR}/hooks/send_event.py SessionStart"
        ]
      }
    ],
    "SessionEnd": [
      {
        "commands": [
          "python ${CLAUDE_PROJECT_DIR}/hooks/send_event.py SessionEnd"
        ]
      }
    ],
    "Notification": [
      {
        "commands": [
          "python ${CLAUDE_PROJECT_DIR}/hooks/send_event.py Notification"
        ]
      }
    ]
  }
}
```

### Step 5: 環境変数設定（オプション）

各プロジェクトで環境変数を設定することで、AODの接続先をカスタマイズできます:

```bash
# .envrc (direnv使用時)
export AOD_URL="http://localhost:4000"
export AOD_PROJECT="my-project-name"
```

または、シェル設定ファイルに追加:

```bash
# ~/.bashrc or ~/.zshrc
export AOD_URL="http://localhost:4000"
```

## 検証コマンド

### 手動テスト
```bash
# イベント送信テスト
echo '{"session_id":"test-123","tool_name":"Read"}' | python hooks/send_event.py PostToolUse

# APIで確認
curl http://localhost:4000/api/events?limit=1
```

### Hooks動作確認
```bash
# Claude Codeで何かツールを実行し、イベントが送信されることを確認
curl http://localhost:4000/api/events?limit=10 | jq
```

## シンボリックリンク設定

複数プロジェクトで同じHooksスクリプトを使用する場合:

```bash
# AODの hooks/ を他プロジェクトにリンク
ln -s /path/to/ai-orchestration-dashboard/hooks /path/to/other-project/.claude/hooks
```

## フィルタリング設定

特定のツールのみを送信する場合:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool_name": ["Bash", "Write", "Edit"] },
        "commands": [
          "python ${CLAUDE_PROJECT_DIR}/hooks/send_event.py PostToolUse"
        ]
      }
    ]
  }
}
```

## トラブルシューティング

### イベントが送信されない

1. **スクリプト実行権限**
   ```bash
   chmod +x hooks/send_event.py
   ```

2. **Python確認**
   ```bash
   which python3
   python3 --version
   ```

3. **AOD起動確認**
   ```bash
   curl http://localhost:4000/health
   ```

4. **手動テスト**
   ```bash
   echo '{}' | python hooks/send_event.py TestEvent
   ```

### エラーログ確認

send_event.py のエラー出力を有効にする:

```python
# send_event.py のexcept節を修正
except Exception as e:
    print(f"Event send failed: {e}", file=sys.stderr)
```

### ネットワークエラー

```bash
# ローカル接続確認
curl -v http://localhost:4000/api/events

# ファイアウォール確認 (Windows)
netsh advfirewall firewall show rule name=all | findstr 4000
```
