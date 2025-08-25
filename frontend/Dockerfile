FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.7.1 --activate

# deps first for better caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# app sources
COPY . .
