FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/socket-server/package.json packages/socket-server/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages/api ./packages/api
COPY packages/db ./packages/db
COPY packages/socket-server ./packages/socket-server
COPY apps/web ./apps/web
COPY package.json tsconfig.json turbo.json ./

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3001
CMD ["bun", "run", "packages/api/src/index.ts"]
