# ---- Stage 1: build frontend (Vue) ----
FROM node:20-alpine AS builder
WORKDIR /frontend
# Use pnpm
RUN corepack enable && corepack prepare pnpm@9.7.1 --activate

# deps
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# source
COPY frontend/ ./
# build (use your existing script; or `pnpm vite build` if you disabled type-check)
RUN pnpm build

# ---- Stage 2: runtime (Nginx only) ----
FROM nginx:alpine
# your Nginx config (serves SPA + proxies /api)
COPY nginx/nginx.conf /etc/nginx/nginx.conf
# clean default site
RUN rm -rf /usr/share/nginx/html/*
# copy only built artifacts
COPY --from=builder /frontend/dist/ /usr/share/nginx/html/
