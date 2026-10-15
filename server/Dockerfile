FROM node:24.13.0-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/package.json
COPY app/package.json app/package.json
RUN pnpm install --frozen-lockfile --filter server --ignore-scripts
COPY server server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN pnpm --filter server prisma:generate && pnpm --filter server build

# shortcut: retain build tooling for versioned demo migrations; prune in a production pipeline.
FROM build AS runtime
ENV NODE_ENV=production
USER node
WORKDIR /workspace/server
EXPOSE 3000
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --config prisma7.config.ts && node dist/main.js"]
