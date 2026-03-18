# Kanban Board App

GitHub Projects 風のリアルタイム Kanban ボードアプリです。

## 機能

- **カンバンボード** - GitHub Projects スタイルの列（Todo / In Progress / In Review / Done）
- **カードの管理** - 追加・編集・削除
- **ドラッグ＆ドロップ** - カードを列間や列内で自由に移動
- **自動スクロール** - 常時表示モードで全体を自動的に見渡せる（速度調整可）
- **リアルタイム同期** - Socket.io による複数ユーザー同時接続・即時反映
- **接続状態表示** - 接続中ユーザー数をヘッダーに表示

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 18, TypeScript, Vite |
| ドラッグ&ドロップ | @hello-pangea/dnd |
| リアルタイム通信 | Socket.io (client) |
| バックエンド | Node.js, Express, Socket.io |

## ディレクトリ構成

```
kanban_app/
├── backend/          # Express + Socket.io サーバー
│   ├── package.json
│   └── server.js
├── frontend/         # React + TypeScript フロントエンド
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── main.tsx      # エントリーポイント
│   ├── app.tsx       # メインコンポーネント
│   └── styles.css
└── package.json      # ルート（便利スクリプト）
```

## セットアップ

```bash
# 依存関係のインストール
npm run install:all

# バックエンドの起動（ポート 3001）
npm run dev:backend

# フロントエンドの起動（別ターミナル、ポート 5173）
npm run dev:frontend
```

ブラウザで http://localhost:5173 を開いてください。

## 本番ビルド

```bash
# フロントエンドをビルド
npm run build:frontend

# ビルド済みファイルを dist/ に出力
# バックエンドから静的ファイルとして配信することも可能
```

## Socket.io イベント一覧

| イベント | 方向 | 説明 |
|---|---|---|
| `board:init` | Server→Client | 初回接続時に全ボード状態を送信 |
| `board:updated` | Server→Client | ボード全体の更新 |
| `card:add` | Client→Server | カード追加 |
| `card:added` | Server→Client | カード追加通知 |
| `card:edit` | Client→Server | カード編集 |
| `card:edited` | Server→Client | カード編集通知 |
| `card:move` | Client→Server | カードを別列に移動 |
| `card:reorder` | Client→Server | 同一列内の並び替え |
| `card:delete` | Client→Server | カード削除 |
| `card:deleted` | Server→Client | カード削除通知 |
| `column:add` | Client→Server | 列の追加 |
| `column:delete` | Client→Server | 列の削除 |
