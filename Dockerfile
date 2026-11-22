# Container image for any Docker host (Railway, Fly.io, a VPS…): builds the React app, then runs the API which serves it.
# Build:  docker build -t doable .
# Run:    docker run -p 5000:5000 --env-file server/.env -e NODE_ENV=production doable

# ---- Stage 1: build the React client ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: production server (only runtime dependencies) ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY --from=client /app/client/dist /app/client/dist

USER node
EXPOSE 5000
# Lets Docker/hosts restart the container if the API stops responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:${PORT:-5000}/api/health || exit 1
CMD ["node", "src/index.js"]
