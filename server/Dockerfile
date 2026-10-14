FROM node:24.13.0-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/package.json
COPY app/package.json app/package.json
RUN pnpm install --frozen-lockfile --filter server --ignore-scripts
COPY server server
RUN pnpm --filter server build

FROM node:24.13.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY server/package.json server/package.json
COPY app/package.json app/package.json
RUN pnpm install --frozen-lockfile --filter server --prod --ignore-scripts
COPY --from=build /workspace/server/dist server/dist
USER node
WORKDIR /workspace/server
EXPOSE 3000
CMD ["node", "dist/main.js"]
