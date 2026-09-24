# ---- build the React client ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- runtime: API + static client ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 DB_FILE=/data/payflow.db
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:${PORT}/api/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "src/index.js"]
