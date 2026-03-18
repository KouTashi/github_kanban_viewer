const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// ─── In-memory board state ────────────────────────────────────────────────────

let boardState = {
  columns: [
    { id: "col-todo", title: "📋 Todo", order: 0 },
    { id: "col-inprogress", title: "🔄 In Progress", order: 1 },
    { id: "col-review", title: "👀 In Review", order: 2 },
    { id: "col-done", title: "✅ Done", order: 3 },
  ],
  cards: [
    {
      id: "card-1",
      columnId: "col-todo",
      title: "ユーザー認証機能を実装する",
      description: "ログイン・ログアウト・サインアップ画面を作成",
      label: "feature",
      assignee: "Alice",
      order: 0,
    },
    {
      id: "card-2",
      columnId: "col-todo",
      title: "データベース設計",
      description: "ER図を作成しテーブル定義を決める",
      label: "design",
      assignee: "Bob",
      order: 1,
    },
    {
      id: "card-3",
      columnId: "col-inprogress",
      title: "REST API の実装",
      description: "エンドポイントを設計・実装する",
      label: "backend",
      assignee: "Carol",
      order: 0,
    },
    {
      id: "card-4",
      columnId: "col-inprogress",
      title: "UIコンポーネント作成",
      description: "共通コンポーネントのスタイルガイドを整備",
      label: "frontend",
      assignee: "Dave",
      order: 1,
    },
    {
      id: "card-5",
      columnId: "col-review",
      title: "テストコードを書く",
      description: "単体テストと結合テストを追加",
      label: "testing",
      assignee: "Eve",
      order: 0,
    },
    {
      id: "card-6",
      columnId: "col-done",
      title: "プロジェクト初期設定",
      description: "リポジトリ作成、CI/CD設定完了",
      label: "ops",
      assignee: "Frank",
      order: 0,
    },
  ],
};

// ─── REST endpoint for health check ──────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", connectedUsers: io.engine.clientsCount });
});

// ─── Socket.io event handling ─────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  // Send full board state to the newly connected client
  socket.emit("board:init", boardState);

  // ── Card operations ─────────────────────────────────────────────────────────
  socket.on("card:add", (data) => {
    const { columnId, title, description, label, assignee } = data;
    if (!columnId || !title) return;

    const columnCards = boardState.cards.filter((c) => c.columnId === columnId);
    const newCard = {
      id: `card-${randomUUID()}`,
      columnId,
      title: String(title).slice(0, 200),
      description: description ? String(description).slice(0, 1000) : "",
      label: label ? String(label).slice(0, 50) : "",
      assignee: assignee ? String(assignee).slice(0, 100) : "",
      order: columnCards.length,
    };

    boardState.cards.push(newCard);
    io.emit("card:added", newCard);
  });

  socket.on("card:edit", (data) => {
    const { id, title, description, label, assignee } = data;
    const card = boardState.cards.find((c) => c.id === id);
    if (!card) return;

    if (title !== undefined) card.title = String(title).slice(0, 200);
    if (description !== undefined) card.description = String(description).slice(0, 1000);
    if (label !== undefined) card.label = String(label).slice(0, 50);
    if (assignee !== undefined) card.assignee = String(assignee).slice(0, 100);

    io.emit("card:edited", card);
  });

  socket.on("card:move", (data) => {
    const { id, toColumnId, newOrder } = data;
    const card = boardState.cards.find((c) => c.id === id);
    const column = boardState.columns.find((c) => c.id === toColumnId);
    if (!card || !column) return;

    const oldColumnId = card.columnId;
    card.columnId = toColumnId;
    card.order = typeof newOrder === "number" ? newOrder : 0;

    // Re-index orders in affected columns
    [oldColumnId, toColumnId].forEach((colId) => {
      boardState.cards
        .filter((c) => c.columnId === colId)
        .sort((a, b) => a.order - b.order)
        .forEach((c, idx) => {
          c.order = idx;
        });
    });

    io.emit("board:updated", boardState);
  });

  socket.on("card:reorder", (data) => {
    // Reorder within the same column
    const { columnId, orderedIds } = data;
    if (!Array.isArray(orderedIds)) return;

    orderedIds.forEach((cardId, idx) => {
      const card = boardState.cards.find((c) => c.id === cardId && c.columnId === columnId);
      if (card) card.order = idx;
    });

    io.emit("board:updated", boardState);
  });

  socket.on("card:delete", (data) => {
    const { id } = data;
    const idx = boardState.cards.findIndex((c) => c.id === id);
    if (idx === -1) return;

    boardState.cards.splice(idx, 1);
    io.emit("card:deleted", { id });
  });

  // ── Column operations ───────────────────────────────────────────────────────
  socket.on("column:add", (data) => {
    const { title } = data;
    if (!title) return;

    const newColumn = {
      id: `col-${randomUUID()}`,
      title: String(title).slice(0, 100),
      order: boardState.columns.length,
    };
    boardState.columns.push(newColumn);
    io.emit("board:updated", boardState);
  });

  socket.on("column:delete", (data) => {
    const { id } = data;
    const colIdx = boardState.columns.findIndex((c) => c.id === id);
    if (colIdx === -1) return;

    boardState.columns.splice(colIdx, 1);
    boardState.cards = boardState.cards.filter((c) => c.columnId !== id);
    io.emit("board:updated", boardState);
  });

  socket.on("disconnect", () => {
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Kanban backend listening on http://localhost:${PORT}`);
});
