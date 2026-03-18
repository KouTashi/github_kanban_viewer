const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

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

// ─── Configuration ────────────────────────────────────────────────────────────
// Can be set via environment variables or overridden at runtime via POST /api/config

let githubToken = process.env.GITHUB_TOKEN ?? "";
let githubProjectUrl = process.env.GITHUB_PROJECT_URL ?? "";
let pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS ?? "300000", 10);

let pollTimerHandle = null;

// ─── Parse GitHub project URL ─────────────────────────────────────────────────
function parseProjectUrl(url) {
  if (!url) return null;

  // https://github.com/orgs/ORG/projects/NUM
  const orgMatch = url.match(/github\.com\/orgs\/([^/]+)\/projects\/(\d+)/);
  if (orgMatch) {
    return { ownerType: "org", owner: orgMatch[1], number: parseInt(orgMatch[2], 10) };
  }

  // https://github.com/users/USER/projects/NUM
  const userMatch = url.match(/github\.com\/users\/([^/]+)\/projects\/(\d+)/);
  if (userMatch) {
    return { ownerType: "user", owner: userMatch[1], number: parseInt(userMatch[2], 10) };
  }

  // https://github.com/USER/projects/NUM (treated as user project)
  const shortMatch = url.match(/github\.com\/([^/]+)\/projects\/(\d+)/);
  if (shortMatch) {
    return { ownerType: "user", owner: shortMatch[1], number: parseInt(shortMatch[2], 10) };
  }

  return null;
}

// ─── GitHub GraphQL API ────────────────────────────────────────────────────────
async function githubGraphQL(query, variables, token) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.errors?.length) {
    throw new Error(data.errors[0].message);
  }

  return data.data;
}

const PROJECT_FRAGMENT = `
  title
  url
  fields(first: 30) {
    nodes {
      ... on ProjectV2SingleSelectField {
        id
        name
        options {
          id
          name
          color
        }
      }
    }
  }
  items(first: 100) {
    nodes {
      id
      fieldValues(first: 30) {
        nodes {
          ... on ProjectV2ItemFieldSingleSelectValue {
            name
            optionId
            field {
              ... on ProjectV2FieldCommon {
                name
              }
            }
          }
        }
      }
      content {
        __typename
        ... on Issue {
          title
          number
          url
          body
          state
          labels(first: 10) {
            nodes { name color }
          }
          assignees(first: 5) {
            nodes { login avatarUrl }
          }
        }
        ... on PullRequest {
          title
          number
          url
          body
          state
          labels(first: 10) {
            nodes { name color }
          }
          assignees(first: 5) {
            nodes { login avatarUrl }
          }
        }
        ... on DraftIssue {
          title
          body
          assignees(first: 5) {
            nodes { login avatarUrl }
          }
        }
      }
    }
  }
`;

const ORG_QUERY = `
  query GetOrgProject($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) {
        ${PROJECT_FRAGMENT}
      }
    }
  }
`;

const USER_QUERY = `
  query GetUserProject($user: String!, $number: Int!) {
    user(login: $user) {
      projectV2(number: $number) {
        ${PROJECT_FRAGMENT}
      }
    }
  }
`;

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_DESCRIPTION_LENGTH = 500;
const NO_STATUS_ID = "no-status";

let boardState = null;
let projectTitle = "";
let projectUrl = "";
let lastUpdated = null;
let fetchError = null;

// ─── Map GitHub Projects data to board format ─────────────────────────────────

function mapGitHubDataToBoard(projectData) {
  // Find the Status single-select field (prefer "Status" / "ステータス" by name)
  const statusField =
    projectData.fields.nodes.find(
      (f) => f && f.options && (f.name === "Status" || f.name === "ステータス")
    ) ?? projectData.fields.nodes.find((f) => f && f.options);

  // Build columns from the status options; fall back to a single "All Items" column
  const columns = statusField?.options?.length
    ? statusField.options.map((opt, idx) => ({
        id: opt.id,
        title: opt.name,
        color: opt.color ?? null,
        order: idx,
      }))
    : [{ id: "all", title: "All Items", color: null, order: 0 }];

  const singleColId = columns[0].id;

  // Build cards
  const cards = projectData.items.nodes.flatMap((item, idx) => {
    const content = item.content;
    if (!content) return [];

    // Determine the column from the Status field value
    let columnId = statusField ? NO_STATUS_ID : singleColId;
    if (statusField) {
      const sv = item.fieldValues.nodes.find(
        (fv) => fv?.field?.name === statusField.name
      );
      if (sv?.optionId) columnId = sv.optionId;
    }

    const rawLabels = content.labels?.nodes ?? [];
    const rawAssignees = content.assignees?.nodes ?? [];

    return [{
      id: item.id,
      columnId,
      title: content.title || "(無題)",
      description: content.body ? content.body.slice(0, MAX_DESCRIPTION_LENGTH) : "",
      labels: rawLabels.map((l) => ({ name: l.name, color: `#${l.color}` })),
      assignees: rawAssignees.map((a) => ({ login: a.login, avatarUrl: a.avatarUrl })),
      number: content.number ?? null,
      url: content.url ?? null,
      contentType: content.__typename ?? "DraftIssue",
      state: content.state ?? null,
      order: idx,
    }];
  });

  // Add a "No Status" column only when needed
  if (statusField && cards.some((c) => c.columnId === NO_STATUS_ID)) {
    columns.push({ id: NO_STATUS_ID, title: "No Status", color: null, order: columns.length });
  }

  // Re-index card orders per column using a position map to avoid mutation
  const positionMap = new Map();
  columns.forEach((col) => {
    cards
      .filter((c) => c.columnId === col.id)
      .forEach((c, i) => positionMap.set(c.id, i));
  });

  return {
    columns,
    cards: cards.map((c) => ({ ...c, order: positionMap.get(c.id) ?? c.order })),
  };
}

