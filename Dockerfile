# --- build ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
COPY client/package.json client/pnpm-lock.yaml client/
COPY server/package.json server/pnpm-lock.yaml server/.npmrc server/

RUN pnpm install --frozen-lockfile
RUN cd client && pnpm install --frozen-lockfile
RUN cd server && pnpm install --frozen-lockfile

# rebuild better-sqlite3 native addon explicitly
RUN cd server/node_modules/.pnpm/better-sqlite3@12.9.0/node_modules/better-sqlite3 \
 && npm rebuild

COPY . .

ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN cd client && pnpm run build

# compile the two TypeScript lib files to JS (devDeps still present)
RUN cd server && ./node_modules/.bin/tsc -p tsconfig.build.json

# prune to prod-only deps (native addon already built; pnpm --prod keeps it)
RUN cd server && pnpm install --frozen-lockfile --prod

# --- runtime ---
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app app \
 && mkdir -p /app/data && chown -R app:app /app

COPY --from=build --chown=app:app /app/server ./server

USER app
ENV NODE_ENV=production PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
