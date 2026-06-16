FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY src/ ./src/

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3001
CMD ["bun", "src/index.ts"]
