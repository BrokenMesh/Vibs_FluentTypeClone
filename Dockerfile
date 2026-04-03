# Stage 1: Build frontend
FROM node:24-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_ADMIN_EMAIL=elkordhicham@gmail.com
ENV VITE_ADMIN_EMAIL=$VITE_ADMIN_EMAIL
RUN npm run build

# Stage 2: Production image
FROM node:24-slim AS production
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/fluenttype.db

EXPOSE 3000

# Persist the SQLite database on a volume
VOLUME ["/data"]

CMD ["node", "src/server.js"]
