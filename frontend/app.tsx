import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import "./styles.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Label {
  name: string;
  color: string; // hex including #
}

interface Assignee {
  login: string;
  avatarUrl: string;
}

interface Column {
  id: string;
  title: string;
  order: number;
  color?: string | null; // GitHub Projects status color enum (e.g. "GREEN")
}

interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string;
  labels: Label[];
  assignees: Assignee[];
  number?: number | null;
  url?: string | null;
  contentType?: "Issue" | "PullRequest" | "DraftIssue";
  state?: string | null;
  order: number;
}

interface BoardState {
  columns: Column[];
  cards: Card[];
  projectTitle?: string;
  projectUrl?: string;
  lastUpdated?: string | null;
  error?: string | null;
}

// Map GitHub Projects status color enum → CSS color
const COLUMN_COLOR_MAP: Record<string, string> = {
  RED: "#da3633",
  ORANGE: "#d18616",
  YELLOW: "#d29922",
  GREEN: "#3fb950",
  BLUE: "#388bfd",
  PURPLE: "#bc8cff",
  PINK: "#f778ba",
  GRAY: "#8b949e",
};

const getColumnColor = (color?: string | null): string =>
  color ? (COLUMN_COLOR_MAP[color] ?? "#8b949e") : "#8b949e";

// ─── Socket ────────────────────────────────────────────────────────────────────

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;

// Locale for date/time display (Japanese)
const DISPLAY_LOCALE = "ja-JP";

// ─── Settings Modal ───────────────────────────────────────────────────────────

