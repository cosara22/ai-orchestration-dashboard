# AI Orchestration Dashboard

複数のClaude Codeインスタンスを用いた並列AI開発を統合管理するダッシュボードシステム。

## 概要

既存のMCPオーケストレーションサーバー（制御プレーン）とHooksベースの監視システム（観測プレーン）を統合し、制御と可視化を両立した開発基盤を実現する。

## 機能

- リアルタイムエージェント状態表示
- タスク管理・可視化
- Hooksイベントの収集・表示
- メトリクス・分析

## 技術スタック

- Frontend: Next.js 14, TypeScript, Tailwind CSS
- Backend: Bun + Hono
- Database: SQLite (イベント), Redis (タスク状態)
- Container: Docker Compose

## ドキュメント

- docs/PRJ-2026-002_企画書.md
- docs/REQ-2026-002_要件定義書.md
- docs/DES-2026-002_設計書.md

## ライセンス

MIT
