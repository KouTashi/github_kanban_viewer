# GitHub Kanban Viewer

GitHub Projects v2 のカンバンを読み取り専用で表示するビューワーです。  
自動スクロール機能付きで、常時表示モニターへの表示などに最適です。

## 機能

- **GitHub Projects v2 連携** - Organization / User プロジェクトのカンバンを自動取得
- **読み取り専用** - 表示のみ（書き込みなし）
- **自動スクロール** - 全列を自動的に横スクロール（速度調整可）
- **自動更新** - 設定した間隔（デフォルト5分）で GitHub から自動再取得
- **手動更新** - ヘッダーの「更新」ボタンで即時再取得
- **ラベル表示** - GitHub のラベルカラーをそのまま表示
- **担当者表示** - GitHubアバター付きで表示
- **リアルタイム通信** - Socket.io による即時反映

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 18, TypeScript, Vite |
| リアルタイム通信 | Socket.io (client) |
| バックエンド | Node.js, Express, Socket.io |
| GitHub API | GitHub GraphQL API v4 |

## ディレクトリ構成

```
github_kanban_viewer/
├── backend/              # Express + Socket.io サーバー
│   ├── package.json
│   ├── .env.example      # 環境変数サンプル
│   └── server.js
├── frontend/             # React + TypeScript フロントエンド
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── main.tsx          # エントリーポイント
│   ├── app.tsx           # メインコンポーネント
│   └── styles.css
├── Dockerfile            # Docker イメージビルド定義
├── docker-compose.yml    # 複数プロジェクト同時起動のサンプル
└── package.json          # ルート（便利スクリプト）
```

## セットアップ

### 1. 依存関係のインストール

```bash
npm run install:all
```

### 2. GitHub Personal Access Token の取得

1. https://github.com/settings/tokens にアクセス
2. **Generate new token (classic)** をクリック
3. スコープを選択:
   - `read:project` — Projects v2 の読み取りに必須
   - `repo` — プライベートリポジトリのイシューを表示する場合に必要
4. トークンを生成してコピー

### 3. 環境変数の設定（推奨）

```bash
cp backend/.env.example backend/.env
# backend/.env を編集して GITHUB_TOKEN と GITHUB_PROJECT_URL を設定
```

```env
GITHUB_TOKEN=ghp_your_token_here
GITHUB_PROJECT_URL=https://github.com/orgs/YOUR_ORG/projects/1
```

### 4. サーバーの起動

```bash
# バックエンドの起動（ポート 3001）
npm run dev:backend

# フロントエンドの起動（別ターミナル、ポート 5173）
npm run dev:frontend
```

ブラウザで http://localhost:5173 を開いてください。

### 5. ブラウザから設定する場合

環境変数を設定しない場合は、ブラウザの「⚙️ 設定」ボタンから GitHub Token と Project URL を入力できます。  
（トークンはバックエンドのメモリ上にのみ保存され、フロントエンドには返しません）

## 複数プロジェクトの同時表示（別ポートで複数起動）

複数の GitHub プロジェクトを別々のポートでそれぞれ独立した Kanban として表示できます。  
バックエンドはビルド済みフロントエンドも同一ポートで配信するため、各インスタンスは完全に自己完結しています。

### Docker Compose を使う場合（推奨）

```bash
# 1. docker-compose.yml を編集して各サービスの環境変数を設定
#    - GITHUB_TOKEN: GitHub Personal Access Token
#    - GITHUB_PROJECT_URL: 表示したいプロジェクトの URL

# 2. イメージをビルドして全インスタンスを起動
docker compose up -d --build

# 3. ブラウザでアクセス
#    プロジェクト1: http://localhost:3001
#    プロジェクト2: http://localhost:3002
#    （以降、docker-compose.yml に追加したポートに対応）

# 停止
docker compose down
```

`docker-compose.yml` に `project3:` 以降のブロックを追加するだけでプロジェクトをさらに増やせます。

### Docker を使わずに手動で複数起動する場合

```bash
# フロントエンドをビルド（1 回だけ実行）
npm run build

# ターミナル1: プロジェクト1（ポート 3001）
PORT=3001 GITHUB_TOKEN=ghp_xxx GITHUB_PROJECT_URL=https://github.com/orgs/ORG/projects/1 npm start

# ターミナル2: プロジェクト2（ポート 3002）
PORT=3002 GITHUB_TOKEN=ghp_xxx GITHUB_PROJECT_URL=https://github.com/orgs/ORG/projects/2 npm start
```

`npm run build` でフロントエンドをビルドしておくと、バックエンドが `frontend/dist/` を自動的に配信します。  
ブラウザで `http://localhost:3001`・`http://localhost:3002` のように各ポートへアクセスしてください。

## 環境変数

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token | （必須） |
| `GITHUB_PROJECT_URL` | GitHub Projects v2 の URL | （必須） |
| `POLL_INTERVAL_MS` | GitHub API ポーリング間隔（ms） | `300000`（5分） |
| `PORT` | バックエンドのポート番号 | `3001` |

## GitHub Projects URL の形式

```
https://github.com/orgs/YOUR_ORG/projects/1      # Organization プロジェクト
https://github.com/users/YOUR_USER/projects/1     # User プロジェクト
https://github.com/YOUR_USER/projects/1           # User プロジェクト（短縮形）
```

## 本番ビルド

```bash
# フロントエンドをビルド（frontend/dist/ に出力）
npm run build

# バックエンドを起動（ポート 3001）
# frontend/dist/ が存在する場合は自動的にフロントエンドも配信される
npm start
```

ブラウザで http://localhost:3001 を開いてください。

## Socket.io イベント一覧

| イベント | 方向 | 説明 |
|---|---|---|
| `board:init` | Server→Client | 初回接続時にボード状態を送信 |
| `board:updated` | Server→Client | GitHub からデータ取得後に更新を送信 |
| `board:error` | Server→Client | 取得エラー時にエラーメッセージを送信 |

