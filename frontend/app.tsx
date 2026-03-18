import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import "./styles.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Column {
  id: string;
  title: string;
  order: number;
}

interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string;
  label: string;
  assignee: string;
  order: number;
}

interface BoardState {
  columns: Column[];
  cards: Card[];
}

type LabelColor = {
  [key: string]: string;
};

const LABEL_COLORS: LabelColor = {
  feature: "#0075ca",
  design: "#e4e669",
  backend: "#d93f0b",
  frontend: "#0052cc",
  testing: "#e99695",
  ops: "#5319e7",
  bug: "#d73a4a",
  docs: "#0075ca",
  "": "#555",
};

const getLabelColor = (label: string): string =>
  LABEL_COLORS[label] ?? "#555";

// ─── Socket ────────────────────────────────────────────────────────────────────

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? window.location.origin;

// ─── Card Modal ───────────────────────────────────────────────────────────────

interface CardModalProps {
  card?: Card;
  onSave: (data: Omit<Card, "id" | "columnId" | "order">) => void;
  onClose: () => void;
}

function CardModal({ card, onSave, onClose }: CardModalProps) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [label, setLabel] = useState(card?.label ?? "");
  const [assignee, setAssignee] = useState(card?.assignee ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), description, label, assignee });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{card ? "カードを編集" : "カードを追加"}</h3>
        <form onSubmit={handleSubmit}>
          <label className="modal-label">
            タイトル *
            <input
              className="modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="カードのタイトル"
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <label className="modal-label">
            説明
            <textarea
              className="modal-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="詳細を入力..."
              maxLength={1000}
              rows={3}
            />
          </label>
          <div className="modal-row">
            <label className="modal-label">
              ラベル
              <select
                className="modal-select"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              >
                <option value="">なし</option>
                <option value="feature">feature</option>
                <option value="bug">bug</option>
                <option value="design">design</option>
                <option value="backend">backend</option>
                <option value="frontend">frontend</option>
                <option value="testing">testing</option>
                <option value="ops">ops</option>
                <option value="docs">docs</option>
              </select>
            </label>
            <label className="modal-label">
              担当者
              <input
                className="modal-input"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="担当者名"
                maxLength={100}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary">
              {card ? "保存" : "追加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Column Modal ─────────────────────────────────────────────────────────────

interface ColumnModalProps {
  onSave: (title: string) => void;
  onClose: () => void;
}

function ColumnModal({ onSave, onClose }: ColumnModalProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave(title.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">列を追加</h3>
        <form onSubmit={handleSubmit}>
          <label className="modal-label">
            列タイトル *
            <input
              className="modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: In Review"
              maxLength={100}
              required
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary">
              追加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Card Component ───────────────────────────────────────────────────────────

interface CardItemProps {
  card: Card;
  index: number;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
}

function CardItem({ card, index, onEdit, onDelete }: CardItemProps) {
  return (
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => (
        <div
          className={`card ${snapshot.isDragging ? "card--dragging" : ""}`}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          {card.label && (
            <span
              className="card-label"
              style={{ backgroundColor: getLabelColor(card.label) }}
            >
              {card.label}
            </span>
          )}
          <div className="card-title">{card.title}</div>
          {card.description && (
            <div className="card-description">{card.description}</div>
          )}
          {card.assignee && (
            <div className="card-assignee">
              <span className="card-avatar">
                {card.assignee.charAt(0).toUpperCase()}
              </span>
              {card.assignee}
            </div>
          )}
          <div className="card-actions">
            <button
              className="card-btn"
              onClick={() => onEdit(card)}
              title="編集"
            >
              ✏️
            </button>
            <button
              className="card-btn card-btn--danger"
              onClick={() => onDelete(card.id)}
              title="削除"
            >
              🗑️
            </button>
          </div>
        </div>
      )}
    </Draggable>
  );
}

// ─── Column Component ─────────────────────────────────────────────────────────

interface ColumnItemProps {
  column: Column;
  cards: Card[];
  onAddCard: (columnId: string) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (id: string) => void;
  onDeleteColumn: (id: string) => void;
}

function ColumnItem({
  column,
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onDeleteColumn,
}: ColumnItemProps) {
  return (
    <div className="column">
      <div className="column-header">
        <span className="column-title">{column.title}</span>
        <span className="column-count">{cards.length}</span>
        <button
          className="column-delete-btn"
          onClick={() => onDeleteColumn(column.id)}
          title="列を削除"
        >
          ✕
        </button>
      </div>
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            className={`card-list ${snapshot.isDraggingOver ? "card-list--over" : ""}`}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {cards
              .sort((a, b) => a.order - b.order)
              .map((card, index) => (
                <CardItem
                  key={card.id}
                  card={card}
                  index={index}
                  onEdit={onEditCard}
                  onDelete={onDeleteCard}
                />
              ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      <button className="add-card-btn" onClick={() => onAddCard(column.id)}>
        + カードを追加
      </button>
    </div>
  );
}

// ─── Auto-scroll Hook ─────────────────────────────────────────────────────────

function useAutoScroll(
  boardRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  speedPx: number = 1
) {
  const animFrameRef = useRef<number | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const pauseRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const el = boardRef.current;
    if (!el) return;

    let lastTime = 0;
    const PAUSE_MS = 1500; // pause at edges
    let pauseUntil = 0;

    const step = (timestamp: number) => {
      if (!boardRef.current) return;
      const el = boardRef.current;

      if (timestamp < pauseUntil || pauseRef.current) {
        animFrameRef.current = requestAnimationFrame(step);
        return;
      }

      const maxScroll = el.scrollWidth - el.clientWidth;
      const current = el.scrollLeft;

      if (current >= maxScroll && directionRef.current === 1) {
        directionRef.current = -1;
        pauseUntil = timestamp + PAUSE_MS;
      } else if (current <= 0 && directionRef.current === -1) {
        directionRef.current = 1;
        pauseUntil = timestamp + PAUSE_MS;
      }

      const delta = timestamp - lastTime;
      lastTime = timestamp;
      const move = (speedPx * delta) / 16; // normalize to ~60fps
      el.scrollLeft += directionRef.current * move;

      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame((t) => {
      lastTime = t;
      step(t);
    });

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [boardRef, enabled, speedPx]);

  // Pause on hover
  const handleMouseEnter = useCallback(() => {
    pauseRef.current = true;
  }, []);
  const handleMouseLeave = useCallback(() => {
    pauseRef.current = false;
  }, []);

  return { handleMouseEnter, handleMouseLeave };
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [board, setBoard] = useState<BoardState>({ columns: [], cards: [] });
  const [connected, setConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(1);
  const [cardModal, setCardModal] = useState<{
    open: boolean;
    card?: Card;
    columnId: string;
  }>({ open: false, columnId: "" });
  const [columnModal, setColumnModal] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollSpeed, setScrollSpeed] = useState(0.8);

  const boardRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("board:init", (state: BoardState) => {
      setBoard(state);
    });

    socket.on("board:updated", (state: BoardState) => {
      setBoard({ ...state });
    });

    socket.on("card:added", (card: Card) => {
      setBoard((prev) => ({ ...prev, cards: [...prev.cards, card] }));
    });

    socket.on("card:edited", (updated: Card) => {
      setBoard((prev) => ({
        ...prev,
        cards: prev.cards.map((c) => (c.id === updated.id ? updated : c)),
      }));
    });

    socket.on("card:deleted", ({ id }: { id: string }) => {
      setBoard((prev) => ({
        ...prev,
        cards: prev.cards.filter((c) => c.id !== id),
      }));
    });

    // Poll connected user count
    const pollUsers = () => {
      fetch("/api/health")
        .then((r) => r.json())
        .then((d) => setConnectedUsers(d.connectedUsers))
        .catch(() => {});
    };
    const interval = setInterval(pollUsers, 5000);
    pollUsers();

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  const { handleMouseEnter, handleMouseLeave } = useAutoScroll(
    boardRef,
    autoScroll,
    scrollSpeed
  );

  // ── Drag & drop handler ───────────────────────────────────────────────────
  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      const socket = socketRef.current;
      if (!socket) return;

      if (source.droppableId === destination.droppableId) {
        // Reorder within same column
        const colCards = board.cards
          .filter((c) => c.columnId === source.droppableId)
          .sort((a, b) => a.order - b.order);

        const reordered = [...colCards];
        const [moved] = reordered.splice(source.index, 1);
        reordered.splice(destination.index, 0, moved);

        socket.emit("card:reorder", {
          columnId: source.droppableId,
          orderedIds: reordered.map((c) => c.id),
        });

        // Optimistic update
        setBoard((prev) => {
          const others = prev.cards.filter(
            (c) => c.columnId !== source.droppableId
          );
          return {
            ...prev,
            cards: [
              ...others,
              ...reordered.map((c, idx) => ({ ...c, order: idx })),
            ],
          };
        });
      } else {
        // Move to different column
        const destCards = board.cards
          .filter((c) => c.columnId === destination.droppableId)
          .sort((a, b) => a.order - b.order);

        socket.emit("card:move", {
          id: draggableId,
          toColumnId: destination.droppableId,
          newOrder: destination.index,
        });

        // Optimistic update
        setBoard((prev) => {
          const cards = prev.cards.map((c) => {
            if (c.id === draggableId) {
              return { ...c, columnId: destination.droppableId, order: destination.index };
            }
            if (
              c.columnId === destination.droppableId &&
              c.order >= destination.index
            ) {
              return { ...c, order: c.order + 1 };
            }
            return c;
          });
          return { ...prev, cards };
        });
      }
    },
    [board.cards]
  );

  // ── Card CRUD ─────────────────────────────────────────────────────────────
  const openAddCard = (columnId: string) => {
    setCardModal({ open: true, columnId });
  };

  const openEditCard = (card: Card) => {
    setCardModal({ open: true, card, columnId: card.columnId });
  };

  const handleSaveCard = (data: Omit<Card, "id" | "columnId" | "order">) => {
    const socket = socketRef.current;
    if (!socket) return;

    if (cardModal.card) {
      socket.emit("card:edit", { id: cardModal.card.id, ...data });
    } else {
      socket.emit("card:add", { columnId: cardModal.columnId, ...data });
    }
    setCardModal({ open: false, columnId: "" });
  };

  const handleDeleteCard = (id: string) => {
    if (!window.confirm("このカードを削除しますか?")) return;
    socketRef.current?.emit("card:delete", { id });
  };

  // ── Column CRUD ───────────────────────────────────────────────────────────
  const handleAddColumn = (title: string) => {
    socketRef.current?.emit("column:add", { title });
    setColumnModal(false);
  };

  const handleDeleteColumn = (id: string) => {
    if (!window.confirm("この列（含むカード全て）を削除しますか?")) return;
    socketRef.current?.emit("column:delete", { id });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const sortedColumns = [...board.columns].sort((a, b) => a.order - b.order);

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <span className="header-logo">📋</span>
          <h1 className="header-title">Kanban Board</h1>
          <span className={`status-dot ${connected ? "status-dot--online" : "status-dot--offline"}`} />
          <span className="status-text">
            {connected ? "接続中" : "切断"}
          </span>
          <span className="user-count">👥 {connectedUsers}</span>
        </div>
        <div className="header-right">
          <label className="autoscroll-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            自動スクロール
          </label>
          {autoScroll && (
            <label className="speed-control">
              速度
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                className="speed-slider"
              />
            </label>
          )}
          <button className="btn btn-primary" onClick={() => setColumnModal(true)}>
            + 列を追加
          </button>
        </div>
      </header>

      {/* ── Board ──────────────────────────────────────────────────────── */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div
          className="board"
          ref={boardRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {sortedColumns.map((column) => {
            const colCards = board.cards.filter(
              (c) => c.columnId === column.id
            );
            return (
              <ColumnItem
                key={column.id}
                column={column}
                cards={colCards}
                onAddCard={openAddCard}
                onEditCard={openEditCard}
                onDeleteCard={handleDeleteCard}
                onDeleteColumn={handleDeleteColumn}
              />
            );
          })}
          {sortedColumns.length === 0 && (
            <div className="empty-board">
              <p>列がありません。「+ 列を追加」から始めましょう。</p>
            </div>
          )}
        </div>
      </DragDropContext>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {cardModal.open && (
        <CardModal
          card={cardModal.card}
          onSave={handleSaveCard}
          onClose={() => setCardModal({ open: false, columnId: "" })}
        />
      )}
      {columnModal && (
        <ColumnModal
          onSave={handleAddColumn}
          onClose={() => setColumnModal(false)}
        />
      )}
    </div>
  );
}