// ─── Fetch from GitHub ────────────────────────────────────────────────────────

async function fetchGitHubProject() {
  if (!githubToken) {
    fetchError = "GITHUB_TOKEN が設定されていません";
    io.emit("board:error", { error: fetchError });
    return;
  }

  const config = parseProjectUrl(githubProjectUrl);
  if (!config) {
    fetchError = "GITHUB_PROJECT_URL が設定されていないか無効です";
    io.emit("board:error", { error: fetchError });
    return;
  }

  try {
    let projectData;
    if (config.ownerType === "org") {
      const data = await githubGraphQL(ORG_QUERY, { org: config.owner, number: config.number }, githubToken);
      projectData = data.organization?.projectV2;
    } else {
      const data = await githubGraphQL(USER_QUERY, { user: config.owner, number: config.number }, githubToken);
      projectData = data.user?.projectV2;
    }

    if (!projectData) {
      fetchError = "プロジェクトが見つかりませんでした";
      io.emit("board:error", { error: fetchError });
      return;
    }

    projectTitle = projectData.title;
    projectUrl = projectData.url;
    boardState = mapGitHubDataToBoard(projectData);
    lastUpdated = new Date().toISOString();
    fetchError = null;

    io.emit("board:updated", { ...boardState, projectTitle, projectUrl, lastUpdated });
    console.log(`[GitHub] Fetched "${projectTitle}": ${boardState.columns.length} columns, ${boardState.cards.length} cards`);
  } catch (err) {
    fetchError = err.message;
    console.error("[GitHub] Fetch error:", err.message);
    io.emit("board:error", { error: fetchError });
  }
}

// ─── REST endpoints ────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    connectedUsers: io.engine.clientsCount,
    projectTitle,
    projectUrl,
    lastUpdated,
    error: fetchError,
    configured: !!githubToken && !!githubProjectUrl,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    configured: !!githubToken && !!githubProjectUrl,
    projectUrl: githubProjectUrl,
    pollIntervalMs,
  });
});

app.post("/api/config", async (req, res) => {
  const { token, projectUrl: url, pollIntervalMs: newInterval } = req.body;
  if (token) githubToken = String(token).trim();
  if (url) githubProjectUrl = String(url).trim();
  if (newInterval != null) {
    const parsed = parseInt(String(newInterval), 10);
    if (!isNaN(parsed) && parsed >= 5000) {
      pollIntervalMs = parsed;
      if (pollTimerHandle !== null) clearInterval(pollTimerHandle);
      pollTimerHandle = setInterval(fetchGitHubProject, pollIntervalMs);
    }
  }
  await fetchGitHubProject();
  res.json({ ok: true, error: fetchError, lastUpdated, pollIntervalMs });
});

app.post("/api/refresh", async (_req, res) => {
  await fetchGitHubProject();
  res.json({ ok: true, error: fetchError, lastUpdated });
});

// ─── Socket.io event handling ─────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  if (boardState) {
    socket.emit("board:init", { ...boardState, projectTitle, projectUrl, lastUpdated });
  } else {
    socket.emit("board:init", {
      columns: [],
      cards: [],
      projectTitle: "",
      projectUrl: "",
      lastUpdated: null,
      error: fetchError,
    });
    if (githubToken && githubProjectUrl) fetchGitHubProject();
  }

  socket.on("disconnect", () => {
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

// ─── Periodic polling ─────────────────────────────────────────────────────────

fetchGitHubProject();
pollTimerHandle = setInterval(fetchGitHubProject, pollIntervalMs);

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`GitHub Kanban Viewer backend listening on http://localhost:${PORT}`);
  if (!githubToken) console.warn("[!] GITHUB_TOKEN not set — use POST /api/config or set env var");
  if (!githubProjectUrl) console.warn("[!] GITHUB_PROJECT_URL not set — use POST /api/config or set env var");
});
