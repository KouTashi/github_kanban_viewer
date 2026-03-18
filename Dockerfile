# ─── Stage 1: Build frontend ─────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN npm install --prefix frontend
COPY frontend/ ./frontend/
RUN npm run build --prefix frontend

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY backend/package*.json ./backend/
RUN npm install --prefix backend --omit=dev

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 3001
ENV PORT=3001

CMD ["node", "backend/server.js"]
