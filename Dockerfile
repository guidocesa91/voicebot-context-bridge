FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm run build

FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist/
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/server.js"]