interface SettingsModalProps {
  currentProjectUrl: string;
  onSave: (token: string, projectUrl: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
  saveError: string | null;
}

function SettingsModal({ currentProjectUrl, onSave, onClose, saving, saveError }: SettingsModalProps) {
  const [token, setToken] = useState("");
  const [projectUrl, setProjectUrl] = useState(currentProjectUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() && !projectUrl.trim()) return;
    onSave(token.trim(), projectUrl.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">⚙️ GitHub Project 設定</h3>
        <form onSubmit={handleSubmit}>
          <label className="modal-label">
            GitHub Project URL
            <input
              className="modal-input"
              type="url"
              value={projectUrl}
              onChange={(e) => setProjectUrl(e.target.value)}
              placeholder="https://github.com/orgs/YOUR_ORG/projects/1"
              required
              autoFocus
            />
            <span className="modal-hint">
              形式: https://github.com/orgs/ORG/projects/N または https://github.com/users/USER/projects/N
            </span>
          </label>
          <label className="modal-label">
            GitHub Personal Access Token
            <input
              className="modal-input"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_..."
              autoComplete="off"
            />
            <span className="modal-hint">
              スコープ: <code>read:project</code>（プライベートリポジトリの場合は <code>repo</code> も必要）
            </span>
          </label>
          {saveError && <div className="modal-error">{saveError}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "取得中…" : "保存して取得"}
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
}

const CONTENT_TYPE_ICON: Record<string, string> = {
  Issue: "●",
  PullRequest: "⬡",
  DraftIssue: "◌",
};

const STATE_COLOR: Record<string, string> = {
  OPEN: "#3fb950",
  CLOSED: "#f85149",
  MERGED: "#bc8cff",
};

function CardItem({ card }: CardItemProps) {
  const typeIcon = CONTENT_TYPE_ICON[card.contentType ?? "DraftIssue"] ?? "◌";
  const stateColor = card.state ? (STATE_COLOR[card.state] ?? "#8b949e") : undefined;

  return (
    <div className="card">
      <div className="card-meta">
        <span
          className="card-type-icon"
          style={{ color: stateColor ?? "#8b949e" }}
          title={card.state ?? card.contentType}
        >
          {typeIcon}
        </span>
        {card.number != null && (
          <span className="card-number">#{card.number}</span>
        )}
        {card.url && (
          <a
            className="card-link"
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            title="GitHubで開く"
            onClick={(e) => e.stopPropagation()}
          >
            ↗
          </a>
        )}
      </div>

      <div className="card-title">{card.title}</div>

      {card.description && (
        <div className="card-description">{card.description}</div>
      )}

      {card.labels.length > 0 && (
        <div className="card-labels">
          {card.labels.map((lbl) => (
            <span
              key={lbl.name}
              className="card-label"
              style={{ backgroundColor: lbl.color }}
            >
              {lbl.name}
            </span>
          ))}
        </div>
      )}

      {card.assignees.length > 0 && (
        <div className="card-assignees">
          {card.assignees.map((a) => (
            <span key={a.login} className="card-assignee-item" title={a.login}>
              {a.avatarUrl ? (
                <img
                  className="card-avatar"
                  src={a.avatarUrl}
                  alt={a.login}
                  loading="lazy"
                />
              ) : (
                <span className="card-avatar card-avatar--fallback">
                  {a.login.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Column Component ─────────────────────────────────────────────────────────

interface ColumnItemProps {
  column: Column;
  cards: Card[];
}

function ColumnItem({ column, cards }: ColumnItemProps) {
  const sortedCards = [...cards].sort((a, b) => a.order - b.order);
  const colColor = getColumnColor(column.color);

  return (
    <div className="column">
      <div className="column-header">
        <span
          className="column-status-dot"
          style={{ backgroundColor: colColor }}
          title={column.color ?? undefined}
        />
        <span className="column-title">{column.title}</span>
        <span className="column-count">{cards.length}</span>
      </div>
      <div className="card-list">
        {sortedCards.map((card) => (
          <CardItem key={card.id} card={card} />
        ))}
      </div>
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
    const PAUSE_MS = 1500;
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
      const move = (speedPx * delta) / 16;
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

  const handleMouseEnter = useCallback(() => { pauseRef.current = true; }, []);
  const handleMouseLeave = useCallback(() => { pauseRef.current = false; }, []);

  return { handleMouseEnter, handleMouseLeave };
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [board, setBoard] = useState<BoardState>({ columns: [], cards: [] });
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollSpeed, setScrollSpeed] = useState(0.8);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

    socket.on("board:error", ({ error }: { error: string }) => {
      setBoard((prev) => ({ ...prev, error }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  const { handleMouseEnter, handleMouseLeave } = useAutoScroll(
    boardRef,
    autoScroll,
    scrollSpeed
  );

  // ── Settings save ─────────────────────────────────────────────────────────
  const handleSaveSettings = async (token: string, projectUrl: string) => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, projectUrl }),
      });
      const data = await res.json();
      if (data.error) {
        setSettingsError(data.error);
      } else {
        setSettingsOpen(false);
      }
    } catch {
      setSettingsError("サーバーへの接続に失敗しました");
    } finally {
      setSettingsSaving(false);
    }
  };

  // ── Manual refresh ────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      // ignore; board:error event will update the UI
    } finally {
      setRefreshing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const sortedColumns = [...board.columns].sort((a, b) => a.order - b.order);
  const isConfigured = board.columns.length > 0 || board.projectTitle;
  const lastUpdatedText = board.lastUpdated
    ? new Date(board.lastUpdated).toLocaleString(DISPLAY_LOCALE)
    : null;

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <span className="header-logo">📋</span>
          {board.projectTitle ? (
            board.projectUrl ? (
              <a
                className="header-title header-title--link"
                href={board.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {board.projectTitle}
              </a>
            ) : (
              <h1 className="header-title">{board.projectTitle}</h1>
            )
          ) : (
            <h1 className="header-title">GitHub Kanban Viewer</h1>
          )}
          <span className={`status-dot ${connected ? "status-dot--online" : "status-dot--offline"}`} />
          <span className="status-text">{connected ? "接続中" : "切断"}</span>
          {lastUpdatedText && (
            <span className="last-updated" title={`最終取得: ${lastUpdatedText}`}>
              🕐 {lastUpdatedText}
            </span>
          )}
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
          <button
            className="btn btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            title="GitHubから再取得"
          >
            {refreshing ? "⟳ 取得中…" : "⟳ 更新"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setSettingsError(null); setSettingsOpen(true); }}
            title="GitHub Project を設定"
          >
            ⚙️ 設定
          </button>
        </div>
      </header>

      {/* ── Error / Setup banner ────────────────────────────────────────── */}
      {board.error && (
        <div className="error-banner">
          ⚠️ {board.error}
          {!isConfigured && (
            <button
              className="btn btn-primary error-banner-btn"
              onClick={() => { setSettingsError(null); setSettingsOpen(true); }}
            >
              ⚙️ 設定する
            </button>
          )}
        </div>
      )}

      {/* ── Board ──────────────────────────────────────────────────────── */}
      <div
        className="board"
        ref={boardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {sortedColumns.map((column) => {
          const colCards = board.cards.filter((c) => c.columnId === column.id);
          return (
            <ColumnItem
              key={column.id}
              column={column}
              cards={colCards}
            />
          );
        })}
        {sortedColumns.length === 0 && !board.error && (
          <div className="empty-board">
            <div className="empty-board-content">
              <p>GitHub Project が設定されていません。</p>
              <button
                className="btn btn-primary"
                onClick={() => { setSettingsError(null); setSettingsOpen(true); }}
              >
                ⚙️ 設定する
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Settings Modal ──────────────────────────────────────────────── */}
      {settingsOpen && (
        <SettingsModal
          currentProjectUrl={board.projectUrl ?? ""}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
          saving={settingsSaving}
          saveError={settingsError}
        />
      )}
    </div>
  );
}
